import { useLingui as useItemContentTranslations } from "@lingui/react/macro";
import {
  CaretDown as ExpandIcon,
  CaretUp as CollapseIcon,
  Warning as FailureIcon,
  X as StopIcon,
} from "@phosphor-icons/react";
import type { MouseEvent, RefObject } from "react";
import DotMatrix from "../../../shared/ui/DotMatrix";
import TranscriptText from "../../../shared/ui/TranscriptText";
import type { TranscriptionItemPresentation } from "../transcription-item-policy";

const TIMELINE_CLASS_NAME =
  "flex items-center gap-x-2 mb-1 ui-text-meta ui-color-disabled whitespace-nowrap overflow-hidden";
const TRANSCRIPT_CLASS_NAME =
  "ui-text-body ui-color-primary leading-relaxed select-text cursor-text overflow-hidden break-words";
const EXPAND_BUTTON_CLASS_NAME =
  "flex items-center gap-1 mt-1 -ml-0.5 px-1 py-0.5 ui-text-meta ui-color-muted hover:text-content-secondary transition-colors rounded";

function TimelineSeparator() {
  return (
    <span aria-hidden="true" className="opacity-60">
      ·
    </span>
  );
}

function RetryIndicator(props: {
  cancelling: boolean;
  cancelAvailable: boolean;
  onCancel: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
}) {
  const { t } = useItemContentTranslations();
  const stopLabel = t({
    id: "transcriptions.item.stop_retry",
    message: "Stop transcription",
  });
  return (
    <>
      <TimelineSeparator />
      <button
        onClick={(event) => void props.onCancel(event)}
        disabled={props.cancelling || !props.cancelAvailable}
        className="flex items-center gap-1 ui-color-cloud font-medium group/stop hover:text-cloud-hover transition-colors"
        aria-label={stopLabel}
        title={stopLabel}
      >
        <span className="relative inline-flex items-center justify-center w-[9px] h-[9px]">
          <DotMatrix
            rows={1}
            cols={1}
            activeDots={[0]}
            dotSize={3}
            gap={1}
            color="var(--color-warning)"
            className="opacity-80 transition-opacity group-hover/stop:opacity-0"
          />
          <StopIcon
            size={9}
            className="absolute opacity-0 transition-opacity group-hover/stop:opacity-100"
            aria-hidden="true"
          />
        </span>
        {t({ id: "transcriptions.item.retrying", message: "Retrying..." })}
      </button>
    </>
  );
}

function ItemTimeline(props: {
  presentation: TranscriptionItemPresentation;
  showDate: boolean;
  retrying: boolean;
  cancellingRetry: boolean;
  cancelRetryAvailable: boolean;
  onCancelRetry: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
}) {
  const { t } = useItemContentTranslations();
  return (
    <div className={TIMELINE_CLASS_NAME}>
      {props.showDate ? (
        <>
          <span>{props.presentation.date}</span>
          <TimelineSeparator />
        </>
      ) : null}
      <span>{props.presentation.time}</span>
      {props.presentation.failed ? (
        <>
          <TimelineSeparator />
          <span className="flex items-center gap-1 ui-color-error-strong font-medium">
            <FailureIcon size={10} aria-hidden="true" className="opacity-80" />
            {t({ id: "transcriptions.item.failed", message: "Failed" })}
          </span>
        </>
      ) : null}
      {props.retrying ? (
        <RetryIndicator
          cancelling={props.cancellingRetry}
          cancelAvailable={props.cancelRetryAvailable}
          onCancel={props.onCancelRetry}
        />
      ) : null}
    </div>
  );
}

function TranscriptBody(props: {
  presentation: TranscriptionItemPresentation;
  textRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  overflowing: boolean;
  onSelectionChange: () => void;
  onToggleExpanded: () => void;
}) {
  const { t } = useItemContentTranslations();
  if (props.presentation.failed) {
    return (
      <p className="ui-text-body-sm ui-color-error-soft">
        {props.presentation.failure}
      </p>
    );
  }
  const expansionLabel = props.expanded
    ? t({ id: "transcriptions.item.show_less", message: "Show less" })
    : t({ id: "transcriptions.item.show_more", message: "Show more" });
  return (
    <>
      <div
        ref={props.textRef}
        className={`${TRANSCRIPT_CLASS_NAME} ${props.expanded ? "" : "line-clamp-3"}`}
        onMouseUp={props.onSelectionChange}
        onKeyUp={props.onSelectionChange}
      >
        <TranscriptText text={props.presentation.text || ""} />
      </div>
      {props.overflowing || props.expanded ? (
        <button
          onClick={props.onToggleExpanded}
          className={EXPAND_BUTTON_CLASS_NAME}
          aria-label={expansionLabel}
        >
          {props.expanded ? (
            <CollapseIcon size={11} aria-hidden="true" />
          ) : (
            <ExpandIcon size={11} aria-hidden="true" />
          )}
          <span>{expansionLabel}</span>
        </button>
      ) : null}
    </>
  );
}

export function TranscriptionItemContent(props: {
  presentation: TranscriptionItemPresentation;
  showDate: boolean;
  retrying: boolean;
  cancellingRetry: boolean;
  cancelRetryAvailable: boolean;
  onCancelRetry: (event: MouseEvent<HTMLButtonElement>) => Promise<void>;
  textRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  overflowing: boolean;
  onSelectionChange: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <ItemTimeline {...props} />
      <TranscriptBody {...props} />
    </div>
  );
}
