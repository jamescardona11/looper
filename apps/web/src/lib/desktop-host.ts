export type DesktopFocusedContext = { appName: string };
export type DesktopDictationShortcutEvent = {
  state: "pressed" | "released";
  context: DesktopFocusedContext;
};
export type DesktopAudioFixture = {
  bytes: number[];
  mimeType: string;
  name: string;
};
export type DesktopMicProbeReport = {
  ok: boolean;
  durationMs: number;
  blobBytes: number;
  maxAudioLevel: number;
  mimeType: string;
  error?: string;
};
export type DesktopTranscribeFixtureSmokeReport = {
  ok: boolean;
  provider: string;
  name: string;
  blobBytes: number;
  mimeType: string;
  text: string;
  error?: string;
};

export interface DesktopHostAdapter {
  notify(title: string, body?: string): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  writeClipboard(text: string): Promise<void>;
  readClipboard(): Promise<string>;
  isAutostartEnabled(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;
  focusMainWindow(): Promise<void>;
  openQuickPane(): Promise<void>;
  hideCurrentWindow(): Promise<void>;
  onWindowFocusChanged(handler: (focused: boolean) => void): Promise<() => void>;
  emitNavigate(to: string): Promise<void>;
  onNavigate(handler: (to: string) => void): Promise<() => void>;
  onDeepLink(handler: (url: string) => void): Promise<() => void>;
  onFileDrop(handler: (paths: string[]) => void): Promise<() => void>;
  isAccessoryMode(): boolean;
  setAccessoryMode(enabled: boolean): Promise<void>;
  setGlobalShortcut(shortcut: string): Promise<void>;
  getFocusedContext(): Promise<DesktopFocusedContext>;
  checkAccessibility(): Promise<boolean>;
  requestAccessibility(): Promise<void>;
  insertText(text: string): Promise<DesktopFocusedContext>;
  onDictationShortcut(handler: (event: DesktopDictationShortcutEvent) => void): Promise<() => void>;
  resizeCurrentWindow(width: number, height: number): Promise<void>;
  loadAudioFixture(): Promise<DesktopAudioFixture | null>;
  reportTranscribeFixtureSmoke(report: DesktopTranscribeFixtureSmokeReport): Promise<void>;
  micProbeEnabled(): Promise<boolean>;
  reportMicProbe(report: DesktopMicProbeReport): Promise<void>;
}

const noop = () => {};

const browserHost: DesktopHostAdapter = {
  async notify() {},
  async openExternal() {
    return false;
  },
  async writeClipboard() {},
  async readClipboard() {
    return "";
  },
  async isAutostartEnabled() {
    return false;
  },
  async setAutostart() {},
  async focusMainWindow() {},
  async openQuickPane() {},
  async hideCurrentWindow() {},
  async onWindowFocusChanged() {
    return noop;
  },
  async emitNavigate() {},
  async onNavigate() {
    return noop;
  },
  async onDeepLink() {
    return noop;
  },
  async onFileDrop() {
    return noop;
  },
  isAccessoryMode() {
    return false;
  },
  async setAccessoryMode() {},
  async setGlobalShortcut() {},
  async getFocusedContext() {
    return { appName: "Browser preview" };
  },
  async checkAccessibility() {
    return true;
  },
  async requestAccessibility() {},
  async insertText() {
    return { appName: "Browser preview" };
  },
  async onDictationShortcut() {
    return noop;
  },
  async resizeCurrentWindow() {},
  async loadAudioFixture() {
    return null;
  },
  async reportTranscribeFixtureSmoke() {},
  async micProbeEnabled() {
    return false;
  },
  async reportMicProbe() {},
};

let adapter = browserHost;
let currentWindowLabel: string | null = null;

export let isDesktopHost = false;
export let isQuickPane = false;

export function registerDesktopHost(
  nextAdapter: DesktopHostAdapter,
  state?: { windowLabel?: string | null; isQuickPane?: boolean },
): void {
  adapter = nextAdapter;
  isDesktopHost = true;
  currentWindowLabel = state?.windowLabel ?? null;
  isQuickPane = state?.isQuickPane ?? false;
}

export function windowLabel(): string | null {
  return currentWindowLabel;
}

export function notify(title: string, body?: string): Promise<void> {
  return adapter.notify(title, body);
}

export function openExternal(url: string): Promise<boolean> {
  return adapter.openExternal(url);
}

export function writeClipboard(text: string): Promise<void> {
  return adapter.writeClipboard(text);
}

export function readClipboard(): Promise<string> {
  return adapter.readClipboard();
}

export function isAutostartEnabled(): Promise<boolean> {
  return adapter.isAutostartEnabled();
}

export function setAutostart(enabled: boolean): Promise<void> {
  return adapter.setAutostart(enabled);
}

export function focusMainWindow(): Promise<void> {
  return adapter.focusMainWindow();
}

export function openQuickPane(): Promise<void> {
  return adapter.openQuickPane();
}

export function hideCurrentWindow(): Promise<void> {
  return adapter.hideCurrentWindow();
}

export function onWindowFocusChanged(handler: (focused: boolean) => void): Promise<() => void> {
  return adapter.onWindowFocusChanged(handler);
}

export function emitNavigate(to: string): Promise<void> {
  return adapter.emitNavigate(to);
}

export function onNavigate(handler: (to: string) => void): Promise<() => void> {
  return adapter.onNavigate(handler);
}

export function onDeepLink(handler: (url: string) => void): Promise<() => void> {
  return adapter.onDeepLink(handler);
}

export function onFileDrop(handler: (paths: string[]) => void): Promise<() => void> {
  return adapter.onFileDrop(handler);
}

export function isAccessoryMode(): boolean {
  return adapter.isAccessoryMode();
}

export function setAccessoryMode(enabled: boolean): Promise<void> {
  return adapter.setAccessoryMode(enabled);
}

export function setGlobalShortcut(shortcut: string): Promise<void> {
  return adapter.setGlobalShortcut(shortcut);
}

export function getFocusedContext(): Promise<DesktopFocusedContext> {
  return adapter.getFocusedContext();
}

export function checkAccessibility(): Promise<boolean> {
  return adapter.checkAccessibility();
}

export function requestAccessibility(): Promise<void> {
  return adapter.requestAccessibility();
}

export function insertText(text: string): Promise<DesktopFocusedContext> {
  return adapter.insertText(text);
}

export function onDictationShortcut(
  handler: (event: DesktopDictationShortcutEvent) => void,
): Promise<() => void> {
  return adapter.onDictationShortcut(handler);
}

export function resizeCurrentWindow(width: number, height: number): Promise<void> {
  return adapter.resizeCurrentWindow(width, height);
}

export function loadAudioFixture(): Promise<DesktopAudioFixture | null> {
  return adapter.loadAudioFixture();
}

export function reportTranscribeFixtureSmoke(
  report: DesktopTranscribeFixtureSmokeReport,
): Promise<void> {
  return adapter.reportTranscribeFixtureSmoke(report);
}

export function micProbeEnabled(): Promise<boolean> {
  return adapter.micProbeEnabled();
}

export function reportMicProbe(report: DesktopMicProbeReport): Promise<void> {
  return adapter.reportMicProbe(report);
}
