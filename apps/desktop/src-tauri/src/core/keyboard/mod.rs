use std::fmt;
use std::ops::{BitAnd, BitAndAssign, BitOr, BitOrAssign, Not};
use std::str::FromStr;
use std::sync::Arc;
use std::thread::JoinHandle;

use anyhow::{anyhow, Result};
use crossbeam_channel::{unbounded, Receiver, Sender};

mod catalog;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub(crate) use catalog::Key;

pub(crate) type BlockingHotkeys = Arc<[Hotkey]>;

pub(crate) struct KeyboardListener {
    events: Receiver<KeyEvent>,
    platform: Option<PlatformShutdown>,
}

impl KeyboardListener {
    pub(crate) fn new(blocking_hotkeys: BlockingHotkeys) -> Result<Self> {
        let (sender, events) = unbounded();
        let platform = platform_start(sender, blocking_hotkeys)?;
        Ok(Self {
            events,
            platform: Some(platform),
        })
    }

    pub(crate) fn events(&self) -> &Receiver<KeyEvent> {
        &self.events
    }
}

impl Drop for KeyboardListener {
    fn drop(&mut self) {
        if let Some(platform) = self.platform.take() {
            platform.stop_and_join();
        }
    }
}

#[cfg(target_os = "macos")]
fn platform_start(sender: Sender<KeyEvent>, hotkeys: BlockingHotkeys) -> Result<PlatformShutdown> {
    macos::start(sender, hotkeys)
}

