//! Lectura del calendario del sistema. Vive aparte de la lógica de avisos
//! porque es el único trozo que depende del sistema operativo.

use super::{
    meeting_url, recurring_identity, retry_calendar_read, CalendarAccessStatus, CalendarMeeting,
    CALENDAR_READ_ATTEMPTS, CALENDAR_RETRY_DELAY_MILLIS,
};
use block2::RcBlock;
use chrono::{DateTime, Utc};
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2::{msg_send, AllocAnyThread};
use objc2_event_kit::{
    EKAuthorizationStatus, EKCalendar, EKEntityType, EKEvent, EKEventStatus, EKEventStore,
    EKParticipantStatus,
};
use objc2_foundation::{
    NSArray, NSDate, NSError, NSNotification, NSNotificationCenter, NSObject, NSString, NSURL,
};
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

struct SendSyncEventStore(Retained<EKEventStore>);

// EventKit supports event enumeration from background queues. Keeping one
// shared store also avoids racing its XPC connection during refreshes.
unsafe impl Send for SendSyncEventStore {}
unsafe impl Sync for SendSyncEventStore {}

static EVENT_STORE: OnceLock<SendSyncEventStore> = OnceLock::new();

fn event_store() -> &'static EKEventStore {
    &EVENT_STORE
        .get_or_init(|| SendSyncEventStore(unsafe { EKEventStore::new() }))
        .0
}

pub(super) fn calendar_access_status() -> CalendarAccessStatus {
    let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
    match status {
        EKAuthorizationStatus::NotDetermined => CalendarAccessStatus::NotDetermined,
        EKAuthorizationStatus::FullAccess => CalendarAccessStatus::Authorized,
        _ => CalendarAccessStatus::Denied,
    }
}

pub(super) fn request_calendar_access() -> bool {
    let (tx, rx) = std::sync::mpsc::channel();
    let block = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
        let _ = tx.send(granted.as_bool());
    });

    unsafe {
        let pointer = &*block as *const block2::Block<_> as *mut block2::Block<_>;
        event_store().requestFullAccessToEventsWithCompletion(pointer);
    }

    rx.recv_timeout(Duration::from_secs(60)).unwrap_or(false)
}

pub(super) fn upcoming_calendar_meetings(
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Vec<CalendarMeeting>, String> {
    if calendar_access_status() != CalendarAccessStatus::Authorized {
        return Ok(Vec::new());
    }

    let result = retry_calendar_read(
        CALENDAR_READ_ATTEMPTS,
        || fetch_events(from, to),
        || std::thread::sleep(Duration::from_millis(CALENDAR_RETRY_DELAY_MILLIS)),
    )?;

    let mut meetings = result
        .iter()
        .filter_map(|event| transform_event(&event))
        .collect::<Vec<_>>();
    meetings.sort_by(|left, right| left.started_at.cmp(&right.started_at));
    tracing::debug!(
        candidate_events = result.len(),
        eligible_meetings = meetings.len(),
        "Refreshed Apple Calendar agenda"
    );
    Ok(meetings)
}

fn fetch_events(
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Retained<NSArray<EKEvent>>, String> {
    let store = AssertUnwindSafe(event_store());
    objc2::exception::catch(|| unsafe {
        let calendars: Retained<NSArray<EKCalendar>> = store.calendars();
        let start = NSDate::initWithTimeIntervalSince1970(NSDate::alloc(), from.timestamp() as f64);
        let end = NSDate::initWithTimeIntervalSince1970(NSDate::alloc(), to.timestamp() as f64);
        let predicate =
            store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, Some(&calendars));
        store.eventsMatchingPredicate(&predicate)
    })
    .map_err(|_| "Calendar became unavailable while Looper was reading events.".to_string())
}

fn transform_event(event: &EKEvent) -> Option<CalendarMeeting> {
    if unsafe { event.isAllDay() } || unsafe { event.status() } == EKEventStatus::Canceled {
        return None;
    }

    let attendees = unsafe { event.attendees() };
    if attendees.as_ref().is_some_and(|participants| {
        participants.iter().any(|participant| unsafe {
            participant.isCurrentUser()
                && participant.participantStatus() == EKParticipantStatus::Declined
        })
    }) {
        return None;
    }

    let title = unsafe { event.title() }.to_string();
    if title.trim().is_empty() {
        return None;
    }

    let raw_url = unsafe {
        let value: Option<Retained<NSURL>> = msg_send![event, URL];
        value.and_then(|url| url.absoluteString().map(|text| text.to_string()))
    };
    let notes = unsafe { event.notes() }.map(|value| value.to_string());
    let location = unsafe { event.location() }.map(|value| value.to_string());
    let resolved_url = meeting_url(raw_url.as_deref(), notes.as_deref(), location.as_deref())?;

    let calendar = unsafe { event.calendar() }?;
    let started_at = date_time(unsafe { event.startDate() })?;
    let ended_at = date_time(unsafe { event.endDate() })?;
    let event_identifier = unsafe { event.eventIdentifier() }
        .map(|value| value.to_string())
        .unwrap_or_default();
    let calendar_item_identifier = unsafe { event.calendarItemIdentifier() }.to_string();
    let external_identifier = unsafe { event.calendarItemExternalIdentifier() }
        .map(|value| value.to_string())
        .unwrap_or_default();
    let occurrence_timestamp = if unsafe { event.hasRecurrenceRules() || event.isDetached() } {
        unsafe { event.occurrenceDate() }
            .and_then(date_time)
            .or(Some(started_at))
            .map(|date| date.timestamp())
    } else {
        None
    };
    let (id, series_id, occurrence_id) = recurring_identity(
        &event_identifier,
        &calendar_item_identifier,
        &external_identifier,
        occurrence_timestamp,
    );
    let organizer = unsafe { event.organizer() }
        .and_then(|participant| unsafe { participant.name() })
        .map(|name| name.to_string());

    Some(CalendarMeeting {
        id,
        external_id: external_identifier,
        calendar_id: unsafe { calendar.calendarIdentifier() }.to_string(),
        series_id,
        occurrence_id,
        title,
        started_at: started_at.to_rfc3339(),
        ended_at: ended_at.to_rfc3339(),
        meeting_url: Some(resolved_url),
        organizer,
        attendee_count: attendees.as_ref().map_or(0, |values| values.len()),
    })
}

fn date_time(date: Retained<NSDate>) -> Option<DateTime<Utc>> {
    DateTime::from_timestamp(date.timeIntervalSince1970() as i64, 0)
}

struct NotificationObserver {
    #[allow(dead_code)]
    observer: Retained<NSObject>,
    #[allow(dead_code)]
    block: RcBlock<dyn Fn(*const NSNotification)>,
}

pub(super) fn setup_change_notification<F>(on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    std::thread::spawn(move || {
        let on_change = Arc::new(on_change);
        let block = RcBlock::new(move |_notification: *const NSNotification| on_change());
        let observer = unsafe {
            let center = NSNotificationCenter::defaultCenter();
            let name = NSString::from_str("EKEventStoreChangedNotification");
            let observer: Retained<NSObject> = msg_send![
                &*center,
                addObserverForName: &*name,
                object: event_store(),
                queue: std::ptr::null::<NSObject>(),
                usingBlock: &*block
            ];
            observer
        };
        let _observer = NotificationObserver { observer, block };
        loop {
            std::thread::park();
        }
    });
}
