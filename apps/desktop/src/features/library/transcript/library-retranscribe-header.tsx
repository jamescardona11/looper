import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { X } from "@phosphor-icons/react";

const TITLE_CLASS = [
  "ui-text-body-lg",
  "font-semibold",
  "text-content-primary",
].join(" ");
const CLOSE_CLASS = [
  "ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
  "text-content-muted transition-colors",
  "hover:bg-surface-elevated hover:text-content-primary",
].join(" ");
const HEADER_CLASS = ["flex items-start", "justify-between", "px-5 pt-4"].join(
  " ",
);
const ITEM_NAME_CLASS = [
  "mt-0.5 truncate",
  "ui-text-meta text-content-muted",
].join(" ");
const CLOSE_ICON = { size: 14, "aria-hidden": true } as const;
const HEADER_COPY = {
  title: msg({ id: "library.retranscribe.title", message: "Retranscribe" }),
  close: msg({ id: "library.retranscribe.close", message: "Close" }),
};

export function LibraryRetranscribeHeader({
  itemName,
  onCancel,
}: {
  itemName: string;
  onCancel: () => void;
}) {
  const { i18n } = useLingui();

  return (
    <div className={HEADER_CLASS}>
      <div className="min-w-0">
        <h2 id="retranscribe-modal-title" className={TITLE_CLASS}>
          {i18n._(HEADER_COPY.title)}
        </h2>
        <p className={ITEM_NAME_CLASS}>{itemName}</p>
      </div>
      <button
        onClick={onCancel}
        aria-label={i18n._(HEADER_COPY.close)}
        className={CLOSE_CLASS}
      >
        <X {...CLOSE_ICON} />
      </button>
    </div>
  );
}
