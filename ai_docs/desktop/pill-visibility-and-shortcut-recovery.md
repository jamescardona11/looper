# Capture pill: visibility and shortcut recovery

The desktop owns one native overlay window. On macOS it joins every Space,
including fullscreen Spaces; it is not duplicated once per physical monitor.
Dock mode uses the selected edge of the cursor's display when restored. Floating
mode retains the chosen position. “Show Capture Pill”, available in the tray and
macOS app menus, recovers the idle launcher on the cursor's display without Fn.

## Window transitions

Idle restoration and hover resize run on the main thread. Native size and origin
are applied in one AppKit frame mutation before the hover state is published.
The current native frame and Tauri coordinates are read together when that
mutation executes, not before it is queued. Destination coordinates use the
explicit destination monitor scale, so moving between Retina and standard
screens does not divide the target position by the previous screen's scale.

Space changes reassert the panel's all-Spaces/fullscreen behavior and visibility,
without selecting another dock anchor or changing its size. Already visible idle
windows are not shown again during ordinary frame updates.

## Drag position persistence

Rust owns the drag from native handoff through release. The mouse button state,
queried by the existing hover loop, detects release even when the webview loses
pointer-up. A held button never expires after ten seconds. On the main thread,
the final native frame is converted to a canonical anchor and published as
`pill:position` before hover can resize the window again.

React stores that confirmed anchor and restores it on mount. It no longer infers
drag duration, debounces window moves or distinguishes automatic moves through
DOM events. A late restore response cannot overwrite a newer drag. Dictation
uses the same drag handoff for its rail and controls.

The pill geometry/lifecycle suite passed 42 Rust tests; the affected React suites
passed 33 tests, with desktop lint and build passing. Native pointer movement
still needs verification: the previous Computer Use attempt on the NSPanel
returned `noWindowsAvailable`.

## Shortcut readiness

`HotkeyCoordinator` serializes configuration, editing, permission recovery and
worker replacement. Permission watchers, manual retry and status polling use the
same recovery operation; only explicitly finishing editing stops its worker.
Configuration changes made during editing are retained for the next registration.
A failed restore can be retried, while a healthy listener is left running.

The compact launcher and meeting pill share a serial status refresh. It checks
Accessibility and the actual shortcut worker. Missing access stops the listener;
a subsequent refresh restores configured shortcuts after permission is granted.
Shortcut editing is left alone, and disabled shortcuts remain disabled. A failed
native check is shown as unavailable, not ready. The refresh continues after
success so later permission revocation is detectable.

The Fn control shows a warning icon while unavailable. Clicking checks actual
Accessibility again and opens the macOS Accessibility pane directly when denied,
without navigating Looper back to Privacy. If access is granted but the shortcut
remains unavailable, in-app Privacy provides troubleshooting. Dictate remains a
separate mouse action. The meeting warning never replaces Stop.

## Menu fallback

The tray starts with dictation, meeting recording, and Show Capture Pill. Language,
microphone, model selection/status, and pill layout live under Capture Settings.
Recent transcriptions remain directly available; updates move beside Open Looper.

Dictation menu actions reuse the pill's mouse start and finish commands, without
requiring the Fn listener. Start and Stop use separate IDs so a stale selection
cannot accidentally toggle a new recording. Pill state transitions update only the dictation action in the existing native
menus; processing and active meetings disable starting another dictation. Failures
are reported through the existing toast surface.

Tauri menu callbacks are global, including callbacks registered on a tray. macOS
dispatches shared actions only through its app handler; the tray handler owns
Open/Quit there. Windows dispatches through the tray handler. Registering both
handlers for the same action would execute a selection twice.

Both native menus use the same microphone rows and selection action. A discovery
failure keeps System Default available. Selecting a device preserves save → menu
refresh → settings:changed and records the existing settings analytics. Ordinary
dictation transitions do not enumerate devices or rebuild unrelated menu entries.

## Verification boundaries

Frontend tests cover denial, recovery, later revocation, failed status reads,
unmount during an outstanding request, direct Privacy navigation, persistent
help, and mouse actions. Rust tests cover panel policy and a round trip between
screens with different pixel densities. The desktop frontend/Rust suites passed.

Native QA uses the separately signed `Looper QA.app`, preserving the installed
Looper app and its permissions. Actual denied Accessibility and the help button's
Privacy destination were verified. Physical Fn input with granted permission and
multiple physical displays still require a check on the affected setup before
calling the release blocker fully reproduced and resolved.

