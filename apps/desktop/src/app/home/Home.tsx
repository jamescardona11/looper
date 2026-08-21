import { useReducedMotion } from "framer-motion";
import { useReducer } from "react";

import { useLicenseGate } from "../../features/license/queries";
import { useAppInfo, useSettings } from "../../features/settings/preferences/queries";
import { useTodayDictationStats } from "../../features/transcriptions/queries";
import { useTimeOfDayPeriodTick } from "../../features/transcriptions/homeGreeting";
import { EMPTY_TODAY_DICTATION_STATS } from "../../features/transcriptions/todayStats";
import { useUpdateStatus } from "../../features/updates/queries";
import { createHomeDiagnostics } from "./home-diagnostics";
import {
  HomeKeyboardBridge,
  useHomeNativeEventBridge,
} from "./home-native-events";
import { HomePresentation } from "./home-presentation";
import { createHomeState, reduceHomeState } from "./home-state";
import type { TranscriptionMode } from "../../types";

function Home() {
  const licenseGateActive = useLicenseGate();
  const { data: settings } = useSettings();
  const { data: updateStatus } = useUpdateStatus();
  const { data: appInfo } = useAppInfo();
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
      <HomeKeyboardBridge
        dispatch={dispatch}
        key={licenseGateActive ? "licensed" : "restricted"}
        licensed={licenseGateActive}
      />
      <HomePresentation
        appVersion={appInfo?.version ?? "-"}
        dispatch={dispatch}
        licenseGateActive={licenseGateActive}
        reduceMotion={reduceMotion}
        runDiagnostics={createHomeDiagnostics(settings)}
        settingsShortcut={settings?.smart_shortcut}
        showCleanupButtons={cleanupAvailable}
        state={state}
        todayStats={todayQuery.data ?? EMPTY_TODAY_DICTATION_STATS}
        todayStatsFetched={todayQuery.isFetched}
        transcriptionMode={transcriptionMode}
        updateAvailable={updateStatus?.available ?? false}
      />
    </>
  );
}

export default Home;
