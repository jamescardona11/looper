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
    let state = RefCell::new(ModifierState::default());
    let run_loop = CFRunLoop::get_current();
    let pending_reenable = Arc::new(AtomicBool::new(false));
    let callback_reenable = Arc::clone(&pending_reenable);
    let can_block = !blocked.is_empty();
    let tap_options = if can_block {
        CGEventTapOptions::Default
    } else {
        CGEventTapOptions::ListenOnly
    };

    let tap = match CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::HeadInsertEventTap,
        tap_options,
        observed_event_types(),
        move |_, kind, event| {
            dispatch_event(
                kind,
                event,
                &state,
                &sender,
                &blocked,
                can_block,
                &callback_reenable,
            )
        },
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

#[derive(Default)]
struct ModifierState {
    held: Modifiers,
}

fn dispatch_event(
    kind: CGEventType,
    native: &CGEvent,
    state: &RefCell<ModifierState>,
    sender: &Sender<KeyEvent>,
    blocked: &BlockingHotkeys,
    can_block: bool,
    pending_reenable: &AtomicBool,
) -> CallbackResult {
    let Some(event) = decode_event(kind, native, state, pending_reenable) else {
        return CallbackResult::Keep;
    };
    let drop_native = can_block && should_block_event(blocked, &event);
    if should_forward_event(blocked, &event) {
        let _ = sender.try_send(event);
    }
    if drop_native {
        CallbackResult::Drop
    } else {
        CallbackResult::Keep
    }
}

fn decode_event(
    kind: CGEventType,
    native: &CGEvent,
    state: &RefCell<ModifierState>,
    pending_reenable: &AtomicBool,
) -> Option<KeyEvent> {
    match kind {
        CGEventType::KeyDown => keyboard_event(native, state, true),
        CGEventType::KeyUp => keyboard_event(native, state, false),
        CGEventType::FlagsChanged => modifier_event(native, state),
        CGEventType::OtherMouseDown => pointer_event(native, state, true),
        CGEventType::OtherMouseUp => pointer_event(native, state, false),
        CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
            state.borrow_mut().held = Modifiers::empty();
            pending_reenable.store(true, Ordering::Release);
            Some(KeyEvent {
                modifiers: Modifiers::empty(),
                key: None,
                is_key_down: false,
                changed_modifier: None,
                repeat: false,
            })
        }
        _ => None,
    }
}

fn keyboard_event(
    native: &CGEvent,
    state: &RefCell<ModifierState>,
    is_key_down: bool,
) -> Option<KeyEvent> {
    let code = native.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as CGKeyCode;
    Some(KeyEvent {
        modifiers: modifiers_for_key_event(state.borrow().held, native.get_flags()),
        key: key_from_keycode(code),
        is_key_down,
        changed_modifier: None,
        repeat: is_key_down
            && native.get_integer_value_field(EventField::KEYBOARD_EVENT_AUTOREPEAT) != 0,
    })
    .filter(|event| event.key.is_some())
}

fn pointer_event(
    native: &CGEvent,
    state: &RefCell<ModifierState>,
    is_key_down: bool,
) -> Option<KeyEvent> {
    let key = match native.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER) {
        2 => Key::MouseMiddle,
        3 => Key::MouseBack,
        4 => Key::MouseForward,
        _ => return None,
    };
    Some(KeyEvent {
        modifiers: modifiers_for_key_event(state.borrow().held, native.get_flags()),
        key: Some(key),
        is_key_down,
        changed_modifier: None,
        repeat: false,
    })
}

fn modifier_event(native: &CGEvent, state: &RefCell<ModifierState>) -> Option<KeyEvent> {
    let flags = native.get_flags();
    let code = native.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as CGKeyCode;
    if code == 0x39 {
        return Some(KeyEvent {
            modifiers: with_function_flag(state.borrow().held, flags),
            key: Some(Key::CapsLock),
            is_key_down: flags.contains(CGEventFlags::CGEventFlagAlphaShift),
            changed_modifier: None,
            repeat: false,
        });
    }

    let changed = modifier_from_keycode(code)?;
    let mut state = state.borrow_mut();
    let is_key_down = state.update(changed, flags);
    Some(KeyEvent {
        modifiers: with_function_flag(state.held, flags),
        key: None,
        is_key_down,
        changed_modifier: Some(changed),
        repeat: false,
    })
}

