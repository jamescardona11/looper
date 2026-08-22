import { useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowClockwise,
  DotsThree,
  PencilSimple,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import type { LibraryItem } from "../../../contracts";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import {
  cardActionKind,
  cardStatusClass,
  libraryCardStatusText,
} from "./library-card-model";

type LibraryCardActionsProps = {
  item: LibraryItem;
  menuOpen: boolean;
  setMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  progress: number;
  transcribing: boolean;
  shiftHeld: boolean;
  onStartNameEdit: () => void;
  runAction: (action: () => Promise<void>) => void;
  onRetry: () => Promise<void>;
  onCancel: () => Promise<void>;
  onDelete: () => Promise<void>;
};

export function LibraryCardActions({
  item,
  menuOpen,
  setMenuOpen,
  progress,
  transcribing,
  shiftHeld,
  onStartNameEdit,
  runAction,
  onRetry,
  onCancel,
  onDelete,
}: LibraryCardActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  return (
    <div className="flex min-w-[150px] items-center justify-end gap-2 pl-3">
      <LibraryCardProgress
        item={item}
        progress={progress}
        transcribing={transcribing}
      />
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="More options"
          onClick={(event) => {
            event.stopPropagation();
            if (shiftHeld) runAction(onDelete);
            else setMenuOpen((open) => !open);
          }}
          className="grid h-8 w-8 place-items-center rounded-lg text-content-disabled opacity-0 transition-[opacity,background-color,color] hover:bg-surface-elevated hover:text-content-primary group-hover:opacity-100 focus-visible:opacity-100"
        >
          {shiftHeld ? <Trash size={15} /> : <DotsThree size={17} />}
        </button>
        <LibraryCardMenu
          item={item}
          menuOpen={menuOpen}
          closeMenu={() => setMenuOpen(false)}
          onStartNameEdit={onStartNameEdit}
          runAction={runAction}
          onRetry={onRetry}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function LibraryCardProgress({
  item,
  progress,
  transcribing,
}: Pick<LibraryCardActionsProps, "item" | "progress" | "transcribing">) {
  if (transcribing) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-border-secondary">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="ui-text-micro text-[var(--color-accent)]">
          Transcribing…
        </span>
      </div>
    );
  }
  return (
    <span className={`ui-text-body-sm ${cardStatusClass(item.status.type)}`}>
      {libraryCardStatusText(item.status.type)}
    </span>
  );
}

function LibraryCardMenu({
  item,
  menuOpen,
  closeMenu,
  onStartNameEdit,
  runAction,
  onRetry,
  onCancel,
  onDelete,
}: {
  item: LibraryItem;
  menuOpen: boolean;
  closeMenu: () => void;
  onStartNameEdit: () => void;
  runAction: (action: () => Promise<void>) => void;
  onRetry: () => Promise<void>;
  onCancel: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useLingui();
  const actionKind = cardActionKind(item.status.type);
  return (
    <AnimatePresence>
      {menuOpen ? (
        <motion.div
          initial={{ opacity: 0, y: -3, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -3, scale: 0.98 }}
          transition={{ duration: 0.1 }}
          onClick={(event) => event.stopPropagation()}
          className="absolute right-0 top-full z-[100] mt-1 min-w-40 overflow-hidden rounded-lg border border-border-secondary bg-surface-overlay p-1 shadow-xl"
        >
          <MenuButton
            icon={<PencilSimple size={13} />}
            label={t({ id: "library.card.rename", message: "Rename" })}
            onClick={() => {
              closeMenu();
              onStartNameEdit();
            }}
          />
          {actionKind === "cancel" ? (
            <MenuButton
              icon={<X size={13} />}
              label={t({ id: "library.card.cancel", message: "Cancel" })}
              onClick={() => runAction(onCancel)}
            />
          ) : actionKind === "retry" ? (
            <MenuButton
              icon={<ArrowClockwise size={13} />}
              label={
                item.status.type === "error"
                  ? t({ id: "library.card.retry", message: "Retry" })
                  : t({
                      id: "library.card.retranscribe",
                      message: "Retranscribe",
                    })
              }
              onClick={() => runAction(onRetry)}
            />
          ) : null}
          <MenuButton
            danger
            icon={<Trash size={13} />}
            label={t({ id: "library.card.delete", message: "Delete" })}
            onClick={() => runAction(onDelete)}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 ui-text-menu-item transition-colors hover:bg-surface-elevated ${
        danger ? "text-[var(--color-error)]" : "text-content-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
