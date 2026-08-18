#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PauseSession(u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MediaMode {
    Pause,
    Duck(u8),
}

struct MediaSessionPolicy;

impl MediaSessionPolicy {
    fn start(mode: MediaMode) -> MediaSession {
        match mode {
            MediaMode::Pause => MediaSession::Pause(imp::begin_pause()),
            MediaMode::Duck(percent) => MediaSession::Duck(imp::begin_duck(percent)),
        }
    }

    fn stop(session: Option<MediaSession>) {
        match session {
            Some(MediaSession::Pause(session)) => imp::finish_pause(session),
            Some(MediaSession::Duck(session)) => imp::finish_duck(session),
            None => {}
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum MediaSession {
    Pause(PauseSession),
    Duck(PauseSession),
}

pub(crate) fn engage(mode: MediaMode) -> MediaSession {
    MediaSessionPolicy::start(mode)
}

pub(crate) fn disengage(session: Option<MediaSession>) {
    MediaSessionPolicy::stop(session);
}

mod lifecycle {
    use super::PauseSession;
    use parking_lot::Mutex;
    use tauri::async_runtime;

    pub(super) type CancelProbe<'a> = &'a dyn Fn() -> bool;

    enum SessionPhase<T> {
        Idle,
        Active {
            id: PauseSession,
            saved_target: Option<T>,
        },
    }

    struct SessionLedger<T> {
        sequence: u64,
        phase: SessionPhase<T>,
    }

    impl<T> SessionLedger<T> {
        const fn empty() -> Self {
            Self {
                sequence: 0,
                phase: SessionPhase::Idle,
            }
        }

        fn begin(&mut self) -> PauseSession {
            self.sequence = self.sequence.wrapping_add(1);
            if self.sequence == 0 {
                self.sequence = 1;
            }
            let session = PauseSession(self.sequence);
            self.phase = SessionPhase::Active {
                id: session,
                saved_target: None,
            };
            session
        }

        fn completed(&mut self, session: PauseSession, target: Option<T>) -> Option<T> {
            match &mut self.phase {
                SessionPhase::Active {
                    id,
                    saved_target,
                } if *id == session => {
                    if let Some(target) = target {
                        *saved_target = Some(target);
                    }
                    None
                }
                SessionPhase::Active { saved_target, .. } => {
                    if saved_target.is_none() {
                        *saved_target = target;
                    }
                    None
                }
                SessionPhase::Idle => target,
            }
        }

        fn release(&mut self, session: PauseSession) -> Option<T> {
            let matches = matches!(
                &self.phase,
                SessionPhase::Active { id, .. } if *id == session
            );
            if !matches {
                return None;
            }
            match std::mem::replace(&mut self.phase, SessionPhase::Idle) {
                SessionPhase::Active { saved_target, .. } => saved_target,
                SessionPhase::Idle => None,
            }
        }

        fn park_if_active(&mut self, target: T) -> Result<(), T> {
            match &mut self.phase {
                SessionPhase::Idle => Err(target),
                SessionPhase::Active { saved_target, .. } => {
                    if saved_target.is_none() {
                        *saved_target = Some(target);
                    }
                    Ok(())
                }
            }
        }

        fn has_active_session(&self) -> bool {
            matches!(&self.phase, SessionPhase::Active { .. })
        }
    }

    pub(super) struct Coordinator<T: Send + 'static> {
        ledger: Mutex<SessionLedger<T>>,
        pause: fn() -> Option<T>,
        resume: fn(&T, CancelProbe<'_>) -> bool,
    }

    impl<T: Send + 'static> Coordinator<T> {
        pub(super) const fn new(
            pause: fn() -> Option<T>,
            resume: fn(&T, CancelProbe<'_>) -> bool,
        ) -> Self {
            Self {
                ledger: Mutex::new(SessionLedger::empty()),
                pause,
                resume,
            }
        }

        pub(super) fn start(&'static self) -> PauseSession {
            let session = self.ledger.lock().begin();
            std::mem::drop(async_runtime::spawn_blocking(move || {
                let paused_target = (self.pause)();
                self.record_pause_result(session, paused_target);
            }));
            session
        }

        pub(super) fn finish(&'static self, session: PauseSession) {
            let paused_target = self.ledger.lock().release(session);
            if let Some(paused_target) = paused_target {
                std::mem::drop(async_runtime::spawn_blocking(move || {
                    self.resume_or_park(paused_target);
                }));
            }
        }

        fn record_pause_result(&'static self, session: PauseSession, target: Option<T>) {
            let resume_now = self.ledger.lock().completed(session, target);
            if let Some(target) = resume_now {
                self.resume_or_park(target);
            }
        }

        fn resume_or_park(&'static self, target: T) {
            let target = match self.ledger.lock().park_if_active(target) {
                Ok(()) => return,
                Err(target) => target,
            };

            let resumed = (self.resume)(&target, &|| self.ledger.lock().has_active_session());
            if !resumed {
                let _ = self.ledger.lock().park_if_active(target);
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn session_ids_never_emit_zero_even_after_wraparound() {
            let mut ledger = SessionLedger::<&str>::empty();
            ledger.sequence = u64::MAX;
            assert_eq!(ledger.begin(), PauseSession(1));
            assert_eq!(ledger.begin(), PauseSession(2));
        }

        #[test]
        fn stale_release_cannot_take_the_active_sessions_target() {
            let mut ledger = SessionLedger::empty();
            let first = ledger.begin();
            let second = ledger.begin();
            assert_eq!(ledger.completed(first, Some("player")), None);
            assert_eq!(ledger.release(first), None);
            assert_eq!(ledger.release(second), Some("player"));
        }

        #[test]
        fn late_pause_is_resumed_immediately_after_session_ended() {
            let mut ledger = SessionLedger::empty();
            let session = ledger.begin();
            assert_eq!(ledger.release(session), None);
            assert_eq!(
                ledger.completed(session, Some("player")),
                Some("player")
            );
        }

        #[test]
        fn current_session_result_replaces_a_target_carried_from_an_older_session() {
            let mut ledger = SessionLedger::empty();
            let first = ledger.begin();
            let second = ledger.begin();
            assert_eq!(ledger.completed(first, Some("first")), None);
            assert_eq!(ledger.completed(second, Some("second")), None);
            assert_eq!(ledger.release(second), Some("second"));
        }

        #[test]
        fn failed_resume_is_parked_only_when_a_new_session_appears() {
            let mut ledger = SessionLedger::empty();
            assert_eq!(ledger.park_if_active("orphan"), Err("orphan"));
            let session = ledger.begin();
            assert_eq!(ledger.park_if_active("kept"), Ok(()));
            assert_eq!(ledger.park_if_active("ignored"), Ok(()));
            assert_eq!(ledger.release(session), Some("kept"));
        }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::lifecycle::{CancelProbe, Coordinator};
    use super::PauseSession;
    use serde::Deserialize;
    use std::process::{Child, Command, Stdio};
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::time::{Duration, Instant};

    const MEDIA_REMOTE_PROGRAM: &str = r#"
ObjC.import("Foundation");

var COMMANDS = { pause: 1, resume: 0 };

function textValue(value) {
    if (value === null || value === undefined) return "";
    try {
        var unwrapped = ObjC.unwrap(value);
        return unwrapped === null || unwrapped === undefined ? "" : String(unwrapped);
    } catch (_) { return ""; }
}

function loadFramework() {
    var framework = $.NSBundle.bundleWithPath(
        "/System/Library/PrivateFrameworks/MediaRemote.framework/"
    );
    if (!framework) return false;
    try {
        if (typeof framework.load === "function" && !framework.load()) return false;
    } catch (_) { return false; }
    ObjC.bindFunction("MRMediaRemoteSendCommand", ["bool", ["int", "id"]]);
    return true;
}

function readPlayer() {
    try {
        var request = $.NSClassFromString("MRNowPlayingRequest");
        var path = request && request.localNowPlayingPlayerPath;
        if (!path || !path.client) return null;
        var item = request.localNowPlayingItem;
        var info = item && item.nowPlayingInfo;
        var rate = 0;
        if (info) {
            var rawRate = info.valueForKey("kMRMediaRemoteNowPlayingInfoPlaybackRate");
            if (rawRate) {
                var candidate = Number(ObjC.unwrap(rawRate));
                rate = isFinite(candidate) ? candidate : 0;
            }
        }
        return {
            bundleId: textValue(path.client.bundleIdentifier),
            displayName: textValue(path.client.displayName),
            rate: rate
        };
    } catch (_) { return null; }
}

function samePlayer(player, expectedBundle, expectedName) {
    return expectedBundle && player.bundleId
        ? expectedBundle === player.bundleId
        : Boolean(expectedName && player.displayName && expectedName === player.displayName);
}

function run(args) {
    var operation = args && args.length ? String(args[0]) : "";
    if (operation !== "pause" && operation !== "playing" && operation !== "resume") return "";
    try {
        if (!loadFramework()) return "";
        var player = readPlayer();
        if (!player || (!player.bundleId && !player.displayName)) return "";
        if (operation === "playing") return player.rate > 0 ? "playing" : "";
        if (operation === "pause") {
            if (player.rate <= 0 || !$.MRMediaRemoteSendCommand(COMMANDS.pause, $.NSDictionary.alloc.init)) return "";
            return JSON.stringify({ bundleId: player.bundleId, displayName: player.displayName });
        }
        var expectedBundle = args.length > 1 ? String(args[1]) : "";
        var expectedName = args.length > 2 ? String(args[2]) : "";
        if (!samePlayer(player, expectedBundle, expectedName)) return "skip";
        $.MRMediaRemoteSendCommand(COMMANDS.resume, $.NSDictionary.alloc.init);
        return "played";
    } catch (_) { return ""; }
}
"#;

    const SYSTEM_VOLUME_PROGRAM: &str = r#"
function validVolume(value) {
    if (!isFinite(value) || value < 0) return 0;
    return Math.min(100, value);
}

function currentVolume(system) {
    try {
        var value = Number(system.getVolumeSettings().outputVolume);
        return isFinite(value) ? value : -1;
    } catch (_) { return -1; }
}

function writeVolume(system, value) {
    try {
        system.setVolume(null, { outputVolume: Math.round(validVolume(value)) });
        return true;
    } catch (_) { return false; }
}

function run(args) {
    var system = Application.currentApplication();
    system.includeStandardAdditions = true;
    var operation = args && args.length ? String(args[0]) : "";
    var argument = args && args.length > 1 ? Number(args[1]) : -1;
    if (operation === "restore") {
        if (!isFinite(argument) || argument < 0) return "skip";
        return writeVolume(system, argument) ? "restored" : "";
    }
    if (operation !== "duck" || !isFinite(argument) || argument <= 0) return "";
    var original = currentVolume(system);
    var requested = validVolume(Math.round(argument));
    if (original < 0 || requested >= original || !writeVolume(system, requested)) return "";
    return JSON.stringify({ original: Math.round(original) });
}
"#;

    #[derive(Deserialize)]
    struct PlayerReply {
        #[serde(default, rename = "bundleId")]
        bundle_id: String,
        #[serde(default, rename = "displayName")]
        display_name: String,
    }

    pub(super) struct PausedPlayer {
        bundle_id: String,
        display_name: String,
    }

    impl PausedPlayer {
        fn parse(stdout: &str) -> Option<Self> {
            let reply: PlayerReply = serde_json::from_str(stdout).ok()?;
            let bundle_id = reply.bundle_id.trim().to_owned();
            let display_name = reply.display_name.trim().to_owned();
            (!bundle_id.is_empty() || !display_name.is_empty()).then_some(Self {
                bundle_id,
                display_name,
            })
        }
    }

    pub(super) struct SavedVolume(u8);

    impl SavedVolume {
        fn parse(stdout: &str) -> Option<Self> {
            #[derive(Deserialize)]
            struct VolumeReply {
                original: f64,
            }

            let reply: VolumeReply = serde_json::from_str(stdout).ok()?;
            Some(Self(reply.original.round().clamp(0.0, 100.0) as u8))
        }
    }

    static PAUSE_COORDINATOR: Coordinator<PausedPlayer> =
        Coordinator::new(pause_player, resume_player);
    static DUCK_COORDINATOR: Coordinator<SavedVolume> =
        Coordinator::new(duck_system_volume, restore_system_volume);
    static REQUESTED_DUCK_PERCENT: AtomicU8 = AtomicU8::new(0);

    pub(super) fn begin_pause() -> PauseSession {
        PAUSE_COORDINATOR.start()
    }

    pub(super) fn begin_duck(percent: u8) -> PauseSession {
        REQUESTED_DUCK_PERCENT.store(percent, Ordering::Relaxed);
        DUCK_COORDINATOR.start()
    }

    pub(super) fn finish_pause(session: PauseSession) {
        PAUSE_COORDINATOR.finish(session);
    }

    pub(super) fn finish_duck(session: PauseSession) {
        DUCK_COORDINATOR.finish(session);
    }

    fn pause_player() -> Option<PausedPlayer> {
        let response = invoke_jxa(MEDIA_REMOTE_PROGRAM, &["pause"], &|| false)?;
        PausedPlayer::parse(&response)
    }

    fn resume_player(player: &PausedPlayer, cancelled: CancelProbe<'_>) -> bool {
        invoke_jxa(
            MEDIA_REMOTE_PROGRAM,
            &["resume", &player.bundle_id, &player.display_name],
            cancelled,
        )
        .is_some_and(|response| response == "played")
    }

    fn duck_system_volume() -> Option<SavedVolume> {
        let percent = REQUESTED_DUCK_PERCENT.load(Ordering::Relaxed).to_string();
        invoke_jxa(MEDIA_REMOTE_PROGRAM, &["playing"], &|| false)?;
        let response = invoke_jxa(SYSTEM_VOLUME_PROGRAM, &["duck", &percent], &|| false)?;
        SavedVolume::parse(&response)
    }

    fn restore_system_volume(volume: &SavedVolume, cancelled: CancelProbe<'_>) -> bool {
        let original = volume.0.to_string();
        invoke_jxa(SYSTEM_VOLUME_PROGRAM, &["restore", &original], cancelled)
            .is_some_and(|response| response == "restored")
    }

    struct ScriptProcess {
        child: Child,
        deadline: Instant,
    }

    impl ScriptProcess {
        fn launch(script: &str, args: &[&str]) -> Option<Self> {
            let mut command = Command::new("osascript");
            command
                .args(["-l", "JavaScript", "-e", script])
                .args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::null());
            Some(Self {
                child: command.spawn().ok()?,
                deadline: Instant::now() + Duration::from_secs(3),
            })
        }

        fn wait_for_output(mut self, cancelled: CancelProbe<'_>) -> Option<String> {
            loop {
                if cancelled() {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return None;
                }
                match self.child.try_wait() {
                    Ok(Some(status)) => {
                        return status.success().then(|| self.read_output()).flatten()
                    }
                    Ok(None) if Instant::now() < self.deadline => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Ok(None) => {
                        let _ = self.child.kill();
                        let _ = self.child.wait();
                        return None;
                    }
                    Err(_) => {
                        let _ = self.child.kill();
                        return None;
                    }
                }
            }
        }

        fn read_output(&mut self) -> Option<String> {
            use std::io::Read;

            let mut output = String::new();
            self.child.stdout.take()?.read_to_string(&mut output).ok()?;
            let output = output.trim();
            (!output.is_empty()).then(|| output.to_owned())
        }
    }

    fn invoke_jxa(script: &str, args: &[&str], cancelled: CancelProbe<'_>) -> Option<String> {
        ScriptProcess::launch(script, args)?.wait_for_output(cancelled)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn player_reply_trims_identity_and_requires_one_identifier() {
            let player = PausedPlayer::parse(
                r#"{"bundleId":"  com.spotify.client  ","displayName":" Spotify "}"#,
            )
            .unwrap();
            assert_eq!(player.bundle_id, "com.spotify.client");
            assert_eq!(player.display_name, "Spotify");
            assert!(PausedPlayer::parse(r#"{"bundleId":" ","displayName":""}"#).is_none());
            assert!(PausedPlayer::parse("not-json").is_none());
        }

        #[test]
        fn saved_volume_rounds_and_clamps_wire_values() {
            assert_eq!(SavedVolume::parse(r#"{"original":24.6}"#).unwrap().0, 25);
            assert_eq!(SavedVolume::parse(r#"{"original":-8}"#).unwrap().0, 0);
            assert_eq!(SavedVolume::parse(r#"{"original":180}"#).unwrap().0, 100);
            assert!(SavedVolume::parse(r#"{"wrong":20}"#).is_none());
        }

        #[test]
        fn scripts_keep_media_commands_and_volume_actions_distinct() {
            for token in ["pause", "playing", "resume", "MRMediaRemoteSendCommand"] {
                assert!(MEDIA_REMOTE_PROGRAM.contains(token), "{token}");
            }
            for token in ["duck", "restore", "outputVolume"] {
                assert!(SYSTEM_VOLUME_PROGRAM.contains(token), "{token}");
            }
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::lifecycle::{CancelProbe, Coordinator};
    use super::PauseSession;
    use std::sync::atomic::{AtomicU8, Ordering};
    use windows::core::GUID;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoDecrementMTAUsage, CoIncrementMTAUsage, CLSCTX_ALL, CO_MTA_USAGE_COOKIE,
    };

    static PAUSE_COORDINATOR: Coordinator<String> = Coordinator::new(pause_player, resume_player);
    static DUCK_COORDINATOR: Coordinator<SavedVolume> =
        Coordinator::new(duck_system_volume, restore_system_volume);
    static REQUESTED_DUCK_PERCENT: AtomicU8 = AtomicU8::new(0);

    pub(super) fn begin_pause() -> PauseSession {
        PAUSE_COORDINATOR.start()
    }

    pub(super) fn begin_duck(percent: u8) -> PauseSession {
        REQUESTED_DUCK_PERCENT.store(percent, Ordering::Relaxed);
        DUCK_COORDINATOR.start()
    }

    pub(super) fn finish_pause(session: PauseSession) {
        PAUSE_COORDINATOR.finish(session);
    }

    pub(super) fn finish_duck(session: PauseSession) {
        DUCK_COORDINATOR.finish(session);
    }

    pub(super) struct SavedVolume(f32);

    struct MtaLease(CO_MTA_USAGE_COOKIE);

    impl MtaLease {
        fn acquire() -> Option<Self> {
            unsafe { CoIncrementMTAUsage().ok().map(Self) }
        }
    }

    impl Drop for MtaLease {
        fn drop(&mut self) {
            let _ = unsafe { CoDecrementMTAUsage(self.0) };
        }
    }

    fn default_volume_endpoint() -> Option<IAudioEndpointVolume> {
        unsafe {
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            devices
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .ok()?
                .Activate(CLSCTX_ALL, None)
                .ok()
        }
    }

    fn current_session<T>(
        inspect: impl FnOnce(&GlobalSystemMediaTransportControlsSession) -> Option<T>,
    ) -> Option<T> {
        let _mta = MtaLease::acquire()?;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .ok()?
            .join()
            .ok()?;
        inspect(&manager.GetCurrentSession().ok()?)
    }

    fn playback_is_active() -> bool {
        current_session(|session| {
            let status = session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?;
            Some(status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        })
        .unwrap_or(false)
    }

    fn pause_player() -> Option<String> {
        current_session(|session| {
            let status = session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()?;
            if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                return None;
            }
            let app_id = session.SourceAppUserModelId().ok()?.to_string_lossy();
            session.TryPauseAsync().ok()?.join().ok()?.then_some(app_id)
        })
    }

    fn resume_player(expected_app_id: &String, _cancelled: CancelProbe<'_>) -> bool {
        current_session(|session| {
            let current_app_id = match session.SourceAppUserModelId() {
                Ok(value) => value.to_string_lossy(),
                Err(_) => return Some(false),
            };
            if current_app_id != *expected_app_id {
                return Some(false);
            }
            let played = session
                .TryPlayAsync()
                .and_then(|operation| operation.join())
                .unwrap_or(false);
            Some(played)
        })
        .unwrap_or(false)
    }

    fn duck_system_volume() -> Option<SavedVolume> {
        let requested = REQUESTED_DUCK_PERCENT.load(Ordering::Relaxed) as f32 / 100.0;
        if requested <= 0.0 || !playback_is_active() {
            return None;
        }
        let _mta = MtaLease::acquire()?;
        let endpoint = default_volume_endpoint()?;
        let original = unsafe { endpoint.GetMasterVolumeLevelScalar().ok()? };
        let requested = requested.clamp(0.0, 1.0);
        if requested >= original {
            return None;
        }
        unsafe {
            let _ = endpoint.SetMasterVolumeLevelScalar(requested, std::ptr::null::<GUID>());
        }
        Some(SavedVolume(original))
    }

    fn restore_system_volume(saved: &SavedVolume, _cancelled: CancelProbe<'_>) -> bool {
        let Some(_mta) = MtaLease::acquire() else {
            return false;
        };
        let Some(endpoint) = default_volume_endpoint() else {
            return false;
        };
        unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(saved.0.clamp(0.0, 1.0), std::ptr::null::<GUID>())
                .is_ok()
        }
    }
}
