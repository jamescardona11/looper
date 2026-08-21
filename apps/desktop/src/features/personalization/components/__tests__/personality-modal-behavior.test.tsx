// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Personality } from "../../../../types";

const tauri = vi.hoisted(() => ({ convertFileSrc: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: tauri.convertFileSrc,
}));

import PersonalityModal from "../PersonalityModal";

const i18n = setupI18n();
const messages = {
  "personalization.new_mode.default_name": "NEW MODE DISTINCT",
  "personalization.modal.edit_name": "EDIT NAME DISTINCT",
  "personalization.modal.save_name": "SAVE NAME DISTINCT",
  "personalization.modal.delete_mode": "DELETE MODE DISTINCT",
  "personalization.modal.close": "CLOSE MODAL DISTINCT",
  "personalization.modal.custom_instructions": "INSTRUCTIONS DISTINCT",
  "personalization.modal.custom_instructions.placeholder":
    "INSTRUCTIONS PLACEHOLDER DISTINCT",
  "personalization.modal.custom_instructions.resize": "RESIZE DISTINCT",
  "personalization.modal.custom_instructions.drag": "DRAG DISTINCT",
  "personalization.modal.snippets.info": "SNIPPETS INFO DISTINCT",
  "personalization.modal.snippets.summary": "SNIPPETS SUMMARY DISTINCT",
  "personalization.modal.applications": "APPLICATIONS DISTINCT",
  "personalization.modal.applications.add": "ADD APPLICATION DISTINCT",
  "personalization.modal.applications.toggle_list": "TOGGLE APPS DISTINCT",
  "personalization.modal.applications.none": "NO APPLICATIONS DISTINCT",
  "personalization.modal.applications.not_installed": "NOT INSTALLED DISTINCT",
  "personalization.modal.websites": "WEBSITES DISTINCT",
  "personalization.modal.websites.placeholder": "SITE PLACEHOLDER DISTINCT",
  "personalization.modal.websites.aria": "ADD WEBSITE DISTINCT",
  "personalization.modal.websites.none": "NO WEBSITES DISTINCT",
  "personalization.modal.website.invalid": "INVALID DOMAIN DISTINCT",
  "personalization.modal.website.duplicate": "DUPLICATE DOMAIN DISTINCT",
  "personalization.modal.add": "ADD DISTINCT",
  "personalization.modal.remove": "REMOVE DISTINCT",
  "personalization.modal.remove_app": "REMOVE APP DISTINCT",
  "personalization.modal.remove_site": "REMOVE SITE DISTINCT",
};

const baseMode = (patch: Partial<Personality> = {}): Personality => ({
  id: "mode-one",
  name: "Focused",
  enabled: false,
  apps: [{ name: "Ghost", identifier: "ghost.app" }],
  websites: ["example.com"],
  instructions: ["Line one", "Line two"],
  ...patch,
});

const callbacks = () => ({
  onClose: vi.fn(),
  onUpdate: vi.fn(),
  onUpdateList: vi.fn(),
  onAssignApp: vi.fn(),
  onDelete: vi.fn(),
});

const installedApps = [
  {
    name: "Safari",
    identifier: "com.apple.Safari",
    path: "/Applications/Safari.app",
    icon_path: "/tmp/safari.png",
  },
  {
    name: "Safari duplicate",
    identifier: "com.apple.Safari",
    path: "/Applications/Safari Copy.app",
  },
  {
    name: "Slack",
    identifier: "com.tinyspeck.slackmacgap",
    path: "/Applications/Slack.app",
  },
];

function renderModal(personality: Personality, handlers = callbacks()) {
  const node = (
    <I18nProvider i18n={i18n}>
      <PersonalityModal
        personality={personality}
        installedApps={installedApps}
        websiteIconBySite={{ "example.com": "/tmp/example.png" }}
        {...handlers}
      />
    </I18nProvider>
  );
  return { ...render(node), handlers };
}

