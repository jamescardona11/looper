use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{anyhow, Result};
use core_foundation::base::TCFType;
use core_foundation::runloop::{
    kCFRunLoopDefaultMode, CFRunLoop, CFRunLoopRunResult, CFRunLoopWakeUp,
};
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CGKeyCode, CallbackResult, EventField, KeyCode,
};
use crossbeam_channel::Sender;

use super::{
    should_block_event, should_forward_event, BlockingHotkeys, Key, KeyEvent, Modifiers,
    PlatformShutdown,
};
use crate::permissions;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(2);
const RUN_LOOP_POLL: Duration = Duration::from_secs(1);

pub(super) fn start(
    sender: Sender<KeyEvent>,
    blocked: BlockingHotkeys,
) -> Result<PlatformShutdown> {
    if !permissions::check_accessibility_permission() {
        return Err(anyhow!(
            "Accessibility permission is required for global shortcuts"
        ));
    }

    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("looper-keyboard-macos".to_owned())
        .spawn(move || run_listener(sender, blocked, ready_sender))
        .map_err(|error| anyhow!("Failed to spawn macOS shortcut listener: {error}"))?;

    let run_loop = match ready_receiver.recv_timeout(STARTUP_TIMEOUT) {
        Ok(result) => result.map_err(anyhow::Error::msg)?,
        Err(RecvTimeoutError::Timeout) => {
            return Err(anyhow!("Timed out starting macOS shortcut listener"));
        }
        Err(RecvTimeoutError::Disconnected) => {
            return Err(anyhow!("macOS shortcut listener exited during startup"));
        }
    };

    Ok(PlatformShutdown::new(
        move || {
            run_loop.stop();
            unsafe { CFRunLoopWakeUp(run_loop.as_concrete_TypeRef()) };
        },
        worker,
    ))
}

fn run_listener(
    sender: Sender<KeyEvent>,
    blocked: BlockingHotkeys,
    ready: mpsc::SyncSender<std::result::Result<CFRunLoop, String>>,
) {
    let run_loop = CFRunLoop::get_current();
    let can_block = !blocked.is_empty();
    let tap_options = if can_block {
        CGEventTapOptions::Default
    } else {
        CGEventTapOptions::ListenOnly
    };
    let session = TapSession::new(sender, blocked, can_block);
    let pending_reenable = Arc::clone(&session.reenable);

    let tap = match CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::HeadInsertEventTap,
        tap_options,
        observed_event_types(),
        move |_, kind, event| session.dispatch(kind, event),
    ) {
        Ok(tap) => tap,
        Err(_) => {
            let _ = ready.send(Err(
                "Failed to create macOS event tap for global shortcuts".to_owned()
            ));
            return;
        }
    };

    let source = match tap.mach_port().create_runloop_source(0) {
        Ok(source) => source,
        Err(_) => {
            let _ = ready.send(Err(
                "Failed to create macOS shortcut listener run loop source".to_owned(),
            ));
            return;
        }
    };

    run_loop.add_source(&source, unsafe { kCFRunLoopDefaultMode });
    tap.enable();
    let _ = ready.send(Ok(run_loop.clone()));

    loop {
        let outcome = CFRunLoop::run_in_mode(unsafe { kCFRunLoopDefaultMode }, RUN_LOOP_POLL, true);
        if matches!(
            outcome,
            CFRunLoopRunResult::Stopped | CFRunLoopRunResult::Finished
        ) {
            break;
        }
        if pending_reenable.swap(false, Ordering::AcqRel) {
            tap.enable();
        }
    }
}

fn observed_event_types() -> Vec<CGEventType> {
    vec![
        CGEventType::KeyDown,
        CGEventType::KeyUp,
        CGEventType::FlagsChanged,
        CGEventType::OtherMouseDown,
        CGEventType::OtherMouseUp,
    ]
}