#[cfg(target_os = "windows")]
fn platform_start(sender: Sender<KeyEvent>, hotkeys: BlockingHotkeys) -> Result<PlatformShutdown> {
    windows::start(sender, hotkeys)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_start(
    _sender: Sender<KeyEvent>,
    _hotkeys: BlockingHotkeys,
) -> Result<PlatformShutdown> {
    Err(anyhow!(
        "Global shortcuts are supported on macOS and Windows only"
    ))
}

pub(crate) struct PlatformShutdown {
    request_stop: Box<dyn FnOnce() + Send + 'static>,
    worker: Option<JoinHandle<()>>,
}

impl PlatformShutdown {
    pub(crate) fn new(
        request_stop: impl FnOnce() + Send + 'static,
        worker: JoinHandle<()>,
    ) -> Self {
        Self {
            request_stop: Box::new(request_stop),
            worker: Some(worker),
        }
    }

    fn stop_and_join(mut self) {
        (self.request_stop)();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub(crate) struct Modifiers(u16);

#[derive(Clone, Copy)]
struct ModifierGroup {
    left: Modifiers,
    right: Modifiers,
    any_name: &'static str,
    left_name: &'static str,
    right_name: &'static str,
}

const MODIFIER_GROUPS: [ModifierGroup; 4] = [
    ModifierGroup {
        left: Modifiers::CTRL_LEFT,
        right: Modifiers::CTRL_RIGHT,
        any_name: "Ctrl",
        left_name: "CtrlLeft",
        right_name: "CtrlRight",
    },
    ModifierGroup {
        left: Modifiers::OPT_LEFT,
        right: Modifiers::OPT_RIGHT,
        any_name: "Opt",
        left_name: "OptLeft",
        right_name: "OptRight",
    },
    ModifierGroup {
        left: Modifiers::SHIFT_LEFT,
        right: Modifiers::SHIFT_RIGHT,
        any_name: "Shift",
        left_name: "ShiftLeft",
        right_name: "ShiftRight",
    },
    ModifierGroup {
        left: Modifiers::CMD_LEFT,
        right: Modifiers::CMD_RIGHT,
        any_name: "Cmd",
        left_name: "CmdLeft",
        right_name: "CmdRight",
    },
];

const MODIFIER_ALIASES: &[(&[&str], Modifiers)] = &[
    (
        &["cmd", "command", "meta", "super", "win", "windows"],
        Modifiers::CMD,
    ),
    (&["shift"], Modifiers::SHIFT),
    (&["ctrl", "control"], Modifiers::CTRL),
    (&["opt", "option", "alt"], Modifiers::OPT),
    (&["fn", "function"], Modifiers::FN),
    (
        &[
            "cmdleft",
            "cmd_left",
            "leftcommand",
            "lcmd",
            "commandleft",
            "command_left",
            "superleft",
            "winleft",
            "windowsleft",
            "metaleft",
        ],
        Modifiers::CMD_LEFT,
    ),
    (
        &[
            "cmdright",
            "cmd_right",
            "rightcommand",
            "rcmd",
            "commandright",
            "command_right",
            "superright",
            "winright",
            "windowsright",
            "metaright",
        ],
        Modifiers::CMD_RIGHT,
    ),
    (
        &["shiftleft", "shift_left", "leftshift", "lshift"],
        Modifiers::SHIFT_LEFT,
    ),
    (
        &["shiftright", "shift_right", "rightshift", "rshift"],
        Modifiers::SHIFT_RIGHT,
    ),
    (
        &[
            "ctrlleft",
            "ctrl_left",
            "leftcontrol",
            "lctrl",
            "controlleft",
            "control_left",
        ],
        Modifiers::CTRL_LEFT,
    ),
    (
        &[
            "ctrlright",
            "ctrl_right",
            "rightcontrol",
            "rctrl",
            "controlright",
            "control_right",
        ],
        Modifiers::CTRL_RIGHT,
    ),
    (
        &[
            "optleft",
            "opt_left",
            "leftalt",
            "leftoption",
            "lopt",
            "lalt",
            "optionleft",
            "altleft",
        ],
        Modifiers::OPT_LEFT,
    ),
    (
        &[
            "optright",
            "opt_right",
            "rightalt",
            "rightoption",
            "ropt",
            "ralt",
            "optionright",
            "altright",
            "altgr",
        ],
        Modifiers::OPT_RIGHT,
    ),
];

impl Modifiers {
    pub(crate) const CMD_LEFT: Self = Self(0x001);
    pub(crate) const SHIFT_LEFT: Self = Self(0x002);
    pub(crate) const CTRL_LEFT: Self = Self(0x004);
    pub(crate) const OPT_LEFT: Self = Self(0x008);
    pub(crate) const FN: Self = Self(0x010);
    pub(crate) const CMD_RIGHT: Self = Self(0x020);
    pub(crate) const SHIFT_RIGHT: Self = Self(0x040);
    pub(crate) const CTRL_RIGHT: Self = Self(0x080);
    pub(crate) const OPT_RIGHT: Self = Self(0x100);

    pub(crate) const CMD: Self = Self(0x021);
    pub(crate) const SHIFT: Self = Self(0x042);
    pub(crate) const CTRL: Self = Self(0x084);
    pub(crate) const OPT: Self = Self(0x108);

    pub(crate) const fn empty() -> Self {
        Self::from_bits(0)
    }

    pub(crate) fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub(crate) fn count(self) -> u32 {
        u16::count_ones(self.0)
    }

    pub(crate) fn contains(self, expected: Self) -> bool {
        self & expected == expected
    }

    pub(crate) fn insert(&mut self, incoming: Self) {
        *self |= incoming;
    }

    pub(crate) fn remove(&mut self, outgoing: Self) {
        *self &= !outgoing;
    }

    pub(crate) fn matches(self, event: Self) -> bool {
        MODIFIER_GROUPS
            .iter()
            .all(|group| group.matches_exactly(self, event))
            && self.contains(Self::FN) == event.contains(Self::FN)
    }

    pub(crate) fn remains_held_during(self, event: Self) -> bool {
        MODIFIER_GROUPS
            .iter()
            .all(|group| group.requirement_is_held(self, event))
            && (!self.contains(Self::FN) || event.contains(Self::FN))
    }

    fn parse_single(token: &str) -> Option<Self> {
        let normalized = token.to_ascii_lowercase();
        MODIFIER_ALIASES
            .iter()
            .find(|(aliases, _)| aliases.contains(&normalized.as_str()))
            .map(|(_, modifier)| *modifier)
    }

    const fn from_bits(bits: u16) -> Self {
        Self(bits)
    }
}

impl ModifierGroup {
    fn desired_sides(self, requested: Modifiers) -> (bool, bool) {
        (
            requested.contains(self.left),
            requested.contains(self.right),
        )
    }

    fn matches_exactly(self, requested: Modifiers, event: Modifiers) -> bool {
        let (wants_left, wants_right) = self.desired_sides(requested);
        let has_left = event.contains(self.left);
        let has_right = event.contains(self.right);
        match (wants_left, wants_right) {
            (false, false) => !(has_left || has_right),
            (true, true) => has_left || has_right,
            (true, false) => has_left,
            (false, true) => has_right,
        }
    }

    fn requirement_is_held(self, requested: Modifiers, event: Modifiers) -> bool {
        let (wants_left, wants_right) = self.desired_sides(requested);
        match (wants_left, wants_right) {
            (false, false) => true,
            (true, true) => event.contains(self.left) || event.contains(self.right),
            (true, false) => event.contains(self.left),
            (false, true) => event.contains(self.right),
        }
    }

    fn display_name(self, modifiers: Modifiers) -> Option<&'static str> {
        match self.desired_sides(modifiers) {
            (true, true) => Some(self.any_name),
            (true, false) => Some(self.left_name),
            (false, true) => Some(self.right_name),
            (false, false) => None,
        }
    }
}

macro_rules! implement_modifier_binary_operator {
    ($trait:ident, $method:ident, $operator:tt) => {
        impl $trait for Modifiers {
            type Output = Modifiers;

            fn $method(self, rhs: Modifiers) -> Self::Output {
                Modifiers::from_bits(self.0 $operator rhs.0)
            }
        }
    };
}

macro_rules! implement_modifier_assignment_operator {
    ($trait:ident, $method:ident, $operator:tt) => {
        impl $trait for Modifiers {
            fn $method(&mut self, rhs: Modifiers) {
                self.0 = self.0 $operator rhs.0;
            }
        }
    };
}

implement_modifier_binary_operator!(BitOr, bitor, |);
implement_modifier_binary_operator!(BitAnd, bitand, &);
implement_modifier_assignment_operator!(BitOrAssign, bitor_assign, |);
implement_modifier_assignment_operator!(BitAndAssign, bitand_assign, &);

impl Not for Modifiers {
    type Output = Self;

    fn not(self) -> Self::Output {
        Self::from_bits(!self.0)
    }
}

impl fmt::Display for Modifiers {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut labels: Vec<_> = MODIFIER_GROUPS
            .iter()
            .filter_map(|group| group.display_name(*self))
            .collect();
        if self.contains(Self::FN) {
            labels.push("Fn");
        }
        formatter.write_str(&labels.join("+"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct Hotkey {
    pub(crate) modifiers: Modifiers,
    pub(crate) key: Option<Key>,
}

impl Hotkey {
    pub(crate) fn new(modifiers: Modifiers, key: impl Into<Option<Key>>) -> Result<Self> {
        let key = key.into();
        if modifiers.is_empty() && key.is_none() {
            return Err(anyhow!("Shortcut cannot be empty"));
        }
        Ok(Self { modifiers, key })
    }

    pub(crate) fn matches_event(self, event: &KeyEvent) -> bool {
        self.key == event.key && self.modifiers.matches(event.modifiers)
    }
}

impl fmt::Display for Hotkey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let modifiers = self.modifiers.to_string();
        match (modifiers.is_empty(), self.key) {
            (true, Some(key)) => write!(formatter, "{key}"),
            (false, Some(key)) => write!(formatter, "{modifiers}+{key}"),
            (false, None) => formatter.write_str(&modifiers),
            (true, None) => formatter.write_str("(none)"),
        }
    }
}

impl FromStr for Hotkey {
    type Err = anyhow::Error;

    fn from_str(shortcut: &str) -> Result<Self> {
        let mut modifiers = Modifiers::empty();
        let mut key = None;
        for token in shortcut
            .split('+')
            .map(str::trim)
            .filter(|part| !part.is_empty())
        {
            if let Some(modifier) = Modifiers::parse_single(token) {
                modifiers.insert(modifier);
            } else {
                if key.is_some() {
                    return Err(anyhow!("Shortcut `{shortcut}` contains more than one key"));
                }
                key = Some(token.parse::<Key>()?);
            }
        }
        Self::new(modifiers, key)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct KeyEvent {
    pub(crate) modifiers: Modifiers,
    pub(crate) key: Option<Key>,
    pub(crate) is_key_down: bool,
    pub(crate) changed_modifier: Option<Modifiers>,
    pub(crate) repeat: bool,
}

impl KeyEvent {
    pub(crate) fn releases_everything(self) -> bool {
        !self.is_key_down
            && self.key.is_none()
            && self.changed_modifier.is_none()
            && self.modifiers.is_empty()
    }
}

struct EventPolicy<'a> {
    hotkeys: &'a [Hotkey],
}

impl EventPolicy<'_> {
    fn blocks(&self, event: &KeyEvent) -> bool {
        match event.changed_modifier {
            Some(changed) => self
                .hotkeys
                .iter()
                .any(|hotkey| hotkey.key.is_none() && hotkey.modifiers.contains(changed)),
            None if event.key.is_some() => self
                .hotkeys
                .iter()
                .any(|hotkey| hotkey.matches_event(event)),
            None => false,
        }
    }

    fn forwards(&self, event: &KeyEvent) -> bool {
        if self.hotkeys.is_empty()
            || event.releases_everything()
            || event.changed_modifier.is_some()
        {
            return true;
        }
        event
            .key
            .is_some_and(|key| self.hotkeys.iter().any(|hotkey| hotkey.key == Some(key)))
    }
}

pub(crate) fn blocking_hotkeys(hotkeys: Vec<Hotkey>) -> BlockingHotkeys {
    hotkeys.into()
}

pub(crate) fn empty_blocking_hotkeys() -> BlockingHotkeys {
    Arc::from([])
}

pub(crate) fn should_block_event(hotkeys: &BlockingHotkeys, event: &KeyEvent) -> bool {
    EventPolicy { hotkeys }.blocks(event)
}

pub(crate) fn should_forward_event(hotkeys: &BlockingHotkeys, event: &KeyEvent) -> bool {
    EventPolicy { hotkeys }.forwards(event)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn modifier_event(modifiers: Modifiers, changed: Modifiers, is_key_down: bool) -> KeyEvent {
        KeyEvent {
            modifiers,
            key: None,
            is_key_down,
            changed_modifier: Some(changed),
            repeat: false,
        }
    }

    #[test]
    fn generic_and_side_specific_modifiers_follow_the_same_truth_table() {
        let generic: Hotkey = "Ctrl+Shift".parse().unwrap();
        assert_eq!(generic.to_string(), "Ctrl+Shift");
        assert!(generic
            .modifiers
            .matches(Modifiers::CTRL_LEFT | Modifiers::SHIFT_RIGHT));
        assert!(generic
            .modifiers
            .matches(Modifiers::CTRL_RIGHT | Modifiers::SHIFT_LEFT));
        assert!(!generic.modifiers.matches(Modifiers::CTRL_LEFT));

        let sided: Hotkey = "CtrlRight+Space".parse().unwrap();
        assert!(sided.modifiers.matches(Modifiers::CTRL_RIGHT));
        assert!(!sided.modifiers.matches(Modifiers::CTRL_LEFT));
    }

    #[test]
    fn unrelated_modifiers_are_allowed_only_while_an_active_shortcut_is_held() {
        assert!(!Modifiers::FN.matches(Modifiers::FN | Modifiers::CMD_LEFT));
        assert!(Modifiers::FN.remains_held_during(Modifiers::FN | Modifiers::CMD_LEFT));
        assert!(!Modifiers::OPT_RIGHT.remains_held_during(Modifiers::OPT_LEFT));
    }

    #[test]
    fn parser_rejects_multiple_keys_and_preserves_aliases() {
        assert!("Ctrl+A+B".parse::<Hotkey>().is_err());
        assert_eq!(
            "AltGr+Space".parse::<Hotkey>().unwrap().to_string(),
            "OptRight+Space"
        );
        assert!("".parse::<Hotkey>().is_err());
    }

    #[test]
    fn routing_blocks_both_edges_of_a_modifier_only_shortcut() {
        let hotkeys = blocking_hotkeys(vec![Hotkey::new(Modifiers::OPT_RIGHT, None).unwrap()]);
        let down = modifier_event(Modifiers::OPT_RIGHT, Modifiers::OPT_RIGHT, true);
        let up = modifier_event(Modifiers::empty(), Modifiers::OPT_RIGHT, false);

        assert!(should_block_event(&hotkeys, &down));
        assert!(should_block_event(&hotkeys, &up));
        assert!(should_forward_event(&hotkeys, &down));
        assert!(should_forward_event(&hotkeys, &up));
    }

    #[test]
    fn keyed_events_for_unregistered_keys_are_not_forwarded_to_the_worker() {
        let hotkeys = blocking_hotkeys(vec![Hotkey::new(Modifiers::CTRL, Key::Space).unwrap()]);
        let unrelated = KeyEvent {
            modifiers: Modifiers::empty(),
            key: Some(Key::A),
            is_key_down: true,
            changed_modifier: None,
            repeat: false,
        };

        assert!(!should_block_event(&hotkeys, &unrelated));
        assert!(!should_forward_event(&hotkeys, &unrelated));
    }
}