Menu fallback QA: the macOS application menu started a real capture with Fn
Accessibility unavailable, changed to Stop Dictation, stopped into processing,
and returned to Start Dictation. Show Capture Pill restored the visible compact
launcher. The Rust suite passed 841 tests (7 ignored), and both file-size checks
passed. The tray uses the same action handler; its popup layout and Windows native
interaction have not been visually verified in this run.

Permission navigation QA: clicking the denied Fn control opened System Settings
at Privacy & Security → Accessibility. No OS permissions were changed. Gateway,
pill, meeting overlay, and privacy tests passed (60 tests), plus desktop lint and
the signed QA build. This verifies navigation, not restored Fn access.

## Architecture refactor verification — 2026-09-07

RED → GREEN reproduced three failures before their fixes: a drag expiring while
held past ten seconds, permission recovery cancelling shortcut editing, and tray
microphone discovery errors removing System Default. Review found and reproduced
one additional case: retrying a failed restore after editing falsely succeeded;
the second attempt now installs the listener unless it is already healthy.

Final checks: 997 frontend tests; 850 desktop Rust tests (7 ignored); 43 audio
workspace tests (1 ignored); 79 looper-ts tests; desktop lint and the signed macOS
QA bundle passed. React Doctor reported 87/100 with existing complexity warnings
in MeetingCaptureOverlay and DictationPillOverlay; the newly scanned latter file
only disables declarative drag regions and adds no control-flow branches.

In the new QA bundle, the application menu started a real local dictation while
Fn lacked Accessibility, changed to Stop, stopped into processing and returned
to Start. Microphone entries remained available. Show Capture Pill restored the
compact launcher. The idle installed copy was closed to leave only QA running.

The native drag automation again returned `noWindowsAvailable` for the NSPanel;
physical long drags and monitor/Space changes need confirmation on the affected
setup. Physical Fn with granted access is also unverified. Windows cross-check
could not reach application compilation because this Mac lacks Windows SDK C
headers (`ring`: `assert.h` not found). These gaps are not release validation.

## Native tray deadlock reproduced during Dock QA

Switching to Left Center dock reproduced an actual app freeze after the preceding
unit suites passed. A native sample of QA process 16092 at 22:39 on 2026-09-07
showed the main thread blocked in `refresh_tray_menu` acquiring the tray mutex.
The meeting-awareness worker held that mutex in `refresh_calendar_tray_title`
and waited for the main thread to apply `TrayIcon::set_title`.

Both callers used `if let Some(tray) = state.tray.lock().clone()`: the temporary
mutex guard survived through the native UI call. `AppState::tray_handle` now
returns an owned handle and the mutex field is private, so the guard is released
before either caller can invoke Tauri. The frozen idle QA process was terminated
before rebuilding. This native failure is the RED evidence for the correction.

GREEN: the Rust suite passed (850 tests, 7 ignored), and the signed debug QA
bundle rebuilt successfully. In that rebuilt app, native menu actions changed
the pill through Right Center, Left Center, Top Center, Bottom Center, then
Floating between 22:48:55 and 22:50:18 on 2026-09-07. Each action returned a
responsive compact pill, spanning several 15-second calendar polling intervals.
The final screenshot showed the complete floating pill. This validates the
reproduced menu/calendar deadlock; it does not replace the physical drag,
monitor/Space, Fn permission, or Windows checks listed above.

## Platform-specific cursor coordinates

The locked Tao 0.35.3 implementation reports the macOS cursor in primary-display
scaled coordinates, but uses `GetCursorPos` directly on Windows. Applying the
macOS conversion on Windows displaced hit tests and could select the wrong
display when the primary and destination displays had different scale factors.

The conversion now lives in `platform/coordinates.rs`. Both pill hit testing and
cursor-based display selection use its native policy. Windows divides cursor
and frame by the same destination scale; macOS retains its primary/window scale
conversion. The prior macOS regression fixtures explicitly exercise that policy
on every test host.

RED: two regression tests failed with the original conversion. A physical cursor
at the center of a Windows pill produced local coordinates `(1496, 236)` instead
of `(48, 18)`; another fixture failed to locate the cursor inside the secondary
display. GREEN: both pass after the correction, along with the full Rust suite
(852 passed, 7 ignored) and desktop lint. These are calculation and source-contract
checks on macOS, not native Windows execution.

The signed QA bundle was rebuilt and relaunched as a single process. On macOS,
the complete compact pill rendered, the menu exposed Start Dictation and Show
Capture Pill, and switching Left Center → Floating kept the app responsive.