#[derive(Clone, Copy)]
enum NativeEvent {
    Keyboard {
        code: CGKeyCode,
        flags: CGEventFlags,
        down: bool,
        repeat: bool,
    },
    Pointer {
        button: i64,
        flags: CGEventFlags,
        down: bool,
    },
    Modifier {
        code: CGKeyCode,
        flags: CGEventFlags,
    },
    TapDisabled,
}

impl NativeEvent {
    fn read(kind: CGEventType, event: &CGEvent) -> Option<Self> {
        let flags = event.get_flags();
        match kind {
            CGEventType::KeyDown => Some(Self::Keyboard {
                code: event
                    .get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)
                    as CGKeyCode,
                flags,
                down: true,
                repeat: event
                    .get_integer_value_field(EventField::KEYBOARD_EVENT_AUTOREPEAT)
                    != 0,
            }),
            CGEventType::KeyUp => Some(Self::Keyboard {
                code: event
                    .get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)
                    as CGKeyCode,
                flags,
                down: false,
                repeat: false,
            }),
            CGEventType::OtherMouseDown => Some(Self::Pointer {
                button: event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER),
                flags,
                down: true,
            }),
            CGEventType::OtherMouseUp => Some(Self::Pointer {
                button: event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER),
                flags,
                down: false,
            }),
            CGEventType::FlagsChanged => Some(Self::Modifier {
                code: event
                    .get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE)
                    as CGKeyCode,
                flags,
            }),
            CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                Some(Self::TapDisabled)
            }
            _ => None,
        }
    }
}

struct TapSession {
    sender: Sender<KeyEvent>,
    blocked: BlockingHotkeys,
    can_block: bool,
    state: RefCell<KeyboardState>,
    reenable: Arc<AtomicBool>,
}

impl TapSession {
    fn new(sender: Sender<KeyEvent>, blocked: BlockingHotkeys, can_block: bool) -> Self {
        Self {
            sender,
            blocked,
            can_block,
            state: RefCell::new(KeyboardState::default()),
            reenable: Arc::new(AtomicBool::new(false)),
        }
    }

    fn dispatch(&self, kind: CGEventType, native: &CGEvent) -> CallbackResult {
        let Some(raw) = NativeEvent::read(kind, native) else {
            return CallbackResult::Keep;
        };
        let Some(event) = self.state.borrow_mut().translate(raw, &self.reenable) else {
            return CallbackResult::Keep;
        };
        if should_forward_event(&self.blocked, &event) {
            let _ = self.sender.try_send(event);
        }
        if self.can_block && should_block_event(&self.blocked, &event) {
            CallbackResult::Drop
        } else {
            CallbackResult::Keep
        }
    }
}

#[derive(Default)]
struct KeyboardState {
    held: Modifiers,
}

impl KeyboardState {
    fn translate(&mut self, event: NativeEvent, reenable: &AtomicBool) -> Option<KeyEvent> {
        match event {
            NativeEvent::Keyboard {
                code,
                flags,
                down,
                repeat,
            } => Some(KeyEvent {
                modifiers: self.effective_modifiers(flags),
                key: Some(key_from_keycode(code)?),
                is_key_down: down,
                changed_modifier: None,
                repeat: down && repeat,
            }),
            NativeEvent::Pointer {
                button,
                flags,
                down,
            } => Some(KeyEvent {
                modifiers: self.effective_modifiers(flags),
                key: Some(pointer_key(button)?),
                is_key_down: down,
                changed_modifier: None,
                repeat: false,
            }),
            NativeEvent::Modifier { code, flags } => self.modifier_event(code, flags),
            NativeEvent::TapDisabled => {
                self.held = Modifiers::empty();
                reenable.store(true, Ordering::Release);
                Some(KeyEvent {
                    modifiers: Modifiers::empty(),
                    key: None,
                    is_key_down: false,
                    changed_modifier: None,
                    repeat: false,
                })
            }
        }
    }

