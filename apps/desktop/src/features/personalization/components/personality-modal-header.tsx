import { useLingui } from "@lingui/react/macro";
import {
  Check,
  PencilSimple as Pencil,
  Trash as Trash2,
  X,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { Personality } from "../../../contracts";
import DotMatrix from "../../../shared/ui/DotMatrix";
import { normalizeEntry } from "./personalization-utils";

const headerClass = {
  root: [
    "flex items-center justify-between gap-3",
    "px-5 py-2.5 border-b border-border-primary",
  ].join(" "),
  identity: ["flex items-center gap-2.5", "min-w-0"].join(" "),
  editor: [
    "bg-transparent ui-text-title-lg font-semibold ui-color-primary",
    "outline-hidden border-b border-border-hover",
  ].join(" "),
  save: [
    "h-[26px] w-[26px] flex items-center justify-center rounded-md",
    "hover:bg-surface-elevated text-content-muted",
    "hover:text-content-primary transition-colors",
  ].join(" "),
  title: [
    "ui-text-title-lg font-medium ui-color-primary",
    "group-hover/title:text-content-secondary transition-colors",
  ].join(" "),
  delete: [
    "flex h-7 w-7 items-center justify-center rounded-lg",
    "text-content-muted hover:bg-red-500/10 hover:text-red-400",
    "transition-colors",
  ].join(" "),
  close: [
    "flex h-7 w-7 items-center justify-center rounded-lg",
    "text-content-muted hover:bg-surface-elevated",
    "hover:text-content-secondary transition-colors",
  ].join(" "),
};

export function PersonalityModalHeader({
  personality: mode,
  update,
  close,
  remove,
}: {
  personality: Personality;
  update: (patch: Partial<Personality>) => void;
  close: () => void;
  remove: () => void;
}) {
  const { t } = useLingui();
  const editorRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mode.name);

  const commit = () => {
    const nextName = normalizeEntry(draft);
    if (!nextName) setDraft(mode.name);
    else if (nextName !== mode.name) update({ name: nextName });
  };
  const save = () => {
    commit();
    setEditing(false);
  };
  const beginEditing = () => {
    const defaultName = t({
      id: "personalization.new_mode.default_name",
      message: "New Mode",
    });
    if (mode.name === defaultName) setDraft("");
    setEditing(true);
  };

  return (
    <div className={headerClass.root}>
      <div className={headerClass.identity}>
        <DotMatrix
          {...{
            rows: 2,
            cols: 3,
            activeDots: [0, 2, 3],
            dotSize: 3,
            gap: 3,
            color: "var(--color-section-marker-alt)",
            "aria-hidden": "true",
          }}
        />
        <div className="min-w-0">
          <div className="h-[26px] flex items-center">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  ref={editorRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoFocus
                  aria-label={t({
                    id: "personalization.modal.edit_name",
                    message: "Edit mode name",
                  })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setDraft(mode.name);
                      setEditing(false);
                    }
                  }}
                  onBlur={save}
                  className={headerClass.editor}
                />
                <button
                  onClick={save}
                  className={headerClass.save}
                  aria-label={t({
                    id: "personalization.modal.save_name",
                    message: "Save name",
                  })}
                >
                  <Check size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div
                onClick={beginEditing}
                className="group/title flex items-center gap-2 cursor-pointer"
              >
                <h2 id="modal-title" className={headerClass.title}>
                  {mode.name}
                </h2>
                <Pencil
                  size={11}
                  className={[
                    "opacity-0 group-hover/title:opacity-100",
                    "transition-opacity text-content-muted",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={remove}
          className={headerClass.delete}
          title={t({
            id: "personalization.modal.delete_mode",
            message: "Delete mode",
          })}
          aria-label={t({
            id: "personalization.modal.delete_mode",
            message: "Delete mode",
          })}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
        <button
          onClick={close}
          className={headerClass.close}
          aria-label={t({
            id: "personalization.modal.close",
            message: "Close modal",
          })}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
