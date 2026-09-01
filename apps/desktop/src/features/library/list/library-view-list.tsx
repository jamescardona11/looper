import { useLingui } from "@lingui/react/macro";
import { CircleNotch as Loader2, FolderOpen } from "@phosphor-icons/react";

import Shimmer from "../../../shared/ui/Shimmer";
import type { LibraryItem } from "../../../contracts";
import LibraryCard from "./LibraryCard";
import type { LibraryInboxGroup } from "./library-inbox-groups";
import type { LibraryStatusChoice } from "./library-view-model";

type NameEditor = {
  id: string | null;
  draft: string;
  start: (item: LibraryItem) => void;
  change: (value: string) => void;
  commit: (item: LibraryItem) => void;
  cancel: () => void;
};

type TagEditor = {
  id: string | null;
  draft: string;
  start: (item: LibraryItem) => void;
  change: (value: string) => void;
  commit: (item: LibraryItem, value?: string) => void;
  cancel: () => void;
};

type LibraryItemActions = {
  open: (item: LibraryItem) => void;
  removeTag: (item: LibraryItem, tag: string) => Promise<void>;
  clickTag: (tag: string) => void;
  retry: (item: LibraryItem) => Promise<void>;
  cancel: (item: LibraryItem) => Promise<void>;
  delete: (item: LibraryItem) => Promise<void>;
};

type LibraryViewListProps = {
  items: LibraryItem[];
  groups: LibraryInboxGroup[];
  status: "all" | LibraryStatusChoice;
  onStatusChange: (choice: "all" | LibraryStatusChoice) => void;
  loading: boolean;
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  onFetchNextPage: () => void;
  onOpenImport: () => void;
  nameEditor: NameEditor;
  tagEditor: TagEditor;
  actions: LibraryItemActions;
  shiftHeld: boolean;
  availableTags: string[];
};