    fn modifier_event(&mut self, code: CGKeyCode, flags: CGEventFlags) -> Option<KeyEvent> {
        if code == CAPS_LOCK_CODE {
            return Some(KeyEvent {
                modifiers: with_function_flag(self.held, flags),
                key: Some(Key::CapsLock),
                is_key_down: flags.contains(CGEventFlags::CGEventFlagAlphaShift),
                changed_modifier: None,
                repeat: false,
            });
        }
        let changed = modifier_from_keycode(code)?;
        let is_key_down = self.apply_modifier(changed, flags);
        Some(KeyEvent {
            modifiers: with_function_flag(self.held, flags),
            key: None,
            is_key_down,
            changed_modifier: Some(changed),
            repeat: false,
        })
    }

    fn apply_modifier(&mut self, changed: Modifiers, flags: CGEventFlags) -> bool {
        if changed == Modifiers::FN {
            return self.set_modifier(
                changed,
                flags.contains(CGEventFlags::CGEventFlagSecondaryFn),
            );
        }
        let Some(family) = modifier_family(changed) else {
            return self.set_modifier(changed, false);
        };
        if !flags.contains(family.flag) {
            self.held.remove(family.left | family.right);
            return false;
        }
        if self.held.contains(changed) && self.held.contains(family.other(changed)) {
            self.held.remove(changed);
            return false;
        }
        self.held.insert(changed);
        true
    }

    fn set_modifier(&mut self, modifier: Modifiers, down: bool) -> bool {
        if down {
            self.held.insert(modifier);
        } else {
            self.held.remove(modifier);
        }
        down
    }

    fn effective_modifiers(&self, flags: CGEventFlags) -> Modifiers {
        let mut current = self.held;
        for family in MODIFIER_FAMILIES {
            sync_family(&mut current, flags.contains(family.flag), family.left, family.right);
        }
        with_function_flag(current, flags)
    }
}

#[derive(Clone, Copy)]
struct ModifierFamily {
    left: Modifiers,
    right: Modifiers,
    flag: CGEventFlags,
}

impl ModifierFamily {
    fn other(self, modifier: Modifiers) -> Modifiers {
        if modifier == self.left {
            self.right
        } else {
            self.left
        }
    }
}

const CAPS_LOCK_CODE: CGKeyCode = 0x39;
const MODIFIER_FAMILIES: [ModifierFamily; 4] = [
    ModifierFamily {
        left: Modifiers::CMD_LEFT,
        right: Modifiers::CMD_RIGHT,
        flag: CGEventFlags::CGEventFlagCommand,
    },
    ModifierFamily {
        left: Modifiers::SHIFT_LEFT,
        right: Modifiers::SHIFT_RIGHT,
        flag: CGEventFlags::CGEventFlagShift,
    },
    ModifierFamily {
        left: Modifiers::CTRL_LEFT,
        right: Modifiers::CTRL_RIGHT,
        flag: CGEventFlags::CGEventFlagControl,
    },
    ModifierFamily {
        left: Modifiers::OPT_LEFT,
        right: Modifiers::OPT_RIGHT,
        flag: CGEventFlags::CGEventFlagAlternate,
    },
];

fn modifier_family(modifier: Modifiers) -> Option<ModifierFamily> {
    MODIFIER_FAMILIES
        .into_iter()
        .find(|family| modifier == family.left || modifier == family.right)
}

fn with_function_flag(mut modifiers: Modifiers, flags: CGEventFlags) -> Modifiers {
    if flags.contains(CGEventFlags::CGEventFlagSecondaryFn) {
        modifiers.insert(Modifiers::FN);
    } else {
        modifiers.remove(Modifiers::FN);
    }
    modifiers
}

fn sync_family(state: &mut Modifiers, active: bool, left: Modifiers, right: Modifiers) {
    if active {
        if !state.contains(left) && !state.contains(right) {
            state.insert(left);
        }
    } else {
        state.remove(left | right);
    }
}

