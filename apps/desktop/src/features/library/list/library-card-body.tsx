import { useLingui } from "@lingui/react/macro";
import type { KeyboardEvent } from "react";
import type { LibraryItem } from "../../../contracts";
import { IntelligencePixel } from "../../../shared/ui/IntelligencePixel";
import { formatDuration, formatLibraryName } from "../shared/library-utils";
import { buildMiniWaveform } from "../player/library-waveform";
import {
  formatCardCreatedAt,
  type LibraryCardProps,
} from "./library-card-model";

type LibraryCardBodyProps = Pick<
  LibraryCardProps,
  | "item"
  | "editingNameDraft"
  | "onChangeNameDraft"
  | "onCommitNameEdit"
  | "onCancelNameEdit"
  | "tagDraft"
  | "onStartTagEdit"
  | "onChangeTagDraft"
  | "onCommitTagAdd"
  | "onCancelTagEdit"
  | "onRemoveTag"
  | "onClickTag"
  | "shiftHeld"
> & {
  editingName: boolean;
  editingTag: boolean;
};

export function LibraryCardMedia({
  item,
  transcribing,
}: {
  item: LibraryItem;
  transcribing: boolean;
}) {
  const waveform = buildMiniWaveform(item.segments);
  return (
    <div className="flex h-10 items-center justify-center">
      {waveform.length === 0 ? (
        <IntelligencePixel
          active={transcribing || item.status.type === "recording"}
          statusType={item.status.type}
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 64 28" className="h-7 w-16">
          {waveform.map((bar, index) => (
            <rect
              key={`${index}-${bar.height}-${bar.speakerIndex}`}
              x={1 + index * 5}
              y={(28 - bar.height) / 2}
              width="3"
              height={bar.height}
              rx="1.5"
              fill={`var(--data-speaker-${bar.speakerIndex + 1})`}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function LibraryCardBody(props: LibraryCardBodyProps) {
  const { t } = useLingui();
  return (
    <div className="min-w-0">
      {props.editingName ? (
        <input
          value={props.editingNameDraft}
          aria-label={t({
            id: "library.card.edit_name",
            message: "Edit meeting name",
          })}
          onChange={(event) => props.onChangeNameDraft(event.target.value)}
          onKeyDown={(event) =>
            handleEditorKey(
              event,
              props.onCommitNameEdit,
              props.onCancelNameEdit,
            )
          }
          onBlur={props.onCommitNameEdit}
          onClick={(event) => event.stopPropagation()}
          className="w-full border-b border-border-hover bg-transparent ui-text-body-sm-strong text-content-primary outline-none"
          autoFocus
        />
      ) : (
        <h3 className="truncate ui-text-body-sm-strong text-content-primary">
          {formatLibraryName(props.item.name)}
        </h3>
      )}
      <LibraryCardMetadata
        item={props.item}
        editingTag={props.editingTag}
        tagDraft={props.tagDraft}
        onStartTagEdit={props.onStartTagEdit}
        onChangeTagDraft={props.onChangeTagDraft}
        onCommitTagAdd={props.onCommitTagAdd}
        onCancelTagEdit={props.onCancelTagEdit}
        onRemoveTag={props.onRemoveTag}
        onClickTag={props.onClickTag}
        shiftHeld={props.shiftHeld}
      />
    </div>
  );
}

function LibraryCardMetadata(
  props: Pick<
    LibraryCardBodyProps,
    | "item"
    | "editingTag"
    | "tagDraft"
    | "onStartTagEdit"
    | "onChangeTagDraft"
    | "onCommitTagAdd"
    | "onCancelTagEdit"
    | "onRemoveTag"
    | "onClickTag"
    | "shiftHeld"
  >,
) {
  const { t } = useLingui();
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 ui-text-micro text-content-muted">
      <span>{formatCardCreatedAt(props.item.created_at)}</span>
      <span aria-hidden="true">·</span>
      <span>{formatDuration(props.item.duration_seconds)}</span>
      {props.item.source_path ? (
        <>
          <span aria-hidden="true">·</span>
          <span>Imported</span>
        </>
      ) : null}
      {props.item.speakers?.length ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{props.item.speakers.length} speakers</span>
        </>
      ) : null}
      {props.editingTag ? (
        <input
          value={props.tagDraft}
          aria-label={t({
            id: "library.card.new_tag_aria",
            message: "New tag",
          })}
          onChange={(event) => props.onChangeTagDraft(event.target.value)}
          onKeyDown={(event) =>
            handleEditorKey(event, props.onCommitTagAdd, props.onCancelTagEdit)
          }
          onBlur={props.onCancelTagEdit}
          onClick={(event) => event.stopPropagation()}
          placeholder="Tag…"
          className="w-24 border-b border-border-hover bg-transparent outline-none"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onStartTagEdit();
          }}
          className="text-content-disabled hover:text-content-primary"
          aria-label={t({ id: "library.card.add_tag", message: "Add tag" })}
        >
          + Tag
        </button>
      )}
      {props.item.tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (props.shiftHeld) void props.onRemoveTag(tag);
            else props.onClickTag?.(tag);
          }}
          className="text-[var(--color-accent)] hover:underline"
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

function handleEditorKey(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
  cancel: () => void,
) {
  event.stopPropagation();
  if (event.key === "Enter" && !event.nativeEvent.isComposing) commit();
  else if (event.key === "Escape") cancel();
}
