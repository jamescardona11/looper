macro_rules! register_platform_surfaces {
    ($($surface:ident),+ $(,)?) => {
        $(pub mod $surface;)+
    };
}

register_platform_surfaces!(overlay, settings_window, toast);

pub(crate) mod coordinates;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;
