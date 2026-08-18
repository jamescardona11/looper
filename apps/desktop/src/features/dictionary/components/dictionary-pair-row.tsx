import { ArrowRight, Trash as Trash2 } from "@phosphor-icons/react";
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react";

export type DictionaryPairRowModel = {
  key: string;
  primary: string;
  secondary: ReactNode;
  deleteLabel: string;
};

export type DictionaryPairEditing = {
  index: number | null;
  rowClassName: string;
  marker: "data-replacement-edit" | "data-snippet-edit";
  primary: string;
  onPrimaryChange: (value: string) => void;
  secondary: string;
  onSecondaryChange: (value: string) => void;
  secondaryPlaceholder: string;
  onCancel: () => void;
  onCommit: () => void;
};

export type DictionaryPairRowActions = {
  itemRowClassName: string;
  shiftHeld: boolean;
  onDelete: (index: number) => void;
  onStartEditing: (index: number) => void;
  actionGradientStyle: CSSProperties;
  deleteButtonActiveClassName: string;
  deleteButtonClassName: string;
  deleteActionLabel: string;
};

const ROW_BUTTON =
  "flex flex-1 items-center text-left min-w-0 gap-2 px-2.5 py-2";
const PRIMARY_TEXT =
  "ui-text-body-lg ui-color-primary font-medium truncate min-w-0 flex-1 basis-0 transition-colors duration-100 ease-out";
const SECONDARY_TEXT =
  "ui-text-body-lg ui-color-primary truncate min-w-0 flex-1 basis-0 transition-colors duration-100 ease-out";
const DELETE_ACTION =
  "absolute inset-y-0 right-0 flex items-center gap-1 pl-6 pr-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto";
const EDIT_PRIMARY =
  "min-w-0 flex-1 basis-0 bg-transparent border-0 px-0 py-0 rounded-none ui-text-body-lg ui-color-primary font-medium outline-hidden focus:ring-0";
const EDIT_SECONDARY =
  "min-w-0 flex-1 basis-0 bg-transparent border-0 px-0 py-0 rounded-none ui-text-body-lg ui-color-primary placeholder-content-disabled outline-hidden focus:ring-0";
const EDIT_STYLE = {
  boxShadow: "inset 0 -1px 0 var(--color-border-hover)",
};

export function DictionaryPairRow({
  row,
  index,
  editing,
  actions,
}: {
  row: DictionaryPairRowModel;
  index: number;
  editing: DictionaryPairEditing;
  actions: DictionaryPairRowActions;
}) {
  if (editing.index === index) {
    return <DictionaryPairEditRow editing={editing} />;
  }
  const dangerTone = actions.shiftHeld
    ? "group-hover:!text-error group-hover:line-through"
    : "";
  return (
    <div className={actions.itemRowClassName}>
      <button
        onClick={() =>
          actions.shiftHeld
            ? actions.onDelete(index)
            : actions.onStartEditing(index)
        }
        className={ROW_BUTTON}
        title={actions.shiftHeld ? row.deleteLabel : undefined}
      >
        <span className={`${PRIMARY_TEXT} ${dangerTone}`}>{row.primary}</span>
        <ArrowRight
          size={14}
          className={`shrink-0 text-content-muted transition-colors duration-100 ease-out ${
            actions.shiftHeld ? "group-hover:!text-error" : ""
          }`}
          aria-hidden="true"
        />
        <span className={`${SECONDARY_TEXT} ${dangerTone}`}>
          {row.secondary}
        </span>
      </button>
      <div
        className={DELETE_ACTION}
        style={{ ...actions.actionGradientStyle, willChange: "opacity" }}
      >
        <button
          onClick={() => actions.onDelete(index)}
          className={
            actions.shiftHeld
              ? actions.deleteButtonActiveClassName
              : actions.deleteButtonClassName
          }
          title={actions.deleteActionLabel}
          aria-label={row.deleteLabel}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DictionaryPairEditRow({
  editing,
}: {
  editing: DictionaryPairEditing;
}) {
  const marker = { [editing.marker]: "" };
  const finishWhenLeaving = (event: FocusEvent<HTMLInputElement>) => {
    const container = event.currentTarget.closest(`[${editing.marker}]`);
    if (!container?.contains(event.relatedTarget as Node)) editing.onCommit();
  };
  const handleEditKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      editing.onCommit();
    }
    if (event.key === "Escape") editing.onCancel();
  };
  return (
    <div {...marker} className={`${editing.rowClassName} gap-2 px-2.5 py-2`}>
      <input
        value={editing.primary}
        onChange={(event) => editing.onPrimaryChange(event.target.value)}
        autoFocus
        onFocus={(event) => event.target.select()}
        onKeyDown={handleEditKey}
        onBlur={finishWhenLeaving}
        className={EDIT_PRIMARY}
        style={EDIT_STYLE}
      />
      <ArrowRight
        size={14}
        className="text-content-muted shrink-0"
        aria-hidden="true"
      />
      <input
        value={editing.secondary}
        onChange={(event) => editing.onSecondaryChange(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={handleEditKey}
        onBlur={finishWhenLeaving}
        placeholder={editing.secondaryPlaceholder}
        className={EDIT_SECONDARY}
        style={EDIT_STYLE}
      />
    </div>
  );
}
