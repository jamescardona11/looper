import { useState } from "react";
import type { LibraryCardProps } from "./library-card-model";
import { cardStatus } from "./library-card-model";
import { LibraryCardBody, LibraryCardMedia } from "./library-card-body";
import { LibraryCardActions } from "./library-card-actions";

export function LibraryCard(props: LibraryCardProps) {
  const {
    item,
    onOpen,
    onRemoveTag,
    onClickTag,
    editingNameId,
    editingNameDraft,
    onStartNameEdit,
    onChangeNameDraft,
    onCommitNameEdit,
    onCancelNameEdit,
    onRetry,
    onCancel,
    onDelete,
    editingTagId,
    tagDraft,
    onStartTagEdit,
    onChangeTagDraft,
    onCommitTagAdd,
    onCancelTagEdit,
    shiftHeld,
  } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const editingName = editingNameId === item.id;
  const editingTag = editingTagId === item.id;
  const status = cardStatus(item);

  const openIfIdle = () => {
    if (!editingName && !editingTag) onOpen();
  };
  const runAction = (action: () => Promise<void>) => {
    setMenuOpen(false);
    void action().catch((error: unknown) => {
      console.error("Library item action failed:", error);
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openIfIdle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openIfIdle();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (shiftHeld) runAction(onDelete);
        else setMenuOpen(true);
      }}
      className={`group grid min-h-[88px] w-full min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 overflow-visible rounded-xl border border-transparent px-2.5 py-2 outline-none transition-[background-color,border-color] hover:border-border-primary hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-hover ${
        shiftHeld
          ? "!border-[var(--color-error)]/30 !bg-[var(--color-error)]/5"
          : ""
      }`}
    >
      <LibraryCardMedia item={item} transcribing={status.transcribing} />
      <LibraryCardBody
        item={item}
        editingName={editingName}
        editingNameDraft={editingNameDraft}
        onChangeNameDraft={onChangeNameDraft}
        onCommitNameEdit={onCommitNameEdit}
        onCancelNameEdit={onCancelNameEdit}
        editingTag={editingTag}
        tagDraft={tagDraft}
        onStartTagEdit={onStartTagEdit}
        onChangeTagDraft={onChangeTagDraft}
        onCommitTagAdd={onCommitTagAdd}
        onCancelTagEdit={onCancelTagEdit}
        onRemoveTag={onRemoveTag}
        onClickTag={onClickTag}
        shiftHeld={shiftHeld}
      />
      <LibraryCardActions
        item={item}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        progress={status.progress}
        transcribing={status.transcribing}
        shiftHeld={shiftHeld}
        onStartNameEdit={onStartNameEdit}
        runAction={runAction}
        onRetry={onRetry}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </div>
  );
}

export default LibraryCard;