beforeEach(() => {
  tauri.convertFileSrc
    .mockReset()
    .mockImplementation((path) => `asset:${path}`);
  i18n.loadAndActivate({ locale: "distinct", messages });
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PersonalityModal", () => {
  test("preserves the dialog tree, classes, backdrop, close and delete actions", () => {
    const { handlers } = renderModal(baseMode());
    const dialog = screen.getByRole("dialog");

    expect(dialog.className).toBe(
      "fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xs",
    );
    const panel = dialog.firstElementChild as HTMLElement;
    expect(panel.className).toBe(
      "relative w-[540px] h-[640px] max-w-[92vw] max-h-[92vh] bg-surface-overlay border border-border-secondary rounded-2xl shadow-2xl flex flex-col overflow-hidden",
    );
    expect(panel.children).toHaveLength(2);
    expect((panel.children[1] as HTMLElement).className).toBe(
      "flex flex-col gap-5 p-5 flex-1 min-h-0 overflow-hidden",
    );
    expect(screen.getByText("APPLICATIONS DISTINCT").tagName).toBe("H3");
    expect(screen.getByText("WEBSITES DISTINCT").tagName).toBe("H3");
    expect(screen.getByRole("tooltip").textContent).toContain(
      "SNIPPETS SUMMARY DISTINCT",
    );

    fireEvent.click(panel);
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "DELETE MODE DISTINCT" }),
    );
    expect(handlers.onDelete).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "CLOSE MODAL DISTINCT" }),
    );
    fireEvent.click(dialog);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });

  test("supports create-name clearing, save, and keyboard cancellation", () => {
    const { handlers } = renderModal(baseMode({ name: "NEW MODE DISTINCT" }));

    fireEvent.click(screen.getByRole("heading", { name: "NEW MODE DISTINCT" }));
    const editor = screen.getByRole("textbox", { name: "EDIT NAME DISTINCT" });
    expect((editor as HTMLInputElement).value).toBe("");
    fireEvent.change(editor, { target: { value: "  Clinical notes  " } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(handlers.onUpdate).toHaveBeenCalledWith({ name: "Clinical notes" });

    fireEvent.click(screen.getByRole("heading", { name: "NEW MODE DISTINCT" }));
    const cancelled = screen.getByRole("textbox", {
      name: "EDIT NAME DISTINCT",
    });
    fireEvent.change(cancelled, { target: { value: "Discard me" } });
    fireEvent.keyDown(cancelled, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "EDIT NAME DISTINCT" })).toBe(
      null,
    );
    expect(handlers.onUpdate).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  test("filters, navigates, assigns and removes applications", () => {
    const mode = baseMode();
    const { handlers } = renderModal(mode);
    const combo = screen.getByRole("combobox", {
      name: "ADD APPLICATION DISTINCT",
    });

    expect(screen.getByText("NOT INSTALLED DISTINCT").textContent).toBe(
      "NOT INSTALLED DISTINCT",
    );
    fireEvent.focus(combo);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(handlers.onAssignApp).toHaveBeenCalledWith({
      name: "Slack",
      identifier: "com.tinyspeck.slackmacgap",
    });

    fireEvent.change(combo, { target: { value: "Made Up" } });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(handlers.onAssignApp).toHaveBeenLastCalledWith({
      name: "Made Up",
      identifier: null,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "REMOVE APP DISTINCT" }),
    );
    const updater = handlers.onUpdateList.mock.calls[0][0];
    expect(updater(mode)).toEqual({ ...mode, apps: [] });
    expect(updater(mode).enabled).toBe(false);
  });

  test("validates, normalizes, adds and removes websites", () => {
    const mode = baseMode();
    const { handlers } = renderModal(mode);
    const domain = screen.getByRole("textbox", {
      name: "ADD WEBSITE DISTINCT",
    });

    fireEvent.change(domain, { target: { value: "invalid" } });
    fireEvent.keyDown(domain, { key: "Enter" });
    expect(screen.getByText("INVALID DOMAIN DISTINCT").textContent).toBe(
      "INVALID DOMAIN DISTINCT",
    );
    fireEvent.change(domain, { target: { value: "EXAMPLE.com" } });
    fireEvent.click(screen.getByRole("button", { name: "ADD DISTINCT" }));
    expect(screen.getByText("DUPLICATE DOMAIN DISTINCT").textContent).toBe(
      "DUPLICATE DOMAIN DISTINCT",
    );

    fireEvent.change(domain, {
      target: { value: "https://New.Example.com/path" },
    });
    fireEvent.keyDown(domain, { key: "Enter" });
    expect(handlers.onUpdate).toHaveBeenCalledWith({
      websites: ["example.com", "new.example.com"],
    });
    expect((domain as HTMLInputElement).value).toBe("");

    fireEvent.click(
      screen.getByRole("button", { name: "REMOVE SITE DISTINCT" }),
    );
    expect(handlers.onUpdate).toHaveBeenLastCalledWith({ websites: [] });
  });

  test("limits instructions, resizes, cleans listeners, and resets for a new id", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const first = baseMode();
    const { handlers, rerender, unmount } = renderModal(first);
    const instructions = screen.getByRole("textbox", {
      name: "INSTRUCTIONS DISTINCT",
    }) as HTMLTextAreaElement;
    expect(instructions.value).toBe("Line one\nLine two");
    expect(instructions.style.height).toBe("128px");

    fireEvent.change(instructions, { target: { value: "x".repeat(3_100) } });
    expect(instructions.value).toHaveLength(3_000);
    expect(screen.getByText("3000/3000").textContent).toBe("3000/3000");
    expect(handlers.onUpdate).toHaveBeenCalledWith({
      instructions: ["x".repeat(3_000)],
    });

    const resize = screen.getByRole("button", { name: "RESIZE DISTINCT" });
    fireEvent.pointerDown(resize, { button: 0, pointerId: 7, clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 180 });
    expect(instructions.style.height).toBe("208px");
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientY: 250 });
    expect(instructions.style.height).toBe("208px");

    const nextMode = baseMode({
      id: "mode-two",
      name: "Second",
      instructions: ["Fresh"],
    });
    rerender(
      <I18nProvider i18n={i18n}>
        <PersonalityModal
          personality={nextMode}
          installedApps={installedApps}
          websiteIconBySite={{}}
          {...handlers}
        />
      </I18nProvider>,
    );
    const fresh = screen.getByRole("textbox", {
      name: "INSTRUCTIONS DISTINCT",
    }) as HTMLTextAreaElement;
    expect(fresh.value).toBe("Fresh");
    expect(fresh.style.height).toBe("128px");

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "RESIZE DISTINCT" }),
      { button: 0, pointerId: 8, clientY: 40 },
    );
    unmount();
    expect(removeListener).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
    );
    expect(removeListener).toHaveBeenCalledWith(
      "pointerup",
      expect.any(Function),
    );
  });

  test("shows both empty-state translations", () => {
    renderModal(baseMode({ apps: [], websites: [] }));
    expect(screen.getByText("NO APPLICATIONS DISTINCT").textContent).toBe(
      "NO APPLICATIONS DISTINCT",
    );
    expect(screen.getByText("NO WEBSITES DISTINCT").textContent).toBe(
      "NO WEBSITES DISTINCT",
    );
  });
});