impl ModifierState {
    fn update(&mut self, changed: Modifiers, flags: CGEventFlags) -> bool {
        if changed == Modifiers::FN {
            return self.set(
                changed,
                flags.contains(CGEventFlags::CGEventFlagSecondaryFn),
            );
        }
        let Some((group_flag, sibling)) = modifier_group(changed) else {
            return self.set(changed, false);
        };
        if !flags.contains(group_flag) {
            self.held.remove(changed | sibling);
            return false;
        }
        if self.held.contains(changed) && self.held.contains(sibling) {
            self.held.remove(changed);
            return false;
        }
        self.held.insert(changed);
        true
    }

    fn set(&mut self, modifier: Modifiers, is_down: bool) -> bool {
        if is_down {
            self.held.insert(modifier);
        } else {
            self.held.remove(modifier);
        }
        is_down
    }
}

fn modifier_group(modifier: Modifiers) -> Option<(CGEventFlags, Modifiers)> {
    let groups = [
        (
            Modifiers::CMD_LEFT,
            Modifiers::CMD_RIGHT,
            CGEventFlags::CGEventFlagCommand,
        ),
        (
            Modifiers::SHIFT_LEFT,
            Modifiers::SHIFT_RIGHT,
            CGEventFlags::CGEventFlagShift,
        ),
        (
            Modifiers::CTRL_LEFT,
            Modifiers::CTRL_RIGHT,
            CGEventFlags::CGEventFlagControl,
        ),
        (
            Modifiers::OPT_LEFT,
            Modifiers::OPT_RIGHT,
            CGEventFlags::CGEventFlagAlternate,
        ),
    ];
    groups.into_iter().find_map(|(left, right, flag)| {
        if modifier == left {
            Some((flag, right))
        } else if modifier == right {
            Some((flag, left))
        } else {
            None
        }
    })
}

fn with_function_flag(mut modifiers: Modifiers, flags: CGEventFlags) -> Modifiers {
    if flags.contains(CGEventFlags::CGEventFlagSecondaryFn) {
        modifiers.insert(Modifiers::FN);
    } else {
        modifiers.remove(Modifiers::FN);
    }
    modifiers
}

fn modifiers_for_key_event(mut stored: Modifiers, flags: CGEventFlags) -> Modifiers {
    for (flag, left, right) in [
        (
            CGEventFlags::CGEventFlagCommand,
            Modifiers::CMD_LEFT,
            Modifiers::CMD_RIGHT,
        ),
        (
            CGEventFlags::CGEventFlagShift,
            Modifiers::SHIFT_LEFT,
            Modifiers::SHIFT_RIGHT,
        ),
        (
            CGEventFlags::CGEventFlagControl,
            Modifiers::CTRL_LEFT,
            Modifiers::CTRL_RIGHT,
        ),
        (
            CGEventFlags::CGEventFlagAlternate,
            Modifiers::OPT_LEFT,
            Modifiers::OPT_RIGHT,
        ),
    ] {
        reconcile_group(&mut stored, flags.contains(flag), left, right);
    }
    with_function_flag(stored, flags)
}

fn reconcile_group(state: &mut Modifiers, active: bool, left: Modifiers, right: Modifiers) {
    if active && !state.contains(left) && !state.contains(right) {
        state.insert(left);
    } else if !active {
        state.remove(left | right);
    }
}

