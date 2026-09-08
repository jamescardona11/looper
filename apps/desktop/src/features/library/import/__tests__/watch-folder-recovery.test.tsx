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
import WatchFoldersSetting from "../WatchFoldersSetting";
import { ImportModelWarning } from "../library-import-model-warning";
const open = vi.hoisted(() => vi.fn());
vi.mock("../../../../data/settings", () => ({ openModelsSettings: open }));
vi.mock("../../../settings/preferences/queries", () => ({
  useSettings: () => ({ data: "" }),
}));
vi.mock("../../../settings/models/models-queries", () => ({
  useSpeechModels: () => ({ data: [] }),
}));
vi.mock("../../queries", () => ({
  useLibraryWatchFolders: () => ({ data: [] }),
  useAddLibraryWatchFolder: () => ({}),
  useRemoveLibraryWatchFolder: () => ({}),
  useScanLibraryWatchFolders: () => ({}),
}));
const i18n = setupI18n({ locale: "en", messages: { en: {} } });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test.each([WatchFoldersSetting, ImportModelWarning])(
  "offers model setup when no usable model exists",
  async (Component) => {
    render(
      <I18nProvider i18n={i18n}>
        <Component />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open models" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  },
);
