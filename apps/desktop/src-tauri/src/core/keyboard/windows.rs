use std::cell::RefCell;
use std::thread;

use anyhow::{anyhow, Result};
use crossbeam_channel::Sender;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL,
    WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_QUIT, WM_SYSKEYDOWN,
    WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP, XBUTTON1, XBUTTON2,
};

use super::{
    should_block_event, should_forward_event, BlockingHotkeys, Key, KeyEvent, Modifiers,
    PlatformShutdown,
};

const EXTENDED_KEY: u32 = 0x01;

struct HookContext {
    events: Sender<KeyEvent>,
    held_modifiers: Modifiers,
    blocked: BlockingHotkeys,
}

struct RoutedEvent {
    event: KeyEvent,
    blocked: BlockingHotkeys,
    sender: Sender<KeyEvent>,
}

thread_local! {
    static CONTEXT: RefCell<Option<HookContext>> = const { RefCell::new(None) };
}

pub(super) fn start(
    sender: Sender<KeyEvent>,
    blocked: BlockingHotkeys,
) -> Result<PlatformShutdown> {
    let (ready_sender, ready_receiver) = std::sync::mpsc::sync_channel(1);
    let worker = thread::Builder::new()
        .name("looper-keyboard-windows".to_owned())
        .spawn(move || run_message_thread(sender, blocked, ready_sender))
        .map_err(|error| anyhow!("Failed to spawn Windows shortcut listener: {error}"))?;

    let thread_id = ready_receiver
        .recv()
        .map_err(|_| anyhow!("Windows shortcut listener exited during startup"))?
        .map_err(anyhow::Error::msg)?;

    Ok(PlatformShutdown::new(
        move || unsafe {
            let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        },
        worker,
    ))
}

fn run_message_thread(
    sender: Sender<KeyEvent>,
    blocked: BlockingHotkeys,
    ready: std::sync::mpsc::SyncSender<std::result::Result<u32, String>>,
) {
    CONTEXT.with(|slot| {
        *slot.borrow_mut() = Some(HookContext {
            events: sender,
            held_modifiers: Modifiers::empty(),
            blocked,
        });
    });

    let keyboard_hook =
        match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), None, 0) } {
            Ok(hook) => hook,
            Err(error) => {
                let _ = ready.send(Err(format!("Failed to install keyboard hook: {error}")));
                return;
            }
        };
    let mouse_hook = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), None, 0) }
        .map_err(|error| {
            tracing::warn!(
                "Failed to install mouse hook, mouse-button shortcuts disabled: {error}"
            );
        })
        .ok();

    let thread_id = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
    let _ = ready.send(Ok(thread_id));

    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.into() {
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    unsafe {
        if let Some(hook) = mouse_hook {
            let _ = UnhookWindowsHookEx(hook);
        }
        let _ = UnhookWindowsHookEx(keyboard_hook);
    }
    CONTEXT.with(|slot| *slot.borrow_mut() = None);
}

unsafe extern "system" fn keyboard_hook(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code < 0 {
        return unsafe { CallNextHookEx(None, code, message, data) };
    }
    let Some(is_key_down) = keyboard_edge(message.0 as u32) else {
        return unsafe { CallNextHookEx(None, code, message, data) };
    };
    let native = unsafe { &*(data.0 as *const KBDLLHOOKSTRUCT) };
    let routed = CONTEXT.with(|slot| {
        let mut context = slot.borrow_mut();
        let context = context.as_mut()?;
        let event = decode_keyboard(context, native, is_key_down)?;
        Some(snapshot_route(context, event))
    });
    finish_hook(code, message, data, routed)
}

unsafe extern "system" fn mouse_hook(code: i32, message: WPARAM, data: LPARAM) -> LRESULT {
    if code < 0 {
        return unsafe { CallNextHookEx(None, code, message, data) };
    }
    let raw_message = message.0 as u32;
    let Some(is_key_down) = mouse_edge(raw_message) else {
        return unsafe { CallNextHookEx(None, code, message, data) };
    };
    let native = unsafe { &*(data.0 as *const MSLLHOOKSTRUCT) };
    let Some(key) = mouse_button(raw_message, native.mouseData) else {
        return unsafe { CallNextHookEx(None, code, message, data) };
    };
    let routed = CONTEXT.with(|slot| {
        let context = slot.borrow();
        let context = context.as_ref()?;
        Some(snapshot_route(
            context,
            KeyEvent {
                modifiers: context.held_modifiers,
                key: Some(key),
                is_key_down,
                changed_modifier: None,
                repeat: false,
            },
        ))
    });
    finish_hook(code, message, data, routed)
}

