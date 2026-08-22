import { useLingui } from "@lingui/react/macro";
import { Info } from "@phosphor-icons/react";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Personality } from "../../../contracts";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import {
  clampInstructionsHeight,
  clampInstructionsText,
  countInstructionsChars,
  DEFAULT_INSTRUCTIONS_HEIGHT,
  MAX_INSTRUCTIONS_CHARS,
} from "./personalization-utils";
import { instructionsFromText } from "./personality-modal-model";

const instructionClass = {
  section: ["shrink-0", "space-y-2"].join(" "),
  heading: ["flex items-center", "justify-between gap-2"].join(" "),
  titleGroup: ["flex", "items-center", "gap-1.5"].join(" "),
  title: ["ui-text-section-label-sm", "ui-color-muted"].join(" "),
  snippets: ["group/snippets", "relative"].join(" "),
  count: ["ui-text-meta ui-color-disabled", "tabular-nums"].join(" "),
  surface: ["rounded-lg", "bg-surface-surface", "px-3 py-2.5"].join(" "),
  resizeRow: ["flex", "items-center", "justify-end"].join(" "),
  info: [
    "flex h-4 w-4 items-center justify-center rounded-sm",
    "text-content-disabled transition-colors hover:text-content-muted",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-hover",
  ].join(" "),
  tooltip: [
    "absolute left-full top-1/2 z-30 hidden -translate-y-[42%] pl-2",
    "group-hover/snippets:block group-focus-within/snippets:block",
  ].join(" "),
  textarea: [
    "w-full resize-none bg-transparent ui-text-label font-mono ui-color-primary",
    "placeholder-content-disabled outline-hidden instructions-scroll",
  ].join(" "),
  resize: [
    "h-4 w-4 rounded-sm text-content-disabled",
    "hover:text-content-secondary transition-colors cursor-pointer touch-none",
  ].join(" "),
};

function InstructionsResizeSession({
  pointerY,
  initialHeight,
  resize,
  finish,
}: {
  pointerY: number;
  initialHeight: number;
  resize: (height: number) => void;
  finish: () => void;
}) {
  useMountEffect(() => {
    const move = (event: PointerEvent) =>
      resize(clampInstructionsHeight(initialHeight + event.clientY - pointerY));
    const stop = () => finish();
    const listeners = [
      ["pointermove", move],
      ["pointerup", stop],
      ["pointercancel", stop],
      ["blur", stop],
    ] as const;
    for (const [name, listener] of listeners) {
      window.addEventListener(name, listener as EventListener);
    }
    return () => {
      for (const [name, listener] of listeners) {
        window.removeEventListener(name, listener as EventListener);
      }
    };
  });
  return null;
}

export function PersonalityInstructions({
  personality: mode,
  update,
}: {
  personality: Readonly<Personality>;
  update: (patch: Partial<Personality>) => void;
}) {
  const { t: translate } = useLingui();
  const [text, setText] = useState(() =>
    clampInstructionsText(mode.instructions.join("\n")),
  );
  const [height, setHeight] = useState(DEFAULT_INSTRUCTIONS_HEIGHT);
  const [resizing, setResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(DEFAULT_INSTRUCTIONS_HEIGHT);

  const changeText = (input: string) => {
    const limited = clampInstructionsText(input);
    setText(limited);
    update({ instructions: instructionsFromText(limited) });
  };
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startY.current = event.clientY;
    startHeight.current = height;
    setResizing(true);
  };

  return (
    <section className={instructionClass.section}>
      {resizing ? (
        <InstructionsResizeSession
          pointerY={startY.current}
          initialHeight={startHeight.current}
          resize={setHeight}
          finish={() => setResizing(false)}
        />
      ) : null}
      <div className={instructionClass.heading}>
        <div className={instructionClass.titleGroup}>
          <h3 className={instructionClass.title}>
            {translate({
              id: "personalization.modal.custom_instructions",
              message: "Custom instructions",
            })}
          </h3>
          <div className={instructionClass.snippets}>
            <button
              type="button"
              className={instructionClass.info}
              aria-label={translate({
                id: "personalization.modal.snippets.info",
                message: "Show personalization snippet examples",
              })}
            >
              <Info size={11} aria-hidden="true" />
            </button>
            <div role="tooltip" className={instructionClass.tooltip}>
              <div className="w-72 rounded-lg border border-border-secondary bg-surface-overlay px-3 py-2.5 text-left shadow-lg">
                <p className="ui-text-meta ui-color-primary">
                  {translate({
                    id: "personalization.modal.snippets.summary",
                    message:
                      "Use snippets to pass live context to the language model, like",
                  })}{" "}
                  <code>{"{{date}}"}</code>, <code>{"{{app}}"}</code>,{" "}
                  <code>{"{{window}}"}</code>.
                </p>
              </div>
            </div>
          </div>
        </div>
        <span className={instructionClass.count}>
          {countInstructionsChars(text)}/{MAX_INSTRUCTIONS_CHARS}
        </span>
      </div>
      <div className={instructionClass.surface}>
        <textarea
          value={text}
          onChange={(event) => changeText(event.target.value)}
          placeholder={translate({
            id: "personalization.modal.custom_instructions.placeholder",
            message: "Add custom instructions",
          })}
          aria-label={translate({
            id: "personalization.modal.custom_instructions",
            message: "Custom instructions",
          })}
          className={instructionClass.textarea}
          style={{ height: `${height}px` }}
        />
        <div className={instructionClass.resizeRow}>
          <button
            type="button"
            onPointerDown={beginResize}
            className={instructionClass.resize}
            aria-label={translate({
              id: "personalization.modal.custom_instructions.resize",
              message: "Resize custom instructions",
            })}
            title={translate({
              id: "personalization.modal.custom_instructions.drag",
              message: "Drag to resize",
            })}
          >
            <svg
              viewBox="0 0 20 20"
              className="h-full w-full"
              aria-hidden="true"
            >
              <path
                {...{
                  d: "M7 13L13 7M9.5 13L13 9.5M12 13L13 12",
                  stroke: "currentColor",
                  strokeWidth: "1.25",
                  strokeLinecap: "round",
                }}
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
