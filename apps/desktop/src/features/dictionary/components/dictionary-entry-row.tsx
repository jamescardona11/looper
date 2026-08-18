import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { motion } from "framer-motion";
import { Trash as Trash2 } from "@phosphor-icons/react";

type DictionaryEntryRowProps = {
  entry: string;
  letterHeader: ReactNode;
  embedded: boolean;
  editing: boolean;
  editingValue: string;
  onEditingValueChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  shiftHeld: boolean;
  onDelete: () => void;
  onStartEditing: () => void;
  itemRowClassName: string;
  editRowClassName: string;
  actionGradientStyle: CSSProperties;
  deleteButtonClassName: string;
  deleteButtonActiveClassName: string;
  usageCount?: number;
};

export function DictionaryEntryRow(props: DictionaryEntryRowProps) {
  if (props.editing) return <DictionaryEntryEditor {...props} />;
  if (props.embedded) return <EmbeddedDictionaryEntry {...props} />;
  return <StandardDictionaryEntry {...props} />;
}

function DictionaryEntryEditor(props: DictionaryEntryRowProps) {
  return (
    <Fragment>
      {props.letterHeader}
      <div className={`${props.editRowClassName} px-2.5`}>
        <input
          value={props.editingValue}
          onChange={(event) => props.onEditingValueChange(event.target.value)}
          autoFocus
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              props.onEditCommit();
            }
            if (event.key === "Escape") props.onEditCancel();
          }}
          onBlur={props.onEditCommit}
          className="flex-1 min-w-0 bg-transparent border-0 px-0 py-0 rounded-none ui-text-body-lg ui-color-primary font-medium outline-hidden focus:ring-0"
          style={{
            boxShadow: "inset 0 -1px 0 var(--color-border-hover)",
          }}
        />
      </div>
    </Fragment>
  );
}

function EmbeddedDictionaryEntry(props: DictionaryEntryRowProps) {
  const { t } = useLingui();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={props.itemRowClassName}
    >
      <button
        onClick={props.shiftHeld ? props.onDelete : props.onStartEditing}
        className="flex-1 min-w-0 text-left px-2.5 py-2"
      >
        <p className="truncate ui-text-body-lg font-medium leading-tight ui-color-primary">
          {props.entry}
        </p>
      </button>
      <button
        onClick={props.onDelete}
        className={`${props.deleteButtonClassName} mr-2`}
        aria-label={t({
          id: "dictionary.delete_entry",
          message: `Delete ${props.entry}`,
        })}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

function StandardDictionaryEntry(props: DictionaryEntryRowProps) {
  const { t } = useLingui();
  return (
    <Fragment>
      {props.letterHeader}
      <div className={props.itemRowClassName}>
        <button
          onClick={props.shiftHeld ? props.onDelete : props.onStartEditing}
          className="flex-1 min-w-0 text-left px-2.5 py-2"
          title={
            props.shiftHeld
              ? t({
                  id: "dictionary.delete_entry",
                  message: `Delete ${props.entry}`,
                })
              : undefined
          }
        >
          <p
            className={`ui-text-body-lg ui-color-primary leading-tight font-medium truncate transition-colors duration-100 ease-out ${
              props.shiftHeld
                ? "group-hover:!text-error group-hover:line-through"
                : ""
            }`}
          >
            {props.entry}
            {props.usageCount ? (
              <span className="ml-2 ui-text-micro ui-color-disabled tabular-nums">
                {t({
                  id: "dictionary.entry.usage",
                  message: `${props.usageCount} uses`,
                })}
              </span>
            ) : null}
          </p>
        </button>
        <div
          className="absolute inset-y-0 right-0 flex items-center gap-1 pl-6 pr-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
          style={{ ...props.actionGradientStyle, willChange: "opacity" }}
        >
          <button
            onClick={props.onDelete}
            className={
              props.shiftHeld
                ? props.deleteButtonActiveClassName
                : props.deleteButtonClassName
            }
            title={t({ id: "dictionary.delete", message: "Delete" })}
            aria-label={t({
              id: "dictionary.delete_entry",
              message: `Delete ${props.entry}`,
            })}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Fragment>
  );
}
