// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  DetectedApp,
  ImportPreview,
  ImportResult,
  ImportSelections,
} from "../../../../types";
import type { StepMotionProps } from "../../../onboarding/steps/shared";

const importGateway = vi.hoisted(() => ({
  applyImport: vi.fn(),
  detectImportableApps: vi.fn(),
  previewImport: vi.fn(),
}));

vi.mock("../../../../data/imports", () => importGateway);

import { ImportStep } from "../ImportStep";

const sources: DetectedApp[] = [
  { id: "source-a", name: "Source A" },
  { id: "source-b", name: "Source B" },
];

const importPreview = (
  id: string,
  overrides: Partial<ImportPreview> = {},
): ImportPreview => ({
  id,
  name: id === "source-a" ? "Source A" : "Source B",
  dictionaryCount: 1,
  replacementsCount: 0,
  personalitiesCount: 0,
  transcriptCount: 1,
  shortcut: null,
  language: null,
  autoLaunch: null,
  modelSource: null,
  modelKey: null,
  modelRecognized: false,
  ...overrides,
});

const appliedResult: ImportResult = {
  dictionaryAdded: 1,
  replacementsAdded: 0,
  personalitiesAdded: 0,
  transcriptsAdded: 1,
  shortcutApplied: false,
  languageApplied: false,
  autoLaunchApplied: false,
  modelUnrecognized: false,
  shortcut: null,
  modelKey: null,
  autoLaunch: null,
};

const motion: StepMotionProps = {
  custom: 1,
  variants: {},
  animate: "center",
  exit: "exit",
  transition: { duration: 0, ease: "easeOut" },
};

function renderImportStep(
  overrides: {
    apps?: DetectedApp[];
    onApplied?: (result: ImportResult) => void;
    onNext?: () => void;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const props = {
    stepMotionProps: motion,
    apps: overrides.apps ?? sources,
    onApplied: overrides.onApplied ?? vi.fn(),
    onNext: overrides.onNext ?? vi.fn(),
  };
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: "en", messages: {} });
  const view = render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <ImportStep {...props} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { ...view, client, invalidate, props };
}

beforeEach(() => {
  importGateway.previewImport.mockImplementation((id: string) =>
    Promise.resolve(
      id === "source-a"
        ? importPreview(id)
        : importPreview(id, {
            dictionaryCount: 0,
            transcriptCount: 0,
            language: "Spanish",
          }),
    ),
  );
  importGateway.applyImport.mockResolvedValue(appliedResult);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportStep", () => {
  test("switches sources and resets category selections", async () => {
    renderImportStep();
    const dictionary = await screen.findByRole("button", {
      name: /Dictionary/,
    });
    expect(dictionary.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dictionary);
    expect(dictionary.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("radio", { name: "Source B" }));
    expect(await screen.findByText("Language")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Source A" }));
    const resetDictionary = await screen.findByRole("button", {
      name: /Dictionary/,
    });
    expect(resetDictionary.getAttribute("aria-pressed")).toBe("true");
    expect(importGateway.previewImport).toHaveBeenCalledWith("source-a");
    expect(importGateway.previewImport).toHaveBeenCalledWith("source-b");
  });

  test("applies the selected payload and invalidates affected caches", async () => {
    const onApplied = vi.fn();
    const { invalidate } = renderImportStep({
      apps: [sources[0]],
      onApplied,
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Transcript history/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(appliedResult));
    const selections = importGateway.applyImport.mock.calls[0]?.[1] as
      ImportSelections | undefined;
    expect(importGateway.applyImport).toHaveBeenCalledWith(
      "source-a",
      expect.any(Object),
    );
    expect(selections).toEqual(
      expect.objectContaining({ dictionary: true, history: false }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["settings"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transcriptions"] });
  });

  test("keeps skip available after an apply failure", async () => {
    importGateway.applyImport.mockRejectedValueOnce(new Error("write failed"));
    const onNext = vi.fn();
    renderImportStep({ apps: [sources[0]], onNext });
    await screen.findByText("Dictionary");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(
      await screen.findByText("Import failed. Try again or skip."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  test("locks footer actions and shows progress while applying", async () => {
    let finishImport: ((result: ImportResult) => void) | undefined;
    importGateway.applyImport.mockImplementationOnce(
      () =>
        new Promise<ImportResult>((resolve) => {
          finishImport = resolve;
        }),
    );
    const onApplied = vi.fn();
    renderImportStep({ apps: [sources[0]], onApplied });
    await screen.findByText("Dictionary");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    const importing = await screen.findByRole("button", {
      name: "Importing...",
    });
    const skip = screen.getByRole("button", { name: "Skip for now" });
    expect((importing as HTMLButtonElement).disabled).toBe(true);
    expect((skip as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finishImport?.(appliedResult));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(appliedResult));
  });

  test("surfaces a preview read failure without enabling import", async () => {
    importGateway.previewImport.mockRejectedValueOnce(new Error("read failed"));
    renderImportStep({ apps: [sources[0]] });
    expect(
      await screen.findByText(
        "We couldn't read this app's data. You can skip and set things up manually.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Import" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test("preserves the seven-row layout reserve while previewing", async () => {
    const { container } = renderImportStep({ apps: [sources[0]] });
    await screen.findByText("Dictionary");
    const reserve = container.querySelector(".invisible.pointer-events-none");
    expect(reserve?.children).toHaveLength(7);
    expect(container.querySelector(".max-w-lg")).toBeTruthy();
    expect(
      screen.getByText("Source A").closest(".bg-surface-secondary")?.className,
    ).toContain("rounded-xl");
  });
});
