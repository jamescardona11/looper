use anyhow::Result;
use rusqlite::Connection;

use crate::library::{
    LibraryFilter, LibraryItem, LibraryItemPatch, LibraryTranslation, LibraryWatchFolder,
    MeetingDetails, MeetingNoteMarker, MeetingNotesUpdate, MeetingSummaryStatus,
    MeetingTranscriptSegment,
};

use super::StorageManager;

impl StorageManager {
    pub fn insert_library_item(&self, item: LibraryItem) -> Result<LibraryItem> {
        self.with_database(|database| crate::library::repo::insert_library_item(database, item))
    }

    pub fn insert_meeting_item(
        &self,
        item: LibraryItem,
        details: &MeetingDetails,
    ) -> Result<LibraryItem> {
        self.with_mut_database(|database| {
            crate::library::repo::insert_meeting_item(database, item, details)
        })
    }

    pub fn get_meeting_details(&self, library_item_id: &str) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::get_meeting_details(database, library_item_id)
        })
    }

    pub fn append_meeting_transcript_segment(
        &self,
        library_item_id: &str,
        segment: MeetingTranscriptSegment,
    ) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::append_meeting_transcript_segment(
                database,
                library_item_id,
                segment,
            )
        })
    }

    pub fn update_meeting_notes(
        &self,
        library_item_id: &str,
        update: MeetingNotesUpdate,
    ) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::update_meeting_notes(database, library_item_id, update)
        })
    }

    pub fn append_meeting_note_marker(
        &self,
        library_item_id: &str,
        marker: MeetingNoteMarker,
    ) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::append_meeting_note_marker(database, library_item_id, marker)
        })
    }

    pub fn finish_meeting_details(
        &self,
        library_item_id: &str,
        ended_at: &str,
        recovered: bool,
    ) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::finish_meeting_details(
                database,
                library_item_id,
                ended_at,
                recovered,
            )
        })
    }

    pub fn update_meeting_summary(
        &self,
        library_item_id: &str,
        status: MeetingSummaryStatus,
        summary: Option<&str>,
        error: Option<&str>,
    ) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::update_meeting_summary(
                database,
                library_item_id,
                status,
                summary,
                error,
            )
        })
    }

    pub fn claim_meeting_summary(&self, library_item_id: &str) -> Result<Option<MeetingDetails>> {
        self.with_database(|database| {
            crate::library::repo::claim_meeting_summary(database, library_item_id)
        })
    }

    pub fn get_library_item(&self, id: &str) -> Result<Option<LibraryItem>> {
        self.with_database(|database| {
            crate::library::repo::get_library_item(database, &self.library_root, id)
        })
    }

    pub fn get_library_items_page(
        &self,
        filter: LibraryFilter,
        limit: usize,
        offset: usize,
    ) -> Result<(Vec<LibraryItem>, bool)> {
        self.with_database(|database| {
            crate::library::repo::get_library_items_page(
                database,
                &self.library_root,
                filter,
                limit,
                offset,
            )
        })
    }

    pub fn get_recoverable_library_items(&self) -> Result<Vec<LibraryItem>> {
        self.with_database(|database| {
            crate::library::repo::get_recoverable_library_items(database, &self.library_root)
        })
    }

    pub fn update_library_item(
        &self,
        id: &str,
        patch: LibraryItemPatch,
    ) -> Result<Option<LibraryItem>> {
        self.with_mut_database(|database| {
            crate::library::repo::update_library_item(database, &self.library_root, id, patch)
        })
    }

    pub fn delete_library_item(&self, id: &str) -> Result<Option<String>> {
        self.with_database(|database| {
            crate::library::repo::delete_library_item(database, &self.library_root, id)
        })
    }

    pub fn get_library_tags(&self) -> Result<Vec<String>> {
        self.with_database(crate::library::repo::get_library_tags)
    }

    pub fn upsert_library_translation(&self, translation: &LibraryTranslation) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::upsert_library_translation(database, translation)
        })
    }

    pub fn get_library_translations(&self, item_id: &str) -> Result<Vec<LibraryTranslation>> {
        self.with_database(|database| {
            crate::library::repo::get_library_translations(database, item_id)
        })
    }

    pub fn delete_library_translation(&self, item_id: &str, language: &str) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::delete_library_translation(database, item_id, language)
        })
    }

    pub fn upsert_library_watch_folder(&self, folder: &LibraryWatchFolder) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::upsert_library_watch_folder(database, folder)
        })
    }

    pub fn get_library_watch_folders(&self) -> Result<Vec<LibraryWatchFolder>> {
        self.with_database(crate::library::repo::get_library_watch_folders)
    }

    pub fn remove_library_watch_folder(&self, path: &str) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::remove_library_watch_folder(database, path)
        })
    }

    pub fn claim_library_watch_file(
        &self,
        path: &str,
        fingerprint: &str,
        library_item_id: &str,
    ) -> Result<bool> {
        self.with_database(|database| {
            crate::library::repo::claim_library_watch_file(
                database,
                path,
                fingerprint,
                library_item_id,
            )
        })
    }

    pub fn complete_library_watch_file(
        &self,
        path: &str,
        fingerprint: &str,
        library_item_id: &str,
    ) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::complete_library_watch_file(
                database,
                path,
                fingerprint,
                library_item_id,
            )
        })
    }

    pub fn release_library_watch_file(
        &self,
        path: &str,
        fingerprint: &str,
        library_item_id: &str,
    ) -> Result<()> {
        self.with_database(|database| {
            crate::library::repo::release_library_watch_file(
                database,
                path,
                fingerprint,
                library_item_id,
            )
        })
    }

    fn with_database<T>(&self, operation: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let database = self.connection.lock();
        operation(&database)
    }

    fn with_mut_database<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T>,
    ) -> Result<T> {
        let mut database = self.connection.lock();
        operation(&mut database)
    }
}
