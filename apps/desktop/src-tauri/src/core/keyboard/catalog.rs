use std::fmt;
use std::str::FromStr;

use anyhow::{anyhow, Result};

macro_rules! build_keybook {
    ($( $variant:ident => $label:literal, [$($alias:literal),* $(,)?]; )+) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub(crate) enum Key {
            $( $variant, )+
        }

        const CATALOG: &[KeyEntry] = &[
            $( KeyEntry {
                key: Key::$variant,
                label: $label,
                aliases: &[$($alias),*],
            }, )+
        ];
    };
}

struct KeyEntry {
    key: Key,
    label: &'static str,
    aliases: &'static [&'static str],
}

build_keybook! {
    A => "A", [];
    B => "B", [];
    C => "C", [];
    D => "D", [];
    E => "E", [];
    F => "F", [];
    G => "G", [];
    H => "H", [];
    I => "I", [];
    J => "J", [];
    K => "K", [];
    L => "L", [];
    M => "M", [];
    N => "N", [];
    O => "O", [];
    P => "P", [];
    Q => "Q", [];
    R => "R", [];
    S => "S", [];
    T => "T", [];
    U => "U", [];
    V => "V", [];
    W => "W", [];
    X => "X", [];
    Y => "Y", [];
    Z => "Z", [];
    Num0 => "0", ["num0"];
    Num1 => "1", ["num1"];
    Num2 => "2", ["num2"];
    Num3 => "3", ["num3"];
    Num4 => "4", ["num4"];
    Num5 => "5", ["num5"];
    Num6 => "6", ["num6"];
    Num7 => "7", ["num7"];
    Num8 => "8", ["num8"];
    Num9 => "9", ["num9"];
    F1 => "F1", [];
    F2 => "F2", [];
    F3 => "F3", [];
    F4 => "F4", [];
    F5 => "F5", [];
    F6 => "F6", [];
    F7 => "F7", [];
    F8 => "F8", [];
    F9 => "F9", [];
    F10 => "F10", [];
    F11 => "F11", [];
    F12 => "F12", [];
    F13 => "F13", [];
    F14 => "F14", [];
    F15 => "F15", [];
    F16 => "F16", [];
    F17 => "F17", [];
    F18 => "F18", [];
    F19 => "F19", [];
    F20 => "F20", [];
    Space => "Space", ["spacebar"];
    Return => "Return", ["enter"];
    Tab => "Tab", [];
    Escape => "Escape", ["esc"];
    Delete => "Delete", ["backspace"];
    ForwardDelete => "ForwardDelete", ["del"];
    Insert => "Insert", ["ins"];
    Home => "Home", [];
    End => "End", [];
    PageUp => "PageUp", [];
    PageDown => "PageDown", [];
    LeftArrow => "Left", ["leftarrow", "arrowleft"];
    RightArrow => "Right", ["rightarrow", "arrowright"];
    UpArrow => "Up", ["uparrow", "arrowup"];
    DownArrow => "Down", ["downarrow", "arrowdown"];
    Minus => "Minus", ["-"];
    Equal => "Equal", ["=", "equals"];
    LeftBracket => "LeftBracket", ["["];
    RightBracket => "RightBracket", ["]"];
    Backslash => "Backslash", ["\\"];
    Semicolon => "Semicolon", [";"];
    Quote => "Quote", ["'"];
    Comma => "Comma", [","];
    Period => "Period", ["."];
    Slash => "Slash", ["/"];
    Grave => "Grave", ["`", "backtick"];
    Keypad0 => "Keypad0", [];
    Keypad1 => "Keypad1", [];
    Keypad2 => "Keypad2", [];
    Keypad3 => "Keypad3", [];
    Keypad4 => "Keypad4", [];
    Keypad5 => "Keypad5", [];
    Keypad6 => "Keypad6", [];
    Keypad7 => "Keypad7", [];
    Keypad8 => "Keypad8", [];
    Keypad9 => "Keypad9", [];
    KeypadDecimal => "KeypadDecimal", ["keypad."];
    KeypadMultiply => "KeypadMultiply", ["keypad*"];
    KeypadPlus => "KeypadPlus", ["keypad+"];
    KeypadClear => "KeypadClear", [];
    KeypadDivide => "KeypadDivide", ["keypad/"];
    KeypadEnter => "KeypadEnter", [];
    KeypadMinus => "KeypadMinus", ["keypad-"];
    KeypadEquals => "KeypadEquals", ["keypad="];
    CapsLock => "CapsLock", ["caps"];
    MouseMiddle => "MouseMiddle", ["middleclick", "mouse3", "mb3"];
    MouseBack => "MouseBack", ["mouse4", "mb4", "xbutton1"];
    MouseForward => "MouseForward", ["mouse5", "mb5", "xbutton2"];
}

impl Key {
    fn entry(self) -> &'static KeyEntry {
        CATALOG
            .iter()
            .find(|entry| entry.key == self)
            .expect("every key variant must have keybook metadata")
    }
}

impl fmt::Display for Key {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.entry().label)
    }
}

impl FromStr for Key {
    type Err = anyhow::Error;

    fn from_str(input: &str) -> Result<Self> {
        let candidate = input.trim();
        CATALOG
            .iter()
            .find(|entry| entry.matches(candidate))
            .map(|entry| entry.key)
            .ok_or_else(|| anyhow!("Unknown key `{input}`"))
    }
}

impl KeyEntry {
    fn matches(&self, candidate: &str) -> bool {
        self.label.eq_ignore_ascii_case(candidate)
            || self
                .aliases
                .iter()
                .any(|alias| alias.eq_ignore_ascii_case(candidate))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_catalog_entry_round_trips_through_its_label() {
        for entry in CATALOG {
            assert_eq!(entry.label.parse::<Key>().unwrap(), entry.key);
            assert_eq!(entry.key.to_string(), entry.label);
            for alias in entry.aliases {
                assert_eq!(alias.parse::<Key>().unwrap(), entry.key);
            }
        }
    }

    #[test]
    fn punctuation_mouse_and_legacy_aliases_remain_available() {
        assert_eq!("\\".parse::<Key>().unwrap(), Key::Backslash);
        assert_eq!("arrowLeft".parse::<Key>().unwrap(), Key::LeftArrow);
        assert_eq!("xbutton2".parse::<Key>().unwrap(), Key::MouseForward);
        assert_eq!("keypad/".parse::<Key>().unwrap(), Key::KeypadDivide);
    }
}
