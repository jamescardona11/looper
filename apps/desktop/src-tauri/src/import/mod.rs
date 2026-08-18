macro_rules! register_sources {
    ($($source:ident),+ $(,)?) => {
        $(mod $source;)+
    };
}

register_sources!(aqua, handy, superwhisper, wispr);

pub(crate) mod apply;
pub(crate) mod commands;
pub(crate) mod detect;
pub(crate) mod shared;
