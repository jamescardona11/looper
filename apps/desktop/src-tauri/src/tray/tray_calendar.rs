use chrono::{DateTime, Duration as ChronoDuration, Local, Utc};

const MAX_AGENDA_ITEMS: usize = 10;
pub(crate) const MENU_TITLE_LIMIT: usize = 30;
const NEXT_MEETING_HORIZON_HOURS: i64 = 24;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CalendarAgendaEntry {
    pub(crate) event_id: String,
    pub(crate) label: String,
}

struct CalendarWindow<'a> {
    meeting: &'a crate::meeting_awareness::CalendarMeeting,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
}

impl<'a> CalendarWindow<'a> {
    fn parse(meeting: &'a crate::meeting_awareness::CalendarMeeting) -> Option<Self> {
        let parse_time = |value: &str| {
            DateTime::parse_from_rfc3339(value)
                .ok()
                .map(|time| time.with_timezone(&Utc))
        };
        Some(Self {
            meeting,
            starts_at: parse_time(&meeting.started_at)?,
            ends_at: parse_time(&meeting.ended_at)?,
        })
    }

    fn is_visible_in(&self, now: DateTime<Utc>, horizon: DateTime<Utc>) -> bool {
        self.ends_at > now && self.starts_at <= horizon
    }
}

fn parsed_windows(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
) -> impl Iterator<Item = CalendarWindow<'_>> {
    meetings.iter().filter_map(CalendarWindow::parse)
}

pub(crate) fn calendar_agenda_entries(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
    now: DateTime<Utc>,
) -> Vec<CalendarAgendaEntry> {
    let horizon = now + ChronoDuration::days(7);
    let mut windows = parsed_windows(meetings)
        .filter(|window| window.is_visible_in(now, horizon))
        .collect::<Vec<_>>();
    windows.sort_by_key(|window| window.starts_at);
    windows
        .into_iter()
        .take(MAX_AGENDA_ITEMS)
        .map(|window| CalendarAgendaEntry {
            event_id: window.meeting.id.clone(),
            label: agenda_label(&window.meeting.title, window.starts_at, now),
        })
        .collect()
}

pub(crate) fn calendar_menu_bar_title(
    meetings: &[crate::meeting_awareness::CalendarMeeting],
    now: DateTime<Utc>,
) -> Option<String> {
    let windows = parsed_windows(meetings).collect::<Vec<_>>();
    if let Some(active) = windows
        .iter()
        .filter(|window| window.starts_at <= now && window.ends_at > now)
        .min_by_key(|window| window.ends_at)
    {
        return Some(compact_title(
            &active.meeting.title,
            &format!(" • {} left", compact_duration(active.ends_at - now)),
        ));
    }

    let horizon = now + ChronoDuration::hours(NEXT_MEETING_HORIZON_HOURS);
    let next = windows
        .iter()
        .filter(|window| window.starts_at > now && window.starts_at <= horizon)
        .min_by_key(|window| window.starts_at)?;
    Some(compact_title(
        &next.meeting.title,
        &format!(" • in {}", compact_duration(next.starts_at - now)),
    ))
}

fn agenda_label(title: &str, starts_at: DateTime<Utc>, now: DateTime<Utc>) -> String {
    let starts_local = starts_at.with_timezone(&Local);
    let day = match starts_local.date_naive() - now.with_timezone(&Local).date_naive() {
        delta if delta.num_days() == 0 => "Today".to_string(),
        delta if delta.num_days() == 1 => "Tomorrow".to_string(),
        _ => starts_local.format("%a %b %-d").to_string(),
    };
    format!(
        "{day} {} · {}",
        starts_local.format("%H:%M"),
        normalized_title(title, 42)
    )
}

fn compact_title(title: &str, suffix: &str) -> String {
    let limit = MENU_TITLE_LIMIT.saturating_sub(suffix.chars().count());
    format!("{}{suffix}", normalized_title(title, limit))
}

pub(crate) fn normalized_title(title: &str, max_chars: usize) -> String {
    let normalized = title.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if normalized.is_empty() {
        "Untitled meeting".to_string()
    } else {
        normalized
    };
    if title.chars().count() <= max_chars {
        return title;
    }
    let mut shortened = title
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    shortened.push('…');
    shortened
}

fn compact_duration(duration: ChronoDuration) -> String {
    let seconds = duration.num_seconds().max(1) as u64;
    let minutes = seconds / 60;
    if seconds < 60 {
        format!("{seconds}s")
    } else if minutes < 60 {
        format!("{minutes}m")
    } else if minutes % 60 == 0 {
        format!("{}h", minutes / 60)
    } else {
        format!("{}h {}m", minutes / 60, minutes % 60)
    }
}