export function LibraryViewList(props: LibraryViewListProps) {
  const { t } = useLingui();
  const empty = props.items.length === 0;
  return (
    <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden custom-scrollbar scrollbar-gutter pb-6 pr-3 pt-2">
      <div key="library-list" className="flex w-full flex-col gap-4">
        <div className="mx-auto flex w-full max-w-[1040px] min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-4">
            <LibraryInboxHeader
              status={props.status}
              onStatusChange={props.onStatusChange}
            />
            {props.loading && empty ? <LibraryLoadingRows /> : null}
            {!props.loading && empty ? (
              <button
                type="button"
                onClick={props.onOpenImport}
                className="col-span-full rounded-xl border border-dashed border-border-secondary bg-surface-secondary p-10 flex flex-col items-center justify-center text-center hover:border-border-hover hover:bg-surface-surface transition-colors"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-10 ui-color-accent">
                  <FolderOpen size={16} />
                </span>
                <p className="mt-4 ui-text-title ui-color-primary font-semibold">
                  {t({
                    id: "library.view.empty_state.title",
                    message: "Drop audio or video here",
                  })}
                </p>
                <p className="mt-1 ui-text-body-sm ui-color-muted">
                  {t({
                    id: "library.view.empty_state",
                    message: "Transcribe a recording to build your Library.",
                  })}
                </p>
                <p className="mt-3 ui-text-micro ui-color-disabled">
                  {t({
                    id: "library.view.empty_state.formats",
                    message: "MP3 · WAV · M4A · MP4 — or click to browse",
                  })}
                </p>
              </button>
            ) : null}

            {props.groups.map((group, index) => (
              <LibraryGroup
                key={group.key}
                group={group}
                primary={index === 0}
                nameEditor={props.nameEditor}
                tagEditor={props.tagEditor}
                actions={props.actions}
                shiftHeld={props.shiftHeld}
                availableTags={props.availableTags}
              />
            ))}

            {!empty && props.hasNextPage ? (
              <div className="col-span-full flex items-center justify-center pt-2">
                <button
                  onClick={props.onFetchNextPage}
                  disabled={props.fetchingNextPage}
                  className="flex items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-4 py-2 ui-text-body-sm ui-color-secondary hover:text-content-primary hover:border-border-secondary hover:bg-surface-overlay transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {props.fetchingNextPage ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>
                        {t({
                          id: "library.view.loading_more",
                          message: "Loading...",
                        })}
                      </span>
                    </>
                  ) : (
                    <span>
                      {t({
                        id: "library.view.load_more",
                        message: "Load more",
                      })}
                    </span>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function LibraryLoadingRows() {
  return [0, 1, 2].map((row) => (
    <div
      key={row}
      aria-hidden="true"
      className="rounded-lg border border-border-primary bg-surface-surface px-3 py-3"
    >
      <Shimmer className="h-3 w-20" />
      <Shimmer className="mt-3 h-3.5 w-4/5" />
      <Shimmer className="mt-1.5 h-3.5 w-3/5" />
      <Shimmer className="mt-4 h-2.5 w-16" />
    </div>
  ));
}

function LibraryGroup({
  group,
  primary,
  nameEditor,
  tagEditor,
  actions,
  shiftHeld,
  availableTags,
}: {
  group: LibraryInboxGroup;
  primary: boolean;
  nameEditor: NameEditor;
  tagEditor: TagEditor;
  actions: LibraryItemActions;
  shiftHeld: boolean;
  availableTags: string[];
}) {
  const { t } = useLingui();
  return (
    <section
      aria-labelledby={primary ? "library-recent-recordings" : group.key}
    >
      {!primary ? (
        <h2
          id={group.key}
          className="mb-2 ui-text-uppercase-micro ui-color-disabled"
        >
          {t({ id: "library.group.earlier", message: "Earlier" })}
        </h2>
      ) : null}
      <div className="flex flex-col gap-1">
        {group.items.map((item) => (
          <div key={item.id}>
            <LibraryCard
              item={item}
              onOpen={() => actions.open(item)}
              onRemoveTag={(tag) => actions.removeTag(item, tag)}
              onClickTag={actions.clickTag}
              editingNameId={nameEditor.id}
              editingNameDraft={nameEditor.draft}
              onStartNameEdit={() => nameEditor.start(item)}
              onChangeNameDraft={nameEditor.change}
              onCommitNameEdit={() => nameEditor.commit(item)}
              onCancelNameEdit={nameEditor.cancel}
              onRetry={() => actions.retry(item)}
              onCancel={() => actions.cancel(item)}
              onDelete={() => actions.delete(item)}
              editingTagId={tagEditor.id}
              tagDraft={tagEditor.draft}
              onStartTagEdit={() => tagEditor.start(item)}
              onChangeTagDraft={tagEditor.change}
              onCommitTagAdd={(value) => tagEditor.commit(item, value)}
              onCancelTagEdit={tagEditor.cancel}
              shiftHeld={shiftHeld}
              availableTags={availableTags}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function LibraryInboxHeader({
  status,
  onStatusChange,
}: Pick<LibraryViewListProps, "status" | "onStatusChange">) {
  const { t } = useLingui();
  return (
    <header className="flex min-w-0 items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="ui-text-uppercase-micro ui-color-accent">Inbox</p>
        <h2
          id="library-recent-recordings"
          className="mt-1 ui-text-title-strong ui-color-primary"
        >
          Recent recordings
        </h2>
      </div>
      <select
        aria-label={t({
          id: "library.filter.aria_label",
          message: "Filter library by status",
        })}
        value={status}
        onChange={(event) =>
          onStatusChange(event.target.value as "all" | LibraryStatusChoice)
        }
        className="h-9 shrink-0 appearance-none rounded-xl bg-transparent px-3 ui-text-label ui-color-accent outline-none transition-colors hover:bg-[var(--color-accent-10)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
      >
        <option value="all">Filter</option>
        <option value="active">
          {t({ id: "library.filter.transcribing", message: "Transcribing" })}
        </option>
        <option value="complete">
          {t({ id: "library.filter.ready", message: "Ready" })}
        </option>
        <option value="error">
          {t({
            id: "library.filter.needs_attention",
            message: "Needs attention",
          })}
        </option>
      </select>
    </header>
  );
}
