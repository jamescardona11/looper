// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TranscriptSpeakerChip } from "./TranscriptSpeakerChip";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("TranscriptSpeakerChip", () => {
  test("shows the speaker name in the meeting conversation layout", () => {
    const setOpenIndex = vi.fn();

    render(
      <I18nProvider i18n={i18n}>
        <TranscriptSpeakerChip
          variant="label"
          segment={{
            start_ms: 0,
            end_ms: 1_000,
            text: "Ship the transcript.",
            speaker_id: "speaker-1",
          }}
          index={0}
          speakers={[
            { id: "speaker-1", name: "Ana", color: "var(--color-accent)" },
          ]}
          speakerById={
            new Map([
              [
                "speaker-1",
                {
                  id: "speaker-1",
                  name: "Ana",
                  color: "var(--color-accent)",
                },
              ],
            ])
          }
          openIndex={null}
          setOpenIndex={setOpenIndex}
          menuRef={createRef<HTMLDivElement>()}
          onAssign={vi.fn()}
          onAddSpeaker={vi.fn()}
        />
      </I18nProvider>,
    );

    const speakerButton = screen.getByRole("button", { name: "Ana" });
    expect(speakerButton.textContent).toBe("Ana");
    expect(speakerButton.className).toContain("after:-inset-y-2");

    fireEvent.click(speakerButton);
    expect(setOpenIndex).toHaveBeenCalledWith(0);
  });

  test("uses a readable speaker label when diarization is unavailable", () => {
    render(
      <I18nProvider i18n={i18n}>
        <TranscriptSpeakerChip
          variant="label"
          segment={{ start_ms: 0, end_ms: 1_000, text: "Hello." }}
          index={2}
          speakers={[]}
          speakerById={new Map()}
          openIndex={null}
          setOpenIndex={vi.fn()}
          menuRef={createRef<HTMLDivElement>()}
          onAssign={vi.fn()}
          onAddSpeaker={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Speaker 1").isConnected).toBe(true);
    expect(
      screen.getByRole("button", { name: "Assign speaker" }).isConnected,
    ).toBe(true);
  });
});
