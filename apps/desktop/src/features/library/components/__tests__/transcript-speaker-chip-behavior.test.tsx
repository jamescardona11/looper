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
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TranscriptSpeakerChip } from "../TranscriptSpeakerChip";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const speakers = [
  { id: "speaker-a", name: "Ana", color: "var(--speaker-a)" },
  { id: "speaker-b", name: "Bea", color: "var(--speaker-b)" },
];

afterEach(cleanup);

describe("transcript speaker interactions", () => {
  test("keeps the dot trigger styling and closes without bubbling", () => {
    const setOpenIndex = vi.fn();
    const parentClick = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <div onClick={parentClick}>
          <TranscriptSpeakerChip
            segment={{
              start_ms: 0,
              end_ms: 1_000,
              text: "Hello",
              speaker_id: "speaker-a",
            }}
            index={3}
            speakers={speakers}
            speakerById={
              new Map(speakers.map((speaker) => [speaker.id, speaker]))
            }
            openIndex={3}
            setOpenIndex={setOpenIndex}
            menuRef={createRef<HTMLDivElement>()}
            onAssign={vi.fn()}
            onAddSpeaker={vi.fn()}
          />
        </div>
      </I18nProvider>,
    );

    const trigger = screen.getAllByRole("button", { name: "Ana" })[0];
    expect(trigger.className).toBe(
      "flex items-center justify-center p-1 -m-1 transition-opacity hover:opacity-80 ",
    );
    const dot = trigger.firstElementChild as HTMLSpanElement;
    expect(dot.className).toBe("inline-block h-2 w-2 rounded-full shrink-0 ");
    expect(dot.style.backgroundColor).toBe("var(--speaker-a)");

    fireEvent.click(trigger);

    expect(setOpenIndex).toHaveBeenCalledWith(null);
    expect(parentClick).not.toHaveBeenCalled();
  });

  test("keeps menu order and assigns, clears, and creates without bubbling", async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined);
    const onAddSpeaker = vi
      .fn()
      .mockResolvedValue({ id: "speaker-c", name: "Cam", color: null });
    const parentClick = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <div onClick={parentClick}>
          <TranscriptSpeakerChip
            variant="label"
            segment={{
              start_ms: 0,
              end_ms: 1_000,
              text: "Hello",
              speaker_id: "speaker-a",
            }}
            index={3}
            speakers={speakers}
            speakerById={
              new Map(speakers.map((speaker) => [speaker.id, speaker]))
            }
            openIndex={3}
            setOpenIndex={vi.fn()}
            menuRef={createRef<HTMLDivElement>()}
            onAssign={onAssign}
            onAddSpeaker={onAddSpeaker}
          />
        </div>
      </I18nProvider>,
    );

    const menu = document.querySelector('[class*="z-[120]"]') as HTMLDivElement;
    expect(menu.textContent).toBe("AnaBeaClear speakerAssign new speaker");
    expect(menu.className).toBe(
      "absolute left-0 top-full mt-1 z-[120] w-36 rounded-md border border-border-secondary/80 bg-surface-overlay shadow-lg shadow-black/40 overflow-hidden",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Bea" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Clear speaker" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign new speaker" }));

    await waitFor(() => expect(onAddSpeaker).toHaveBeenCalledOnce());
    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(3, "speaker-c"));
    expect(onAssign.mock.calls).toEqual([
      [3, "speaker-b"],
      [3, null],
      [3, "speaker-c"],
    ]);
    expect(parentClick).not.toHaveBeenCalled();
  });
});
