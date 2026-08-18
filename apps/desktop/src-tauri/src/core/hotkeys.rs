use std::collections::BTreeSet;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{anyhow, Result};
use crossbeam_channel::{select, unbounded, Receiver, Sender};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub(crate) use super::keyboard::Hotkey;
use super::keyboard::{
    blocking_hotkeys, empty_blocking_hotkeys, Key, KeyEvent, KeyboardListener, Modifiers,
};
use crate::{pill, AppRuntime};

pub(crate) const SHORTCUT_CAPTURE_EVENT: &str = "shortcut:capture";
const WORKER_STOP_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HotkeyState {
    Pressed,
    Released,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ShortcutAction {
    Smart,
    Hold,
    Toggle,
    Workflow,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct ShortcutOptions {
    pub temporary: bool,
    pub cleanup_enabled: bool,
    pub workflow_rule_index: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct RegisteredHotkey {
    pub hotkey: Hotkey,
    pub action: ShortcutAction,
    pub options: ShortcutOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum ShortcutCapturePayload {
    Preview { shortcut: String },
    Captured { shortcut: String },
    Error { message: String },
}

#[derive(Default)]
pub(crate) struct HotkeyCoordinator {
    registration: Mutex<Option<WorkerLease>>,
    capture: Mutex<Option<WorkerLease>>,
}

impl HotkeyCoordinator {
    pub(crate) fn replace_registrations(
        &self,
        app: &AppHandle<AppRuntime>,
        bindings: Vec<RegisteredHotkey>,
    ) -> Result<()> {
        self.stop_registration();
        if bindings.is_empty() {
            return Ok(());
        }

        let blocked = blocking_hotkeys(bindings.iter().map(|binding| binding.hotkey).collect());
        let listener = KeyboardListener::new(blocked)?;
        let app = app.clone();
        let worker = WorkerLease::spawn("shortcut-registration", move |stop| {
            registration_loop(stop, listener, bindings, |action, state, options| {
                pill::handle_registered_hotkey_event(&app, action, state, options);
            });
            Ok(())
        })?;
        *self.registration.lock() = Some(worker);
        Ok(())
    }

    pub(crate) fn stop_registration(&self) {
        self.registration.lock().take();
    }

    pub(crate) fn start_capture(&self, app: &AppHandle<AppRuntime>) -> Result<()> {
        self.stop_capture();
        let listener = KeyboardListener::new(empty_blocking_hotkeys()).map_err(|error| {
            let message = error.to_string();
            emit_capture_event(
                app,
                ShortcutCapturePayload::Error {
                    message: message.clone(),
                },
            );
            anyhow!(message)
        })?;

        let app = app.clone();
        let worker = WorkerLease::spawn("shortcut-capture", move |stop| {
            capture_loop(stop, listener, |payload| emit_capture_event(&app, payload));
            Ok(())
        })?;
        *self.capture.lock() = Some(worker);
        Ok(())
    }

    pub(crate) fn stop_capture(&self) {
        self.capture.lock().take();
    }
}

fn registration_loop(
    stop: Receiver<()>,
    listener: KeyboardListener,
    bindings: Vec<RegisteredHotkey>,
    mut dispatch: impl FnMut(ShortcutAction, HotkeyState, ShortcutOptions),
) {
    let mut state = BindingState::new(bindings);
    loop {
        select! {
            recv(stop) -> _ => break,
            recv(listener.events()) -> received => {
                let Ok(event) = received else { break };
                for (action, edge, options) in state.process(event) {
                    dispatch(action, edge, options);
                }
            }
        }
    }
    for (action, edge, options) in state.release_all() {
        dispatch(action, edge, options);
    }
}

fn capture_loop(
    stop: Receiver<()>,
    listener: KeyboardListener,
    mut emit: impl FnMut(ShortcutCapturePayload),
) {
    let mut gesture = GestureState::default();
    loop {
        select! {
            recv(stop) -> _ => break,
            recv(listener.events()) -> received => {
                let Ok(event) = received else { break };
                match gesture.process(event) {
                    GestureOutcome::Idle => {}
                    GestureOutcome::Preview(hotkey) => emit(ShortcutCapturePayload::Preview {
                        shortcut: hotkey.to_string(),
                    }),
                    GestureOutcome::Captured(hotkey) => {
                        emit(ShortcutCapturePayload::Captured { shortcut: hotkey.to_string() });
                        break;
                    }
                    GestureOutcome::Invalid(message) => {
                        emit(ShortcutCapturePayload::Error { message: message.to_owned() });
                        break;
                    }
                }
            }
        }
    }
}

struct BindingState {
    bindings: Vec<RegisteredHotkey>,
    pressed: BTreeSet<usize>,
}

impl BindingState {
    fn new(bindings: Vec<RegisteredHotkey>) -> Self {
        Self {
            bindings,
            pressed: BTreeSet::new(),
        }
    }

    fn process(&mut self, event: KeyEvent) -> Vec<(ShortcutAction, HotkeyState, ShortcutOptions)> {
        if event.releases_everything() {
            return self.release_all();
        }

        let releasing: Vec<_> = self
            .pressed
            .iter()
            .copied()
            .filter(|id| should_release(self.bindings[*id].hotkey, event))
            .collect();
        let mut signals = Vec::new();
        for id in releasing {
            self.pressed.remove(&id);
            signals.push(self.signal(id, HotkeyState::Released));
        }

        if event.is_key_down && !event.repeat {
            for id in 0..self.bindings.len() {
                let binding = self.bindings[id];
                if binding.hotkey.matches_event(&event)
                    && (self.pressed.insert(id) || recovers_toggle(binding, event))
                {
                    signals.push(self.signal(id, HotkeyState::Pressed));
                }
            }
        }
        signals
    }

    fn signal(
        &self,
        id: usize,
        state: HotkeyState,
    ) -> (ShortcutAction, HotkeyState, ShortcutOptions) {
        let binding = self.bindings[id];
        (binding.action, state, binding.options)
    }

    fn release_all(&mut self) -> Vec<(ShortcutAction, HotkeyState, ShortcutOptions)> {
        let ids: Vec<_> = self.pressed.iter().copied().collect();
        self.pressed.clear();
        ids.into_iter()
            .filter(|id| *id < self.bindings.len())
            .map(|id| self.signal(id, HotkeyState::Released))
            .collect()
    }
}

fn should_release(hotkey: Hotkey, event: KeyEvent) -> bool {
    let modifiers_are_held = if hotkey.key.is_none() {
        hotkey.modifiers.remains_held_during(event.modifiers)
    } else {
        hotkey.modifiers.matches(event.modifiers)
    };
    !modifiers_are_held || (hotkey.key.is_some() && !event.is_key_down && hotkey.key == event.key)
}

fn recovers_toggle(binding: RegisteredHotkey, event: KeyEvent) -> bool {
    matches!(
        binding.action,
        ShortcutAction::Smart | ShortcutAction::Toggle
    ) && binding.hotkey.key.is_none()
        && event
            .changed_modifier
            .is_some_and(|changed| event.modifiers == changed)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GestureOutcome {
    Idle,
    Preview(Hotkey),
    Captured(Hotkey),
    Invalid(&'static str),
}

#[derive(Default)]
struct GestureState {
    strongest: Option<Hotkey>,
    held_key: Option<Key>,
}

impl GestureState {
    fn process(&mut self, event: KeyEvent) -> GestureOutcome {
        if event.key == Some(Key::CapsLock) {
            return GestureOutcome::Invalid("CapsLock cannot be used as a recording shortcut");
        }
        self.update_key(event);
        if event.modifiers.is_empty() && self.held_key.is_none() {
            return self
                .strongest
                .take()
                .map(GestureOutcome::Captured)
                .unwrap_or(GestureOutcome::Idle);
        }

        let Ok(candidate) = Hotkey::new(event.modifiers, self.held_key) else {
            return GestureOutcome::Idle;
        };
        if self
            .strongest
            .is_some_and(|current| chord_rank(candidate) <= chord_rank(current))
        {
            return GestureOutcome::Idle;
        }
        self.strongest = Some(candidate);
        GestureOutcome::Preview(candidate)
    }

    fn update_key(&mut self, event: KeyEvent) {
        let Some(key) = event.key else { return };
        if event.is_key_down {
            self.held_key = Some(key);
        } else if self.held_key == Some(key) {
            self.held_key = None;
        }
    }
}

fn chord_rank(hotkey: Hotkey) -> (u32, u32) {
    (hotkey.modifiers.count(), u32::from(hotkey.key.is_some()))
}

fn emit_capture_event(app: &AppHandle<AppRuntime>, payload: ShortcutCapturePayload) {
    if let Err(error) = app.emit(SHORTCUT_CAPTURE_EVENT, payload) {
        tracing::error!("Failed to emit shortcut capture event: {error}");
    }
}

struct WorkerLease {
    stop: Sender<()>,
    worker: Option<JoinHandle<()>>,
    name: String,
}

impl WorkerLease {
    fn spawn(
        name: &str,
        task: impl FnOnce(Receiver<()>) -> Result<()> + Send + 'static,
    ) -> Result<Self> {
        let (stop, receive_stop) = unbounded();
        let worker = thread::Builder::new()
            .name(name.to_owned())
            .spawn(move || {
                if let Err(error) = task(receive_stop) {
                    tracing::error!("Hotkey worker exited with error: {error}");
                }
            })
            .map_err(|error| anyhow!("Failed to spawn hotkey worker: {error}"))?;
        Ok(Self {
            stop,
            worker: Some(worker),
            name: name.to_owned(),
        })
    }
}

impl Drop for WorkerLease {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        let Some(worker) = self.worker.take() else {
            return;
        };
        let name = self.name.clone();
        let (finished, observe_finished) = crossbeam_channel::bounded(1);
        match thread::Builder::new()
            .name(format!("{name}-join"))
            .spawn(move || {
                let _ = worker.join();
                let _ = finished.send(());
            }) {
            Ok(_) => {
                let watch_name = name.clone();
                let _ = thread::Builder::new()
                    .name(format!("{name}-watch"))
                    .spawn(move || {
                        if observe_finished.recv_timeout(WORKER_STOP_TIMEOUT).is_err() {
                            tracing::error!("Hotkey worker `{watch_name}` did not stop within 2s");
                        }
                    });
            }
            Err(error) => {
                tracing::error!("Failed to spawn hotkey worker `{name}` join thread: {error}");
            }
        }
    }
}

pub(crate) fn parse_shortcut(shortcut: &str) -> Result<Hotkey> {
    normalize_stored_shortcut(shortcut)
        .parse()
        .map_err(|error| anyhow!("Shortcut `{shortcut}` is invalid: {error}"))
}

pub(crate) fn validate_recording_shortcut(shortcut: &Hotkey) -> Result<()> {
    if shortcut.key == Some(Key::CapsLock) {
        Err(anyhow!("CapsLock cannot be used as a recording shortcut"))
    } else {
        Ok(())
    }
}

fn normalize_stored_shortcut(shortcut: &str) -> String {
    shortcut
        .split('+')
        .filter_map(normalize_token)
        .collect::<Vec<_>>()
        .join("+")
}

fn normalize_token(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.to_ascii_lowercase();
    let canonical = match normalized.as_str() {
        "commandorcontrol" | "commandorctrl" | "cmdorctrl" | "cmdorcontrol" => {
            if cfg!(target_os = "macos") {
                "Cmd"
            } else {
                "Ctrl"
            }
        }
        "command" | "cmd" | "meta" | "win" | "windows" => "Cmd",
        "control" | "ctrl" => "Ctrl",
        "alt" | "option" | "opt" => "Opt",
        "shift" => "Shift",
        "leftcommand" => "CmdLeft",
        "rightcommand" => "CmdRight",
        "leftcontrol" => "CtrlLeft",
        "rightcontrol" => "CtrlRight",
        "leftalt" | "leftoption" => "OptLeft",
        "rightalt" | "rightoption" => "OptRight",
        "leftshift" => "ShiftLeft",
        "rightshift" => "ShiftRight",
        "delete" => "ForwardDelete",
        "arrowleft" => "Left",
        "arrowright" => "Right",
        "arrowup" => "Up",
        "arrowdown" => "Down",
        "spacebar" => "Space",
        _ => return Some(trimmed.to_owned()),
    };
    Some(canonical.to_owned())
}

pub(crate) fn shortcuts_conflict(left: &Hotkey, right: &Hotkey) -> bool {
    left == right || modifier_prefix(left, right) || modifier_prefix(right, left)
}

fn modifier_prefix(prefix: &Hotkey, full: &Hotkey) -> bool {
    if prefix.key.is_some() || prefix.modifiers.is_empty() {
        return false;
    }
    let groups_are_subset = [
        (Modifiers::CMD_LEFT, Modifiers::CMD_RIGHT),
        (Modifiers::CTRL_LEFT, Modifiers::CTRL_RIGHT),
        (Modifiers::OPT_LEFT, Modifiers::OPT_RIGHT),
        (Modifiers::SHIFT_LEFT, Modifiers::SHIFT_RIGHT),
    ]
    .into_iter()
    .all(|(left, right)| group_is_included(prefix.modifiers, full.modifiers, left, right));

    groups_are_subset
        && (!prefix.modifiers.contains(Modifiers::FN) || full.modifiers.contains(Modifiers::FN))
        && (full.key.is_some() || prefix.modifiers != full.modifiers)
}

fn group_is_included(
    prefix: Modifiers,
    full: Modifiers,
    left: Modifiers,
    right: Modifiers,
) -> bool {
    match (prefix.contains(left), prefix.contains(right)) {
        (false, false) => true,
        (true, true) => full.contains(left) || full.contains(right),
        (true, false) => full.contains(left),
        (false, true) => full.contains(right),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn event(modifiers: Modifiers, key: Option<Key>, is_key_down: bool) -> KeyEvent {
        KeyEvent {
            modifiers,
            key,
            is_key_down,
            changed_modifier: None,
            repeat: false,
        }
    }

    fn binding(hotkey: Hotkey, action: ShortcutAction) -> RegisteredHotkey {
        RegisteredHotkey {
            hotkey,
            action,
            options: ShortcutOptions::default(),
        }
    }

    fn signal(
        action: ShortcutAction,
        state: HotkeyState,
    ) -> Vec<(ShortcutAction, HotkeyState, ShortcutOptions)> {
        vec![(action, state, ShortcutOptions::default())]
    }

    #[test]
    fn keyed_shortcut_emits_one_press_and_releases_when_modifiers_drop() {
        let mut state = BindingState::new(vec![binding(
            Hotkey::new(Modifiers::CTRL, Key::Space).unwrap(),
            ShortcutAction::Hold,
        )]);

        assert_eq!(
            state.process(event(Modifiers::CTRL_LEFT, Some(Key::Space), true)),
            signal(ShortcutAction::Hold, HotkeyState::Pressed)
        );
        assert!(state
            .process(KeyEvent {
                modifiers: Modifiers::CTRL_LEFT,
                key: Some(Key::Space),
                is_key_down: true,
                changed_modifier: None,
                repeat: true,
            })
            .is_empty());
        assert_eq!(
            state.process(event(Modifiers::empty(), None, false)),
            signal(ShortcutAction::Hold, HotkeyState::Released)
        );
    }

    fn modifier_only_press() -> KeyEvent {
        KeyEvent {
            modifiers: Modifiers::OPT_RIGHT,
            key: None,
            is_key_down: true,
            changed_modifier: Some(Modifiers::OPT_RIGHT),
            repeat: false,
        }
    }

    #[test]
    fn hold_deduplicates_modifier_press_but_smart_and_toggle_recover_it() {
        let mut hold = BindingState::new(vec![binding(
            Hotkey::new(Modifiers::OPT_RIGHT, None).unwrap(),
            ShortcutAction::Hold,
        )]);
        assert_eq!(
            hold.process(modifier_only_press()),
            signal(ShortcutAction::Hold, HotkeyState::Pressed)
        );
        assert!(hold.process(modifier_only_press()).is_empty());

        for action in [ShortcutAction::Toggle, ShortcutAction::Smart] {
            let mut state = BindingState::new(vec![binding(
                Hotkey::new(Modifiers::OPT_RIGHT, None).unwrap(),
                action,
            )]);
            assert_eq!(
                state.process(modifier_only_press()),
                signal(action, HotkeyState::Pressed)
            );
            assert_eq!(
                state.process(modifier_only_press()),
                signal(action, HotkeyState::Pressed)
            );
        }
    }

    #[test]
    fn modifier_only_hold_survives_unrelated_modifier_sequence() {
        let mut state = BindingState::new(vec![binding(
            Hotkey::new(Modifiers::FN, None).unwrap(),
            ShortcutAction::Hold,
        )]);
        let fn_edge = |modifiers, changed, is_key_down| KeyEvent {
            modifiers,
            key: None,
            is_key_down,
            changed_modifier: Some(changed),
            repeat: false,
        };

        assert_eq!(
            state.process(fn_edge(Modifiers::FN, Modifiers::FN, true)),
            signal(ShortcutAction::Hold, HotkeyState::Pressed)
        );
        assert!(state
            .process(fn_edge(
                Modifiers::FN | Modifiers::CMD_LEFT,
                Modifiers::CMD_LEFT,
                true,
            ))
            .is_empty());
        assert!(state
            .process(fn_edge(Modifiers::FN, Modifiers::CMD_LEFT, false))
            .is_empty());
        assert_eq!(
            state.process(fn_edge(Modifiers::empty(), Modifiers::FN, false)),
            signal(ShortcutAction::Hold, HotkeyState::Released)
        );
    }

    #[test]
    fn capture_commits_the_strongest_chord_after_every_part_is_released() {
        let mut capture = GestureState::default();
        assert_eq!(
            capture.process(event(Modifiers::CTRL_LEFT, None, true)),
            GestureOutcome::Preview(Hotkey::new(Modifiers::CTRL_LEFT, None).unwrap())
        );
        assert_eq!(
            capture.process(event(Modifiers::CTRL_LEFT, Some(Key::Space), true)),
            GestureOutcome::Preview(Hotkey::new(Modifiers::CTRL_LEFT, Key::Space).unwrap())
        );
        assert_eq!(
            capture.process(event(Modifiers::CTRL_LEFT, Some(Key::Space), false)),
            GestureOutcome::Idle
        );
        assert_eq!(
            capture.process(event(Modifiers::empty(), None, false)),
            GestureOutcome::Captured(Hotkey::new(Modifiers::CTRL_LEFT, Key::Space).unwrap())
        );
    }

    #[test]
    fn caps_lock_capture_and_validation_keep_the_same_error() {
        let mut capture = GestureState::default();
        assert_eq!(
            capture.process(event(Modifiers::empty(), Some(Key::CapsLock), true)),
            GestureOutcome::Invalid("CapsLock cannot be used as a recording shortcut")
        );
        assert_eq!(
            validate_recording_shortcut(&Hotkey::new(Modifiers::empty(), Key::CapsLock).unwrap())
                .unwrap_err()
                .to_string(),
            "CapsLock cannot be used as a recording shortcut"
        );
    }

    #[test]
    fn legacy_normalization_and_conflict_rules_keep_side_semantics() {
        assert_eq!(
            parse_shortcut("leftAlt+Delete").unwrap().to_string(),
            "OptLeft+ForwardDelete"
        );
        let prefix = parse_shortcut("CtrlRight").unwrap();
        let same_side = parse_shortcut("CtrlRight+Space").unwrap();
        let other_side = parse_shortcut("CtrlLeft+Space").unwrap();
        assert!(shortcuts_conflict(&prefix, &same_side));
        assert!(!shortcuts_conflict(&prefix, &other_side));
        assert!(shortcuts_conflict(
            &parse_shortcut("Ctrl").unwrap(),
            &other_side
        ));
    }

    #[test]
    fn capture_payload_keeps_the_existing_tagged_wire_shape() {
        let preview = ShortcutCapturePayload::Preview {
            shortcut: "Ctrl+Space".to_owned(),
        };
        let error = ShortcutCapturePayload::Error {
            message: "permission required".to_owned(),
        };

        assert_eq!(
            serde_json::to_value(preview).unwrap(),
            json!({"kind": "preview", "shortcut": "Ctrl+Space"})
        );
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            json!({"kind": "error", "message": "permission required"})
        );
    }
}
