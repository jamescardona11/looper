import { invoke } from "@tauri-apps/api/core";
import type { ModeRule, Personality } from "../types";

export type InstalledApp = {
  name: string;
  identifier: string;
  path: string;
  icon_path?: string | null;
};

export type WebsiteIcon = {
  site: string;
  icon_path?: string | null;
};

type PersonalizationCommand =
  | "get_personalities"
  | "set_personalities"
  | "preview_personality_style"
  | "list_installed_apps"
  | "list_website_icons"
  | "get_mode_rules"
  | "set_mode_rules";

function callPersonalization<TResult>(
  command: PersonalizationCommand,
  argumentsByName?: Record<string, unknown>,
): Promise<TResult> {
  return invoke<TResult>(command, argumentsByName);
}

export const getPersonalities = (): Promise<Personality[]> =>
  callPersonalization("get_personalities");

export const setPersonalities = (
  personalities: Personality[],
): Promise<Personality[]> =>
  callPersonalization("set_personalities", { personalities });

export const previewPersonalityStyle = (
  personalityId: string,
  text: string,
): Promise<string> =>
  callPersonalization("preview_personality_style", { personalityId, text });

export const listInstalledApps = (): Promise<InstalledApp[]> =>
  callPersonalization("list_installed_apps");

export const listWebsiteIcons = (sites: string[]): Promise<WebsiteIcon[]> =>
  callPersonalization("list_website_icons", { sites });

export const getModeRules = (): Promise<ModeRule[]> =>
  callPersonalization("get_mode_rules");

export const setModeRules = (modeRules: ModeRule[]): Promise<ModeRule[]> =>
  callPersonalization("set_mode_rules", { modeRules });