fn modifier_from_keycode(code: CGKeyCode) -> Option<Modifiers> {
    [
        (0x37, Modifiers::CMD_LEFT),
        (0x36, Modifiers::CMD_RIGHT),
        (0x38, Modifiers::SHIFT_LEFT),
        (0x3C, Modifiers::SHIFT_RIGHT),
        (0x3B, Modifiers::CTRL_LEFT),
        (0x3E, Modifiers::CTRL_RIGHT),
        (0x3A, Modifiers::OPT_LEFT),
        (0x3D, Modifiers::OPT_RIGHT),
        (0x3F, Modifiers::FN),
    ]
    .into_iter()
    .find_map(|(candidate, modifier)| (candidate == code).then_some(modifier))
}

macro_rules! mac_key_catalog {
    ($( $code:path => $key:ident ),+ $(,)?) => {
        const MAC_KEYS: &[(CGKeyCode, Key)] = &[
            $(($code, Key::$key),)+
        ];
    };
}

mac_key_catalog! {
    KeyCode::ANSI_A => A, KeyCode::ANSI_B => B, KeyCode::ANSI_C => C,
    KeyCode::ANSI_D => D, KeyCode::ANSI_E => E, KeyCode::ANSI_F => F,
    KeyCode::ANSI_G => G, KeyCode::ANSI_H => H, KeyCode::ANSI_I => I,
    KeyCode::ANSI_J => J, KeyCode::ANSI_K => K, KeyCode::ANSI_L => L,
    KeyCode::ANSI_M => M, KeyCode::ANSI_N => N, KeyCode::ANSI_O => O,
    KeyCode::ANSI_P => P, KeyCode::ANSI_Q => Q, KeyCode::ANSI_R => R,
    KeyCode::ANSI_S => S, KeyCode::ANSI_T => T, KeyCode::ANSI_U => U,
    KeyCode::ANSI_V => V, KeyCode::ANSI_W => W, KeyCode::ANSI_X => X,
    KeyCode::ANSI_Y => Y, KeyCode::ANSI_Z => Z,
    KeyCode::ANSI_0 => Num0, KeyCode::ANSI_1 => Num1, KeyCode::ANSI_2 => Num2,
    KeyCode::ANSI_3 => Num3, KeyCode::ANSI_4 => Num4, KeyCode::ANSI_5 => Num5,
    KeyCode::ANSI_6 => Num6, KeyCode::ANSI_7 => Num7, KeyCode::ANSI_8 => Num8,
    KeyCode::ANSI_9 => Num9,
    KeyCode::F1 => F1, KeyCode::F2 => F2, KeyCode::F3 => F3, KeyCode::F4 => F4,
    KeyCode::F5 => F5, KeyCode::F6 => F6, KeyCode::F7 => F7, KeyCode::F8 => F8,
    KeyCode::F9 => F9, KeyCode::F10 => F10, KeyCode::F11 => F11, KeyCode::F12 => F12,
    KeyCode::F13 => F13, KeyCode::F14 => F14, KeyCode::F15 => F15, KeyCode::F16 => F16,
    KeyCode::F17 => F17, KeyCode::F18 => F18, KeyCode::F19 => F19, KeyCode::F20 => F20,
    KeyCode::SPACE => Space, KeyCode::RETURN => Return, KeyCode::TAB => Tab,
    KeyCode::ESCAPE => Escape, KeyCode::DELETE => Delete, KeyCode::FORWARD_DELETE => ForwardDelete,
    KeyCode::HOME => Home, KeyCode::END => End, KeyCode::PAGE_UP => PageUp,
    KeyCode::PAGE_DOWN => PageDown, KeyCode::LEFT_ARROW => LeftArrow,
    KeyCode::RIGHT_ARROW => RightArrow, KeyCode::UP_ARROW => UpArrow,
    KeyCode::DOWN_ARROW => DownArrow, KeyCode::ANSI_MINUS => Minus,
    KeyCode::ANSI_EQUAL => Equal, KeyCode::ANSI_LEFT_BRACKET => LeftBracket,
    KeyCode::ANSI_RIGHT_BRACKET => RightBracket, KeyCode::ANSI_BACKSLASH => Backslash,
    KeyCode::ANSI_SEMICOLON => Semicolon, KeyCode::ANSI_QUOTE => Quote,
    KeyCode::ANSI_COMMA => Comma, KeyCode::ANSI_PERIOD => Period,
    KeyCode::ANSI_SLASH => Slash, KeyCode::ANSI_GRAVE => Grave,
    KeyCode::ANSI_KEYPAD_0 => Keypad0, KeyCode::ANSI_KEYPAD_1 => Keypad1,
    KeyCode::ANSI_KEYPAD_2 => Keypad2, KeyCode::ANSI_KEYPAD_3 => Keypad3,
    KeyCode::ANSI_KEYPAD_4 => Keypad4, KeyCode::ANSI_KEYPAD_5 => Keypad5,
    KeyCode::ANSI_KEYPAD_6 => Keypad6, KeyCode::ANSI_KEYPAD_7 => Keypad7,
    KeyCode::ANSI_KEYPAD_8 => Keypad8, KeyCode::ANSI_KEYPAD_9 => Keypad9,
    KeyCode::ANSI_KEYPAD_DECIMAL => KeypadDecimal,
    KeyCode::ANSI_KEYPAD_MULTIPLY => KeypadMultiply,
    KeyCode::ANSI_KEYPAD_PLUS => KeypadPlus, KeyCode::ANSI_KEYPAD_CLEAR => KeypadClear,
    KeyCode::ANSI_KEYPAD_DIVIDE => KeypadDivide, KeyCode::ANSI_KEYPAD_ENTER => KeypadEnter,
    KeyCode::ANSI_KEYPAD_MINUS => KeypadMinus, KeyCode::ANSI_KEYPAD_EQUAL => KeypadEquals,
}

