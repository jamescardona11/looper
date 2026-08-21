import { invoke } from "@tauri-apps/api/core";

export const reportFrontendCrashEvent = (input: {
  windowLabel: string;
  source: string;
  errorKind: string;
  fingerprint: string;
}) => invoke<void>("report_frontend_crash", input);
