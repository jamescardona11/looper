// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LibrarySetupAction } from "../library-setup-action";
const open = vi.hoisted(() => ({ models: vi.fn(), ai: vi.fn() }));
vi.mock("../../../data/settings", () => ({
  openModelsSettings: open.models,
  openMeetingAiSettings: open.ai,
}));
const i18n = setupI18n({ locale: "en", messages: { en: {} } });
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
test.each([false, true])(
  "opens the correct setup destination (meeting AI: %s)",
  async (meetingAi) => {
    render(
      <I18nProvider i18n={i18n}>
        <LibrarySetupAction meetingAi={meetingAi} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(meetingAi ? open.ai : open.models).toHaveBeenCalledTimes(1),
    );
  },
);
test("shows navigation failure and allows retry", async () => {
  open.models.mockRejectedValueOnce(new Error("Unavailable"));
  render(
    <I18nProvider i18n={i18n}>
      <LibrarySetupAction />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not open settings",
  );
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(open.models).toHaveBeenCalledTimes(2));
});