fn key_from_keycode(code: CGKeyCode) -> Option<Key> {
    MAC_KEYS
        .iter()
        .find_map(|(candidate, key)| (*candidate == code).then_some(*key))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn function_key_is_tracked_as_a_modifier() {
        assert_eq!(modifier_from_keycode(0x3F), Some(Modifiers::FN));
    }

    #[test]
    fn side_state_sequence_preserves_the_still_held_sibling() {
        let mut ledger = ModifierState {
            held: Modifiers::OPT_LEFT | Modifiers::OPT_RIGHT,
        };
        let released = ledger.update(Modifiers::OPT_RIGHT, CGEventFlags::CGEventFlagAlternate);

        assert!(!released);
        assert!(ledger.held.contains(Modifiers::OPT_LEFT));
        assert!(!ledger.held.contains(Modifiers::OPT_RIGHT));
    }

    #[test]
    fn stale_single_side_press_remains_pressed_until_the_group_flag_drops() {
        let mut ledger = ModifierState {
            held: Modifiers::OPT_RIGHT,
        };
        assert!(ledger.update(Modifiers::OPT_RIGHT, CGEventFlags::CGEventFlagAlternate));
        assert!(!ledger.update(Modifiers::OPT_RIGHT, CGEventFlags::empty()));
        assert!(ledger.held.is_empty());
    }

    #[test]
    fn key_event_flags_supply_a_non_sticky_left_side_fallback() {
        let stored = Modifiers::empty();
        let paste = modifiers_for_key_event(stored, CGEventFlags::CGEventFlagCommand);

        assert!(paste.contains(Modifiers::CMD_LEFT));
        assert!(stored.is_empty());
        assert!(modifiers_for_key_event(stored, CGEventFlags::empty()).is_empty());
    }

    #[test]
    fn native_key_catalog_has_unique_codes_and_expected_boundaries() {
        let unique: HashSet<_> = MAC_KEYS.iter().map(|(code, _)| *code).collect();
        assert_eq!(unique.len(), MAC_KEYS.len());
        assert_eq!(key_from_keycode(KeyCode::ANSI_A), Some(Key::A));
        assert_eq!(
            key_from_keycode(KeyCode::ANSI_KEYPAD_EQUAL),
            Some(Key::KeypadEquals)
        );
    }
}
