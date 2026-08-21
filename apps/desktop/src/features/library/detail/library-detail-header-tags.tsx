import { useLingui } from "@lingui/react/macro";
import { Plus, X } from "@phosphor-icons/react";

import { HeaderMenuSurface } from "./library-detail-header-menu";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

type TagsProps = Pick<
  LibraryDetailHeaderProps,
  | "availableTags"
  | "filteredTagOptions"
  | "handleAddTag"
  | "handleRemoveTag"
  | "item"
  | "setTagInput"
  | "setTagMenuOpen"
  | "shiftHeld"
  | "tagInput"
  | "tagMenuOpen"
  | "tagMenuRef"
>;

const TAG_MENU = [
  "absolute right-0 top-full mt-1 z-[120] w-40 rounded-md",
  "border border-border-secondary/80 bg-surface-overlay",
  "shadow-lg shadow-black/40 overflow-hidden",
].join(" ");

export function LibraryDetailTags(props: TagsProps) {
  return (
    <>
      <VisibleTags {...props} />
      <TagPicker {...props} />
    </>
  );
}

function VisibleTags(props: TagsProps) {
  const { t } = useLingui();
  return (
    <>
      {props.item.tags.slice(0, 3).map((tag, index) => {
        const removeTitle = props.shiftHeld
          ? t({ id: "library.modal.tags.remove", message: `Remove ${tag}` })
          : undefined;
        return (
          <span
            key={`${tag}-${index}`}
            onClick={() => {
              if (props.shiftHeld) void props.handleRemoveTag(tag);
            }}
            title={removeTitle}
            className={`inline-flex items-center cursor-pointer ui-text-meta transition-colors duration-100 ease-out whitespace-nowrap text-content-secondary hover:text-content-primary ${
              props.shiftHeld ? "hover:!text-red-500 hover:line-through" : ""
            }`}
          >
            <span className="opacity-40 mr-[1px]">#</span>
            <span>{tag.length > 12 ? `${tag.slice(0, 12)}...` : tag}</span>
          </span>
        );
      })}
      {props.item.tags.length > 3 ? (
        <button
          type="button"
          onClick={() => props.setTagMenuOpen(true)}
          className="ui-text-meta text-content-muted hover:text-content-primary transition-colors shrink-0"
        >
          +{props.item.tags.length - 3}
        </button>
      ) : null}
    </>
  );
}

function TagPicker(props: TagsProps) {
  const { t } = useLingui();
  const closeAndClear = () => {
    props.setTagMenuOpen(false);
    props.setTagInput("");
  };
  return (
    <div ref={props.tagMenuRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => props.setTagMenuOpen((open) => !open)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 ui-text-meta text-content-muted hover:text-content-primary hover:bg-surface-surface transition-colors"
        aria-label={t({ id: "library.detail.tags.add", message: "Add tag" })}
      >
        <Plus size={11} />
        {t({ id: "library.detail.tags.label", message: "Tag" })}
      </button>
      <HeaderMenuSurface
        open={props.tagMenuOpen}
        className={TAG_MENU}
        motionStyle="popover"
      >
        <div className="px-2 py-1.5 border-b border-border-primary">
          <input
            value={props.tagInput}
            onChange={(event) => props.setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void props.handleAddTag();
              } else if (event.key === "Escape") {
                event.preventDefault();
                closeAndClear();
              }
            }}
            placeholder={t({
              id: "library.modal.tags.new_tag",
              message: "New tag...",
            })}
            className="w-full bg-transparent ui-text-meta text-content-secondary outline-hidden placeholder:text-content-disabled"
            autoFocus
          />
        </div>
        <AssignedTags {...props} />
        <TagOptions {...props} />
      </HeaderMenuSurface>
    </div>
  );
}

function AssignedTags(props: TagsProps) {
  const { t } = useLingui();
  if (props.item.tags.length === 0) return null;
  return (
    <div className="max-h-28 overflow-y-auto border-b border-border-primary">
      {props.item.tags.map((tag) => (
        <div
          key={tag}
          className="flex items-center justify-between gap-2 px-2.5 py-1 group/tagrow"
        >
          <span className="ui-text-meta text-content-secondary truncate">
            <span className="opacity-40">#</span>
            {tag}
          </span>
          <button
            type="button"
            onClick={() => props.handleRemoveTag(tag)}
            aria-label={t({
              id: "library.modal.tags.remove",
              message: `Remove ${tag}`,
            })}
            className="opacity-0 group-hover/tagrow:opacity-100 text-content-disabled hover:text-red-500 transition-opacity shrink-0"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TagOptions(props: TagsProps) {
  const { t } = useLingui();
  const empty =
    props.availableTags.length === 0
      ? t({ id: "library.modal.tags.no_tags_yet", message: "No tags yet" })
      : t({
          id: "library.modal.tags.no_other_tags",
          message: "No other tags",
        });
  return (
    <div className="max-h-36 overflow-y-auto">
      {props.filteredTagOptions.length > 0 ? (
        props.filteredTagOptions.map((tag, index) => (
          <button
            key={`tag-option-${index}-${tag || "empty"}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.handleAddTag(tag)}
            className="w-full text-left px-2.5 py-1.5 ui-text-meta font-medium text-content-secondary hover:bg-surface-elevated/70 hover:text-content-primary transition-colors"
          >
            {tag}
          </button>
        ))
      ) : (
        <div className="px-2.5 py-2 ui-text-micro text-content-muted">
          {empty}
        </div>
      )}
    </div>
  );
}
