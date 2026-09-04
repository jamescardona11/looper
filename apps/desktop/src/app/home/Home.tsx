import { useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useReducer } from "react";

import { useLicenseGate } from "../../features/license/queries";
import {
  useAppInfo,
  useSettings,
} from "../../features/settings/preferences/queries";
import { checkAccessibilityPermission } from "../../data/settings";
import {
  useTodayDictationStats,
  useTranscriptionList,
} from "../../features/transcriptions/queries";
import { useTimeOfDayPeriodTick } from "../../features/transcriptions/homeGreeting";
import {
  deriveWeeklyDictationActivity,
  EMPTY_TODAY_DICTATION_STATS,
} from "../../features/transcriptions/todayStats";
import { useUpdateStatus } from "../../features/updates/queries";
import { createHomeDiagnostics } from "./home-diagnostics";
import {
  HomeKeyboardBridge,
  useHomeNativeEventBridge,
} from "./home-native-events";
import { HomePresentation } from "./home-presentation";
import { createHomeState, reduceHomeState } from "./home-state";
import type { TranscriptionMode } from "../../contracts";

function Home() {
  const licenseGateActive = useLicenseGate();
  const { data: settings } = useSettings();
  const { data: updateStatus } = useUpdateStatus();
  const { data: appInfo } = useAppInfo();
  const shortcutPermission = useQuery({
    queryKey: ["home", "shortcut-permission"],
    queryFn: checkAccessibilityPermission,
    refetchOnWindowFocus: "always",
  });
  const reduceMotion = useReducedMotion();
  const [state, dispatch] = useReducer(
    reduceHomeState,
    licenseGateActive,
    createHomeState,
  );
  useHomeNativeEventBridge(dispatch);

  const homeActive = state.activeView === "home";
  const periodTick = useTimeOfDayPeriodTick(homeActive);
  const todayQuery = useTodayDictationStats(homeActive, periodTick);
  const transcriptionListQuery = useTranscriptionList(homeActive);
  const retainedTranscriptions = transcriptionListQuery.data ?? [];
  const weeklyActivity = useMemo(
    () => deriveWeeklyDictationActivity(retainedTranscriptions),
    [retainedTranscriptions],
  );
  const transcriptionMode: TranscriptionMode =
    settings?.transcription_mode ?? "local";
  const cloudTranscription = transcriptionMode === "cloud";
  const cleanupAvailable =
    cloudTranscription || Boolean(settings?.llm_enabled && licenseGateActive);

  if (state.licensed !== licenseGateActive) {
    dispatch({ type: "license-changed", licensed: licenseGateActive });
  }

  return (
    <>
      <HomeKeyboardBridge dispatch={dispatch} />
      <HomePresentation
        appVersion={appInfo?.version ?? "-"}
        dispatch={dispatch}
        hasHistory={retainedTranscriptions.length > 0}
        reduceMotion={reduceMotion}
        runDiagnostics={createHomeDiagnostics(settings)}
        shortcutAvailable={shortcutPermission.data}
        settingsShortcut={settings?.smart_shortcut}
        showCleanupButtons={cleanupAvailable}
        state={state}
        todayStats={todayQuery.data ?? EMPTY_TODAY_DICTATION_STATS}
        transcriptionMode={transcriptionMode}
        updateAvailable={updateStatus?.available ?? false}
        weeklyActivity={weeklyActivity}
      />
    </>
  );
}

export default Home;