fn pointer_key(button: i64) -> Option<Key> {
    match button {
        2 => Some(Key::MouseMiddle),
        3 => Some(Key::MouseBack),
        4 => Some(Key::MouseForward),
        _ => None,
    }
}

fn modifier_from_keycode(code: CGKeyCode) -> Option<Modifiers> {
    const MODIFIER_CODES: &[(CGKeyCode, Modifiers)] = &[
        (0x37, Modifiers::CMD_LEFT),
        (0x36, Modifiers::CMD_RIGHT),
        (0x38, Modifiers::SHIFT_LEFT),
        (0x3C, Modifiers::SHIFT_RIGHT),
        (0x3B, Modifiers::CTRL_LEFT),
        (0x3E, Modifiers::CTRL_RIGHT),
        (0x3A, Modifiers::OPT_LEFT),
        (0x3D, Modifiers::OPT_RIGHT),
        (0x3F, Modifiers::FN),
    ];
    MODIFIER_CODES
        .iter()
        .find_map(|(candidate, modifier)| (*candidate == code).then_some(modifier))
        .copied()
}

const LETTER_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::ANSI_A, Key::A),
    (KeyCode::ANSI_B, Key::B),
    (KeyCode::ANSI_C, Key::C),
    (KeyCode::ANSI_D, Key::D),
    (KeyCode::ANSI_E, Key::E),
    (KeyCode::ANSI_F, Key::F),
    (KeyCode::ANSI_G, Key::G),
    (KeyCode::ANSI_H, Key::H),
    (KeyCode::ANSI_I, Key::I),
    (KeyCode::ANSI_J, Key::J),
    (KeyCode::ANSI_K, Key::K),
    (KeyCode::ANSI_L, Key::L),
    (KeyCode::ANSI_M, Key::M),
    (KeyCode::ANSI_N, Key::N),
    (KeyCode::ANSI_O, Key::O),
    (KeyCode::ANSI_P, Key::P),
    (KeyCode::ANSI_Q, Key::Q),
    (KeyCode::ANSI_R, Key::R),
    (KeyCode::ANSI_S, Key::S),
    (KeyCode::ANSI_T, Key::T),
    (KeyCode::ANSI_U, Key::U),
    (KeyCode::ANSI_V, Key::V),
    (KeyCode::ANSI_W, Key::W),
    (KeyCode::ANSI_X, Key::X),
    (KeyCode::ANSI_Y, Key::Y),
    (KeyCode::ANSI_Z, Key::Z),
];

const DIGIT_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::ANSI_0, Key::Num0),
    (KeyCode::ANSI_1, Key::Num1),
    (KeyCode::ANSI_2, Key::Num2),
    (KeyCode::ANSI_3, Key::Num3),
    (KeyCode::ANSI_4, Key::Num4),
    (KeyCode::ANSI_5, Key::Num5),
    (KeyCode::ANSI_6, Key::Num6),
    (KeyCode::ANSI_7, Key::Num7),
    (KeyCode::ANSI_8, Key::Num8),
    (KeyCode::ANSI_9, Key::Num9),
];

const FUNCTION_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::F1, Key::F1),
    (KeyCode::F2, Key::F2),
    (KeyCode::F3, Key::F3),
    (KeyCode::F4, Key::F4),
    (KeyCode::F5, Key::F5),
    (KeyCode::F6, Key::F6),
    (KeyCode::F7, Key::F7),
    (KeyCode::F8, Key::F8),
    (KeyCode::F9, Key::F9),
    (KeyCode::F10, Key::F10),
    (KeyCode::F11, Key::F11),
    (KeyCode::F12, Key::F12),
    (KeyCode::F13, Key::F13),
    (KeyCode::F14, Key::F14),
    (KeyCode::F15, Key::F15),
    (KeyCode::F16, Key::F16),
    (KeyCode::F17, Key::F17),
    (KeyCode::F18, Key::F18),
    (KeyCode::F19, Key::F19),
    (KeyCode::F20, Key::F20),
];