fn finish_hook(code: i32, message: WPARAM, data: LPARAM, routed: Option<RoutedEvent>) -> LRESULT {
    let Some(routed) = routed else {
        return unsafe { CallNextHookEx(None, code, message, data) };
    };
    let block_native = should_block_event(&routed.blocked, &routed.event);
    if should_forward_event(&routed.blocked, &routed.event) {
        let _ = routed.sender.try_send(routed.event);
    }
    if block_native {
        LRESULT(1)
    } else {
        unsafe { CallNextHookEx(None, code, message, data) }
    }
}

fn snapshot_route(context: &HookContext, event: KeyEvent) -> RoutedEvent {
    RoutedEvent {
        event,
        blocked: context.blocked.clone(),
        sender: context.events.clone(),
    }
}

fn keyboard_edge(message: u32) -> Option<bool> {
    match message {
        WM_KEYDOWN | WM_SYSKEYDOWN => Some(true),
        WM_KEYUP | WM_SYSKEYUP => Some(false),
        _ => None,
    }
}

fn mouse_edge(message: u32) -> Option<bool> {
    match message {
        WM_MBUTTONDOWN | WM_XBUTTONDOWN => Some(true),
        WM_MBUTTONUP | WM_XBUTTONUP => Some(false),
        _ => None,
    }
}

fn mouse_button(message: u32, data: u32) -> Option<Key> {
    if matches!(message, WM_MBUTTONDOWN | WM_MBUTTONUP) {
        return Some(Key::MouseMiddle);
    }
    if !matches!(message, WM_XBUTTONDOWN | WM_XBUTTONUP) {
        return None;
    }
    match (data >> 16) as u16 {
        XBUTTON1 => Some(Key::MouseBack),
        XBUTTON2 => Some(Key::MouseForward),
        _ => None,
    }
}

fn decode_keyboard(
    context: &mut HookContext,
    native: &KBDLLHOOKSTRUCT,
    is_key_down: bool,
) -> Option<KeyEvent> {
    let virtual_key = VIRTUAL_KEY(native.vkCode as u16);
    let extended = native.flags.0 & EXTENDED_KEY != 0;
    if let Some(modifier) = modifier_for(virtual_key, native.scanCode, extended) {
        if is_key_down {
            context.held_modifiers.insert(modifier);
        } else {
            context.held_modifiers.remove(modifier);
        }
        return Some(KeyEvent {
            modifiers: context.held_modifiers,
            key: None,
            is_key_down,
            changed_modifier: Some(modifier),
            repeat: false,
        });
    }
    Some(KeyEvent {
        modifiers: context.held_modifiers,
        key: key_for(virtual_key, extended),
        is_key_down,
        changed_modifier: None,
        repeat: false,
    })
    .filter(|event| event.key.is_some())
}

fn modifier_for(key: VIRTUAL_KEY, scan_code: u32, extended: bool) -> Option<Modifiers> {
    let fixed = [
        (VK_LWIN, Modifiers::CMD_LEFT),
        (VK_RWIN, Modifiers::CMD_RIGHT),
        (VK_LSHIFT, Modifiers::SHIFT_LEFT),
        (VK_RSHIFT, Modifiers::SHIFT_RIGHT),
        (VK_LCONTROL, Modifiers::CTRL_LEFT),
        (VK_RCONTROL, Modifiers::CTRL_RIGHT),
        (VK_LMENU, Modifiers::OPT_LEFT),
        (VK_RMENU, Modifiers::OPT_RIGHT),
    ];
    if let Some((_, modifier)) = fixed.into_iter().find(|(candidate, _)| *candidate == key) {
        return Some(modifier);
    }
    match key {
        VK_SHIFT => Some(if scan_code == 0x36 {
            Modifiers::SHIFT_RIGHT
        } else {
            Modifiers::SHIFT_LEFT
        }),
        VK_CONTROL => Some(if extended {
            Modifiers::CTRL_RIGHT
        } else {
            Modifiers::CTRL_LEFT
        }),
        VK_MENU => Some(if extended {
            Modifiers::OPT_RIGHT
        } else {
            Modifiers::OPT_LEFT
        }),
        _ => None,
    }
}

macro_rules! windows_key_catalog {
    ($( $virtual_key:path => $key:ident ),+ $(,)?) => {
        const WINDOWS_KEYS: &[(VIRTUAL_KEY, Key)] = &[
            $(($virtual_key, Key::$key),)+
        ];
    };
}

