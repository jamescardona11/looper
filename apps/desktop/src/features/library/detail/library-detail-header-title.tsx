import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Check, PencilSimple } from "@phosphor-icons/react";

import { formatLibraryName } from "../shared/library-utils";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";

type TitleProps = Pick<
  LibraryDetailHeaderProps,
  | "handleNameCommit"
  | "isEditingName"
  | "item"
  | "nameDraft"
  | "onClose"
  | "setIsEditingName"
  | "setNameDraft"
>;

const BACK_BUTTON = [
  "flex items-center justify-center rounded-md p-1.5 -ml-1.5",
  "text-content-muted hover:text-content-primary hover:bg-surface-surface",
  "transition-colors",
].join(" ");

export function LibraryDetailTitle(props: TitleProps) {
  const { t } = useLingui();
  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void props.handleNameCommit();
  };

  return (
    <div className="col-start-1 row-start-1 flex items-center gap-1.5 min-w-0">
      <button
        onClick={props.onClose}
        className={BACK_BUTTON}
        aria-label={t({
          id: "library.detail.back",
          message: "Back to library",
        })}
      >
        <ArrowLeft size={15} />
      </button>

      {props.isEditingName ? (
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <input
            value={props.nameDraft}
            aria-label={t({
              id: "library.detail.edit_name",
              message: "Edit meeting name",
            })}
            onChange={(event) => props.setNameDraft(event.target.value)}
            onBlur={props.handleNameCommit}
            onKeyDown={commitOnEnter}
            className="min-w-0 flex-1 max-w-md bg-transparent border-b border-[var(--color-border-primary)] px-1 py-0.5 ui-text-body-lg font-semibold text-content-primary focus:border-[var(--color-border-hover)] outline-hidden"
            autoFocus
          />
          <button
            type="button"
            onClick={props.handleNameCommit}
            aria-label={t({
              id: "library.detail.save_name",
              message: "Save meeting name",
            })}
            className="text-content-muted hover:text-content-primary"
          >
            <Check size={12} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0 flex-1 group">
          <h2 className="ui-text-body-lg font-semibold text-content-primary truncate">
            {formatLibraryName(props.item.name)}
          </h2>
          <button
            type="button"
            onClick={() => props.setIsEditingName(true)}
            aria-label={t({
              id: "library.detail.rename",
              message: "Rename meeting",
            })}
            className="opacity-0 group-hover:opacity-100 text-content-muted hover:text-content-primary transition-opacity shrink-0"
          >
            <PencilSimple size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
