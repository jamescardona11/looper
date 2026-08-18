//! Lectura del calendario del sistema. Vive aparte de la lógica de avisos
//! porque es el único trozo que depende del sistema operativo.

use super::{CalendarAccessStatus, CalendarMeeting};
use chrono::{DateTime, Utc};

pub(super) fn calendar_access_status() -> CalendarAccessStatus {
    CalendarAccessStatus::Unsupported
}

pub(super) fn request_calendar_access() -> bool {
    false
}

pub(super) fn upcoming_calendar_meetings(
    _from: DateTime<Utc>,
    _to: DateTime<Utc>,
) -> Result<Vec<CalendarMeeting>, String> {
    Ok(Vec::new())
}

pub(super) fn setup_change_notification<F>(_on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
}