windows_key_catalog! {
    VK_A => A, VK_B => B, VK_C => C, VK_D => D, VK_E => E, VK_F => F, VK_G => G,
    VK_H => H, VK_I => I, VK_J => J, VK_K => K, VK_L => L, VK_M => M, VK_N => N,
    VK_O => O, VK_P => P, VK_Q => Q, VK_R => R, VK_S => S, VK_T => T, VK_U => U,
    VK_V => V, VK_W => W, VK_X => X, VK_Y => Y, VK_Z => Z,
    VK_0 => Num0, VK_1 => Num1, VK_2 => Num2, VK_3 => Num3, VK_4 => Num4,
    VK_5 => Num5, VK_6 => Num6, VK_7 => Num7, VK_8 => Num8, VK_9 => Num9,
    VK_F1 => F1, VK_F2 => F2, VK_F3 => F3, VK_F4 => F4, VK_F5 => F5,
    VK_F6 => F6, VK_F7 => F7, VK_F8 => F8, VK_F9 => F9, VK_F10 => F10,
    VK_F11 => F11, VK_F12 => F12, VK_F13 => F13, VK_F14 => F14, VK_F15 => F15,
    VK_F16 => F16, VK_F17 => F17, VK_F18 => F18, VK_F19 => F19, VK_F20 => F20,
    VK_SPACE => Space, VK_TAB => Tab, VK_ESCAPE => Escape, VK_BACK => Delete,
    VK_DELETE => ForwardDelete, VK_INSERT => Insert, VK_HOME => Home, VK_END => End,
    VK_PRIOR => PageUp, VK_NEXT => PageDown, VK_LEFT => LeftArrow, VK_RIGHT => RightArrow,
    VK_UP => UpArrow, VK_DOWN => DownArrow, VK_OEM_MINUS => Minus, VK_OEM_PLUS => Equal,
    VK_OEM_4 => LeftBracket, VK_OEM_6 => RightBracket, VK_OEM_5 => Backslash,
    VK_OEM_1 => Semicolon, VK_OEM_7 => Quote, VK_OEM_COMMA => Comma,
    VK_OEM_PERIOD => Period, VK_OEM_2 => Slash, VK_OEM_3 => Grave,
    VK_NUMPAD0 => Keypad0, VK_NUMPAD1 => Keypad1, VK_NUMPAD2 => Keypad2,
    VK_NUMPAD3 => Keypad3, VK_NUMPAD4 => Keypad4, VK_NUMPAD5 => Keypad5,
    VK_NUMPAD6 => Keypad6, VK_NUMPAD7 => Keypad7, VK_NUMPAD8 => Keypad8,
    VK_NUMPAD9 => Keypad9, VK_DECIMAL => KeypadDecimal, VK_MULTIPLY => KeypadMultiply,
    VK_ADD => KeypadPlus, VK_CLEAR => KeypadClear, VK_DIVIDE => KeypadDivide,
    VK_SUBTRACT => KeypadMinus, VK_CAPITAL => CapsLock,
}

fn key_for(key: VIRTUAL_KEY, extended: bool) -> Option<Key> {
    if key == VK_RETURN {
        return Some(if extended {
            Key::KeypadEnter
        } else {
            Key::Return
        });
    }
    WINDOWS_KEYS
        .iter()
        .find_map(|(candidate, mapped)| (*candidate == key).then_some(*mapped))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn extended_keys_select_right_modifiers_and_keypad_enter() {
        assert_eq!(
            modifier_for(VK_CONTROL, 0, true),
            Some(Modifiers::CTRL_RIGHT)
        );
        assert_eq!(modifier_for(VK_MENU, 0, true), Some(Modifiers::OPT_RIGHT));
        assert_eq!(key_for(VK_RETURN, true), Some(Key::KeypadEnter));
        assert_eq!(key_for(VK_RETURN, false), Some(Key::Return));
    }

    #[test]
    fn virtual_key_catalog_has_no_duplicates() {
        let unique: HashSet<_> = WINDOWS_KEYS.iter().map(|(key, _)| key.0).collect();
        assert_eq!(unique.len(), WINDOWS_KEYS.len());
    }

    #[test]
    fn mouse_messages_keep_middle_back_and_forward_identity() {
        assert_eq!(mouse_button(WM_MBUTTONDOWN, 0), Some(Key::MouseMiddle));
        assert_eq!(
            mouse_button(WM_XBUTTONDOWN, u32::from(XBUTTON1) << 16),
            Some(Key::MouseBack)
        );
        assert_eq!(
            mouse_button(WM_XBUTTONUP, u32::from(XBUTTON2) << 16),
            Some(Key::MouseForward)
        );
    }
}
