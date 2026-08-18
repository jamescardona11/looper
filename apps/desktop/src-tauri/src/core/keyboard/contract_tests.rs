use std::str::FromStr;

use super::{blocking_hotkeys, empty_blocking_hotkeys, Hotkey, Key, KeyEvent, Modifiers};

fn event(modifiers: Modifiers, key: Option<Key>, is_key_down: bool) -> KeyEvent {
    KeyEvent {
        modifiers,
        key,
        is_key_down,
        repeat: false,
        changed_modifier: None,
    }
}

#[test]
fn parses_common_names_with_a_stable_label() {
    let shortcut = Hotkey::from_str("command + left shift + spacebar").unwrap();

    assert_eq!(shortcut.to_string(), "Cmd+ShiftLeft+Space");
    assert_eq!(
        Hotkey::from_str("CTRL+ArrowLeft").unwrap().to_string(),
        "Ctrl+Left"
    );
}

#[test]
fn rejects_empty_duplicate_incoherent_and_reserved_shortcuts() {
    for invalid in [
        "",
        "Cmd++Space",
        "Ctrl+Ctrl+K",
        "Cmd+CmdLeft+K",
        "CtrlLeft+CtrlRight+K",
        "CapsLock",
    ] {
        assert!(Hotkey::from_str(invalid).is_err(), "{invalid}");
    }
}

#[test]
fn generic_modifiers_match_either_side_but_do_not_allow_extras() {
    let shortcut = Hotkey::from_str("Cmd+Space").unwrap();

    assert!(shortcut.matches_event(&event(Modifiers::CMD_LEFT, Some(Key::Space), true)));
    assert!(shortcut.matches_event(&event(Modifiers::CMD_RIGHT, Some(Key::Space), true)));
    assert!(!shortcut.matches_event(&event(
        Modifiers::CMD_LEFT | Modifiers::SHIFT_LEFT,
        Some(Key::Space),
        true,
    )));
}

#[test]
fn blocking_registry_is_deduplicated_and_empty_registry_propagates() {
    let shortcut = Hotkey::from_str("Opt+F5").unwrap();
    let blocked = blocking_hotkeys(vec![shortcut, shortcut]);
    let press = event(Modifiers::OPT_LEFT, Some(Key::F5), true);

    assert_eq!(blocked.len(), 1);
    assert!(blocked.matches(&press));
    assert!(!empty_blocking_hotkeys().matches(&press));
}

#[test]
fn terminal_empty_release_is_detected() {
    assert!(event(Modifiers::empty(), None, false).releases_everything());
    assert!(!event(Modifiers::empty(), Some(Key::Space), false).releases_everything());
}