const NAVIGATION_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::HOME, Key::Home),
    (KeyCode::END, Key::End),
    (KeyCode::PAGE_UP, Key::PageUp),
    (KeyCode::PAGE_DOWN, Key::PageDown),
    (KeyCode::LEFT_ARROW, Key::LeftArrow),
    (KeyCode::RIGHT_ARROW, Key::RightArrow),
    (KeyCode::UP_ARROW, Key::UpArrow),
    (KeyCode::DOWN_ARROW, Key::DownArrow),
];

const PUNCTUATION_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::SPACE, Key::Space),
    (KeyCode::RETURN, Key::Return),
    (KeyCode::TAB, Key::Tab),
    (KeyCode::ESCAPE, Key::Escape),
    (KeyCode::DELETE, Key::Delete),
    (KeyCode::FORWARD_DELETE, Key::ForwardDelete),
    (KeyCode::ANSI_MINUS, Key::Minus),
    (KeyCode::ANSI_EQUAL, Key::Equal),
    (KeyCode::ANSI_LEFT_BRACKET, Key::LeftBracket),
    (KeyCode::ANSI_RIGHT_BRACKET, Key::RightBracket),
    (KeyCode::ANSI_BACKSLASH, Key::Backslash),
    (KeyCode::ANSI_SEMICOLON, Key::Semicolon),
    (KeyCode::ANSI_QUOTE, Key::Quote),
    (KeyCode::ANSI_COMMA, Key::Comma),
    (KeyCode::ANSI_PERIOD, Key::Period),
    (KeyCode::ANSI_SLASH, Key::Slash),
    (KeyCode::ANSI_GRAVE, Key::Grave),
];

const KEYPAD_KEYS: &[(CGKeyCode, Key)] = &[
    (KeyCode::ANSI_KEYPAD_0, Key::Keypad0),
    (KeyCode::ANSI_KEYPAD_1, Key::Keypad1),
    (KeyCode::ANSI_KEYPAD_2, Key::Keypad2),
    (KeyCode::ANSI_KEYPAD_3, Key::Keypad3),
    (KeyCode::ANSI_KEYPAD_4, Key::Keypad4),
    (KeyCode::ANSI_KEYPAD_5, Key::Keypad5),
    (KeyCode::ANSI_KEYPAD_6, Key::Keypad6),
    (KeyCode::ANSI_KEYPAD_7, Key::Keypad7),
    (KeyCode::ANSI_KEYPAD_8, Key::Keypad8),
    (KeyCode::ANSI_KEYPAD_9, Key::Keypad9),
    (KeyCode::ANSI_KEYPAD_DECIMAL, Key::KeypadDecimal),
    (KeyCode::ANSI_KEYPAD_MULTIPLY, Key::KeypadMultiply),
    (KeyCode::ANSI_KEYPAD_PLUS, Key::KeypadPlus),
    (KeyCode::ANSI_KEYPAD_CLEAR, Key::KeypadClear),
    (KeyCode::ANSI_KEYPAD_DIVIDE, Key::KeypadDivide),
    (KeyCode::ANSI_KEYPAD_ENTER, Key::KeypadEnter),
    (KeyCode::ANSI_KEYPAD_MINUS, Key::KeypadMinus),
    (KeyCode::ANSI_KEYPAD_EQUAL, Key::KeypadEquals),
];

const KEY_TABLES: &[&[(CGKeyCode, Key)]] = &[
    LETTER_KEYS,
    DIGIT_KEYS,
    FUNCTION_KEYS,
    NAVIGATION_KEYS,
    PUNCTUATION_KEYS,
    KEYPAD_KEYS,
];

