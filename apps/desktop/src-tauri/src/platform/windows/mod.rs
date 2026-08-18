macro_rules! register_windows_surfaces {
    ($($surface:ident),+ $(,)?) => {
        $(pub mod $surface;)+
    };
}

register_windows_surfaces!(crash, icons, overlay, settings_window, toast);
