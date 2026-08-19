import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = import.meta.dirname;
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

const REDESIGNED_INTERACTION_FILES = [
  "Home.tsx",
  "features/library/components/LibraryView.tsx",
  "features/library/components/LibraryCard.tsx",
  "features/library/components/LibraryPlayerFooter.tsx",
  "features/settings/components/SettingsRoute.tsx",
  "features/settings/components/tabs/GeneralTab.tsx",
  "features/transcriptions/components/HomeAskBar.tsx",
  "features/transcriptions/components/TranscriptionList.tsx",
  "features/voice/components/VoiceView.tsx",
] as const;

describe("desktop redesign interaction contract", () => {
  test("names the properties animated by redesigned interactions", () => {
    const offenders = REDESIGNED_INTERACTION_FILES.filter((file) =>
      read(file).includes("transition-all"),
    );

    expect(
      offenders,
      "Use explicit transition properties so hover and state motion remain predictable",
    ).toEqual([]);
  });

  test("keeps the Home composer and meeting player explicitly docked", () => {
    const homeComposer = read(
      "features/transcriptions/components/HomeAskBar.tsx",
    );
    const meetingPlayer = read(
      "features/library/components/LibraryPlayerFooter.tsx",
    );

    expect(homeComposer).toContain('data-ui-dock="home-memory"');
    expect(homeComposer).toContain("sticky bottom-0");
    expect(meetingPlayer).toContain('data-ui-dock="meeting-player"');
    expect(meetingPlayer).toContain("sticky bottom-0 z-20");
  });

  test("keeps runtime notifications adjacent to their work surface", () => {
    const settingsNotification = read(
      "features/settings/components/SettingsErrorBanner.tsx",
    );
    const library = read("features/library/components/LibraryView.tsx");

    expect(settingsNotification).toContain(
      'data-notification-position="main-top"',
    );
    expect(settingsNotification).toContain('aria-live="assertive"');
    expect(library).toContain('data-notification-position="library-header"');
  });

  test("keeps Settings as a route surface instead of a modal shell", () => {
    const settingsRoute = read(
      "features/settings/components/SettingsRoute.tsx",
    );

    expect(settingsRoute).toContain("data-settings-route");
    expect(settingsRoute).toContain("overflow-x-hidden");
    expect(settingsRoute).not.toContain("aria-modal");
    expect(settingsRoute).not.toContain('role: "dialog"');
    expect(settingsRoute).not.toContain("fixed inset-0");
  });

  test("guards every redesigned moving surface with reduced-motion", () => {
    const movingSurfaces = [
      "Home.tsx",
      "features/library/components/LibraryPlayerFooter.tsx",
      "features/transcriptions/components/TranscriptionList.tsx",
    ];

    expect(
      movingSurfaces.filter((file) => !read(file).includes("useReducedMotion")),
    ).toEqual([]);
  });

  test("does not hide persistent native work surfaces before their first paint", () => {
    const library = read("features/library/components/LibraryView.tsx");
    const styleRow = read(
      "features/personalization/components/CompactStyleRow.tsx",
    );

    expect(library).not.toContain("initial={reduceMotion");
    expect(styleRow).toContain("initial={false}");
  });

  test("moves the Voice tab indicator with the selected native tab", () => {
    const voice = read("features/voice/components/VoiceView.tsx");

    expect(voice).toContain('layoutId="voice-active-tab"');
    expect(voice).toContain("duration: 0.22");
    expect(voice).toContain("reduceMotion");
    expect(voice).toContain("step === id ? (");
  });
});