fn key_from_keycode(code: CGKeyCode) -> Option<Key> {
    KEY_TABLES.iter().find_map(|table| {
        table
            .iter()
            .find_map(|(candidate, key)| (*candidate == code).then_some(*key))
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::sync::atomic::AtomicBool;

    use super::*;

    #[test]
    fn function_key_is_tracked_as_a_modifier() {
        assert_eq!(modifier_from_keycode(0x3F), Some(Modifiers::FN));
    }

    #[test]
    fn side_state_sequence_preserves_the_still_held_sibling() {
        let mut ledger = KeyboardState {
            held: Modifiers::OPT_LEFT | Modifiers::OPT_RIGHT,
        };
        let released = ledger.apply_modifier(Modifiers::OPT_RIGHT, CGEventFlags::CGEventFlagAlternate);

        assert!(!released);
        assert!(ledger.held.contains(Modifiers::OPT_LEFT));
        assert!(!ledger.held.contains(Modifiers::OPT_RIGHT));
    }

    #[test]
    fn stale_single_side_press_remains_pressed_until_the_group_flag_drops() {
        let mut ledger = KeyboardState {
            held: Modifiers::OPT_RIGHT,
        };
        assert!(ledger.apply_modifier(Modifiers::OPT_RIGHT, CGEventFlags::CGEventFlagAlternate));
        assert!(!ledger.apply_modifier(Modifiers::OPT_RIGHT, CGEventFlags::empty()));
        assert!(ledger.held.is_empty());
    }

    #[test]
    fn key_event_flags_supply_a_non_sticky_left_side_fallback() {
        let state = KeyboardState::default();
        let paste = state.effective_modifiers(CGEventFlags::CGEventFlagCommand);

        assert!(paste.contains(Modifiers::CMD_LEFT));
        assert!(state.held.is_empty());
        assert!(state.effective_modifiers(CGEventFlags::empty()).is_empty());
    }

    #[test]
    fn native_key_catalog_has_unique_codes_and_expected_boundaries() {
        let unique: HashSet<_> = KEY_TABLES
            .iter()
            .flat_map(|table| table.iter().map(|(code, _)| *code))
            .collect();
        let total = KEY_TABLES.iter().map(|table| table.len()).sum::<usize>();
        assert_eq!(unique.len(), total);
        assert_eq!(key_from_keycode(KeyCode::ANSI_A), Some(Key::A));
        assert_eq!(
            key_from_keycode(KeyCode::ANSI_KEYPAD_EQUAL),
            Some(Key::KeypadEquals)
        );
    }

    #[test]
    fn session_translation_keeps_key_and_pointer_events_in_one_contract() {
        let mut state = KeyboardState::default();
        let reenable = AtomicBool::new(false);
        let key = state
            .translate(
                NativeEvent::Keyboard {
                    code: KeyCode::ANSI_A,
                    flags: CGEventFlags::CGEventFlagCommand,
                    down: true,
                    repeat: false,
                },
                &reenable,
            )
            .unwrap();
        assert_eq!(key.key, Some(Key::A));
        assert!(key.modifiers.contains(Modifiers::CMD_LEFT));

        let pointer = state
            .translate(
                NativeEvent::Pointer {
                    button: 4,
                    flags: CGEventFlags::empty(),
                    down: false,
                },
                &reenable,
            )
            .unwrap();
        assert_eq!(pointer.key, Some(Key::MouseForward));
        assert!(!pointer.is_key_down);
    }

    #[test]
    fn disabled_tap_resets_state_and_requests_reenable() {
        let mut state = KeyboardState {
            held: Modifiers::CMD_LEFT | Modifiers::SHIFT_RIGHT,
        };
        let reenable = AtomicBool::new(false);
        let event = state
            .translate(NativeEvent::TapDisabled, &reenable)
            .unwrap();

        assert!(state.held.is_empty());
        assert!(reenable.load(Ordering::Acquire));
        assert!(event.key.is_none());
        assert!(!event.is_key_down);
    }
}
