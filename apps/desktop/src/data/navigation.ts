import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const subscribeNavigation = (
  event: string,
  handler: () => void,
): Promise<UnlistenFn> => listen(event, handler);

export const subscribeNavigateSettings = (handler: () => void) =>
  subscribeNavigation("navigate:settings", handler);

export const subscribeNavigateCalendar = (handler: () => void) =>
  subscribeNavigation("navigate:calendar", handler);

export const subscribeNavigateAbout = (handler: () => void) =>
  subscribeNavigation("navigate:about", handler);

export const subscribeNavigateHistory = (handler: () => void) =>
  subscribeNavigation("navigate:history", handler);

export const subscribeNavigateModels = (handler: () => void) =>
  subscribeNavigation("navigate:models", handler);

export const subscribeNavigateFeatureLab = (handler: () => void) =>
  subscribeNavigation("navigate:feature-lab", handler);
