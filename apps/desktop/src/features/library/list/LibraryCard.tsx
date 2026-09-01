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
    <article
      data-testid={`library-card-${item.id}`}
      onContextMenu={(event) => {
        event.preventDefault();
        if (shiftHeld) runAction(onDelete);
        else setMenuOpen(true);
      }}
      className={`group relative grid min-h-16 w-full min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border-primary px-1 py-2 outline-none transition-[background-color,color] hover:bg-surface-secondary ${
        shiftHeld
          ? "!border-[var(--color-error)]/30 !bg-[var(--color-error)]/5"
          : ""
      }`}
    >
      <button
        aria-label={`Open ${item.name}`}
        className="absolute inset-0 z-0 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-hover"
        onClick={openIfIdle}
        type="button"
      />
      <div className="pointer-events-none relative z-10">
        <LibraryCardMedia item={item} transcribing={status.transcribing} />
      </div>
      <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto [&_input]:pointer-events-auto">
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
      </div>
      <div className="relative z-10">
        <LibraryCardActions
          item={item}
          onOpen={onOpen}
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
    </article>
  );
}

export default LibraryCard;
