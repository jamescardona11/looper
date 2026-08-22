import { useLingui as useSearchTranslations } from "@lingui/react/macro";
import {
  ArrowsDownUp as SortIcon,
  Check as SelectedIcon,
  MagnifyingGlass as SearchIcon,
  X as ClearIcon,
} from "@phosphor-icons/react";
import { AnimatePresence as Presence, motion as Animated } from "framer-motion";
import { useRef, useState } from "react";
import { useClickOutside as useDismissOnOutside } from "../../../shared/hooks/useClickOutside";
import type { TranscriptionRecord } from "../../../contracts";
import {
  withSortToken,
  withTimePreset,
  type TimePreset,
  type TranscriptionSort,
} from "../searchQuery";
import {
  FocusRecordSearchBridge,
  SearchInputFocus,
  focusRecordBridgeKey,
} from "./transcription-list-lifecycle";

const SEARCH_FIELD_CLASS_NAME =
  "flex items-center gap-2 h-8 px-0.5 border-b border-border-secondary bg-transparent transition-colors focus-within:border-content-primary";
const MENU_OPTION_BASE =
  "flex w-full items-center justify-between gap-3 px-3 py-1 ui-text-body-sm transition-colors";
const MENU_OPTION_SELECTED =
  "ui-color-primary bg-[var(--surface-interactive-strong)]";
const MENU_OPTION_IDLE =
  "ui-color-secondary hover:bg-[var(--surface-interactive)] hover:text-content-primary";
const MENU_REVEAL = {
  hidden: { opacity: 0, scale: 0.98, y: -2 },
  visible: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.12 },
};
const FIELD_REVEAL = {
  hidden: { opacity: 0, width: 32 },
  visible: { opacity: 1, width: 272 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};
const BUTTON_REVEAL = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  transition: { duration: 0.12 },
};

type SelectOption<T extends string> = { value: T; label: string };

