macro_rules! register_core_modules {
    ($($module:ident),+ $(,)?) => {
        $(pub(crate) mod $module;)+
    };
}

register_core_modules!(hotkeys, keyboard, settings, transcriptions);