function FilterOption<T extends string>(props: {
  option: SelectOption<T>;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={props.selected}
      onClick={() => props.onSelect(props.option.value)}
      className={`${MENU_OPTION_BASE} ${props.selected ? MENU_OPTION_SELECTED : MENU_OPTION_IDLE}`}
    >
      <span>{props.option.label}</span>
      <span className="w-3 flex items-center justify-center shrink-0">
        {props.selected ? <SelectedIcon size={12} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

function FilterSection<T extends string>(props: {
  title: string;
  options: SelectOption<T>[];
  current: T;
  onSelect: (value: T) => void;
}) {
  return (
    <>
      <div className="px-3 pt-1 pb-1 ui-text-uppercase-micro ui-color-muted">
        {props.title}
      </div>
      {props.options.map((option) => (
        <FilterOption
          key={option.value}
          option={option}
          selected={option.value === props.current}
          onSelect={props.onSelect}
        />
      ))}
    </>
  );
}

function FilterMenu(props: {
  query: string;
  sort: TranscriptionSort;
  time: TimePreset;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useSearchTranslations();
  const sortChoices: SelectOption<TranscriptionSort>[] = [
    {
      value: "recent",
      label: t({
        id: "transcriptions.sort.recent",
        message: "Newest first",
      }),
    },
    {
      value: "oldest",
      label: t({
        id: "transcriptions.sort.oldest",
        message: "Oldest first",
      }),
    },
    {
      value: "longest",
      label: t({ id: "transcriptions.sort.longest", message: "Longest" }),
    },
    {
      value: "shortest",
      label: t({ id: "transcriptions.sort.shortest", message: "Shortest" }),
    },
  ];
  const timeChoices: SelectOption<TimePreset>[] = [
    {
      value: "any",
      label: t({ id: "transcriptions.time.any", message: "Any time" }),
    },
    {
      value: "today",
      label: t({ id: "transcriptions.time.today", message: "Today" }),
    },
    {
      value: "7d",
      label: t({ id: "transcriptions.time.7d", message: "Past 7 days" }),
    },
  ];
  return (
    <Animated.div
      role="menu"
      initial={MENU_REVEAL.hidden}
      animate={MENU_REVEAL.visible}
      exit={MENU_REVEAL.hidden}
      transition={MENU_REVEAL.transition}
      className="ui-surface-menu absolute right-0 top-full mt-1.5 z-30 min-w-[170px] py-1"
    >
      <FilterSection
        title={t({ id: "transcriptions.filter.sort", message: "Sort" })}
        options={sortChoices}
        current={props.sort}
        onSelect={(value) =>
          props.onQueryChange(withSortToken(props.query, value))
        }
      />
      <div className="my-1 mx-3 border-t border-border-secondary" />
      <FilterSection
        title={t({ id: "transcriptions.filter.when", message: "When" })}
        options={timeChoices}
        current={props.time}
        onSelect={(value) =>
          props.onQueryChange(withTimePreset(props.query, value))
        }
      />
    </Animated.div>
  );
}

function ExpandedSearch(props: {
  query: string;
  sort: TranscriptionSort;
  time: TimePreset;
  filterOpen: boolean;
  filterRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onFilterToggle: () => void;
  onClose: () => void;
}) {
  const { t } = useSearchTranslations();
  const hasQuery = props.query.trim().length > 0;
  return (
    <Animated.div
      key="search-input"
      initial={FIELD_REVEAL.hidden}
      animate={FIELD_REVEAL.visible}
      exit={FIELD_REVEAL.hidden}
      transition={FIELD_REVEAL.transition}
      className={SEARCH_FIELD_CLASS_NAME}
    >
      <SearchInputFocus inputRef={props.inputRef} />
      <SearchIcon
        size={12}
        className="text-content-disabled shrink-0"
        aria-hidden="true"
      />
      <input
        ref={props.inputRef}
        type="text"
        autoFocus
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
        placeholder={t({
          id: "transcriptions.list.search.placeholder_short",
          message: "Search",
        })}
        aria-label={t({
          id: "transcriptions.list.search.aria",
          message: "Search transcriptions",
        })}
        className="bg-transparent ui-text-body-sm ui-color-secondary placeholder-content-disabled outline-hidden flex-1 min-w-0"
      />
      {hasQuery ? (
        <button
          onClick={() => {
            props.onQueryChange("");
            props.inputRef.current?.focus();
          }}
          aria-label={t({
            id: "transcriptions.list.search.clear",
            message: "Clear search",
          })}
          className="p-0.5 rounded text-content-disabled hover:text-content-muted transition-colors shrink-0"
        >
          <ClearIcon size={12} aria-hidden="true" />
        </button>
      ) : null}
      <div className="relative shrink-0" ref={props.filterRef}>
        <button
          type="button"
          onClick={props.onFilterToggle}
          aria-haspopup="menu"
          aria-expanded={props.filterOpen}
          aria-label={t({
            id: "transcriptions.list.filter.aria",
            message: "Sort and filter transcriptions",
          })}
          className="ui-button-ghost h-7 w-7"
        >
          <SortIcon size={13} aria-hidden="true" />
        </button>
        <Presence>
          {props.filterOpen ? <FilterMenu {...props} /> : null}
        </Presence>
      </div>
    </Animated.div>
  );
}

function CollapsedSearchButton(props: { onOpen: () => void }) {
  const { t } = useSearchTranslations();
  return (
    <Animated.button
      key="search-button"
      initial={BUTTON_REVEAL.hidden}
      animate={BUTTON_REVEAL.visible}
      exit={BUTTON_REVEAL.hidden}
      transition={BUTTON_REVEAL.transition}
      onClick={props.onOpen}
      aria-label={t({
        id: "transcriptions.list.search.open",
        message: "Search transcriptions",
      })}
      className="ui-button-ghost h-8 w-8"
    >
      <SearchIcon size={13} aria-hidden="true" />
    </Animated.button>
  );
}

export function TranscriptionListSearchControls(props: {
  query: string;
  sort: TranscriptionSort;
  time: TimePreset;
  records: TranscriptionRecord[];
  focusRecordId: string | null;
  onQueryChange: (query: string) => void;
}) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const lastFocusedRef = useRef<string | null>(null);
  useDismissOnOutside(menuRef, () => setFilterVisible(false), filterVisible);
  useDismissOnOutside(
    controlsRef,
    () => {
      if (!props.query.trim()) setSearchVisible(false);
    },
    searchVisible,
  );
  const closeSearch = () => {
    props.onQueryChange("");
    setSearchVisible(false);
    setFilterVisible(false);
  };
  return (
    <div className="mb-2 h-8 shrink-0 flex justify-end" ref={controlsRef}>
      <FocusRecordSearchBridge
        key={focusRecordBridgeKey(props.focusRecordId, props.records)}
        recordId={props.focusRecordId}
        records={props.records}
        lastFocusedRef={lastFocusedRef}
        onFocusRecord={(text) => {
          props.onQueryChange(text);
          setSearchVisible(true);
        }}
      />
      <Presence initial={false} mode="wait">
        {searchVisible ? (
          <ExpandedSearch
            {...props}
            filterOpen={filterVisible}
            filterRef={menuRef}
            inputRef={fieldRef}
            onFilterToggle={() => setFilterVisible((visible) => !visible)}
            onClose={closeSearch}
          />
        ) : (
          <CollapsedSearchButton onOpen={() => setSearchVisible(true)} />
        )}
      </Presence>
    </div>
  );
}
