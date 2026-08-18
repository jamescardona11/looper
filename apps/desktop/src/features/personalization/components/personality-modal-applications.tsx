import { useLingui } from "@lingui/react/macro";
import { CaretDown as ChevronDown, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AppBinding, Personality } from "../../../types";
import type { InstalledApp } from "../../../data/personalization";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import { appBindingKey } from "./personalization-utils";
import { AppIconBadge } from "./personality-modal-icons";
import {
  applicationCatalog,
  availableApplications,
} from "./personality-modal-model";

const menuMotion = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.12 },
};
const applicationClass = {
  section: ["flex min-w-0", "flex-col gap-2"].join(" "),
  heading: ["flex items-center", "justify-between gap-2"].join(" "),
  title: ["ui-text-section-label-sm", "ui-color-muted"].join(" "),
  count: ["ui-text-meta ui-color-disabled", "tabular-nums"].join(" "),
  surface: ["rounded-lg", "bg-surface-surface", "p-2"].join(" "),
  scroll: ["mt-1 max-h-[240px]", "overflow-y-auto instructions-scroll"].join(
    " ",
  ),
  empty: ["px-2 py-2", "ui-text-meta ui-color-disabled"].join(" "),
  input: [
    "min-w-0 flex-1 border-b border-border-secondary bg-transparent",
    "px-0.5 py-1 ui-text-body-sm ui-color-primary placeholder-content-disabled",
    "focus:outline-none focus:border-content-primary transition-colors",
  ].join(" "),
  toggle: [
    "inline-flex shrink-0 items-center justify-center rounded-md p-1",
    "text-content-muted hover:text-content-primary",
    "hover:bg-surface-overlay transition-colors",
  ].join(" "),
  menu: [
    "absolute left-0 right-0 top-full z-30 mt-1 max-h-[220px]",
    "overflow-y-auto rounded-md border border-border-secondary",
    "bg-surface-overlay px-1 py-1 shadow-lg instructions-scroll",
  ].join(" "),
  row: [
    "group/row flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
    "hover:bg-surface-overlay transition-colors",
  ].join(" "),
  remove: [
    "rounded-md p-1 text-content-disabled opacity-0",
    "group-hover/row:opacity-100 hover:text-content-primary",
    "hover:bg-surface-elevated transition-all",
  ].join(" "),
};

const optionClass = (selected: boolean) =>
  [
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5",
    "text-left ui-text-meta font-medium ui-color-primary",
    selected ? "bg-surface-elevated" : "hover:bg-surface-elevated/60",
  ].join(" ");

export function PersonalityApplications({
  personality: mode,
  installedApps: applications,
  updateList,
  assign,
  iconTextClass,
}: {
  personality: Readonly<Personality>;
  installedApps: ReadonlyArray<InstalledApp>;
  updateList: (updater: (current: Personality) => Personality) => void;
  assign: (app: AppBinding) => void;
  iconTextClass: string;
}) {
  const { t: translate } = useLingui();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const combobox = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const catalog = useMemo(
    () => applicationCatalog(applications),
    [applications],
  );
  const options = useMemo(
    () => availableApplications(catalog.options, mode.apps, query),
    [catalog.options, mode.apps, query],
  );
  useClickOutside(combobox, () => setMenuOpen(false), menuOpen);

  const resetHighlight = () => setHighlight(0);
  const openMenu = () => {
    resetHighlight();
    setMenuOpen(true);
  };
  const add = (choice: AppBinding) => {
    const name = choice.name.trim();
    if (!name) return;
    assign({ name, identifier: choice.identifier?.trim() || null });
    setQuery("");
    setMenuOpen(false);
    resetHighlight();
  };
  const remove = (binding: AppBinding) => {
    const identity = appBindingKey(binding);
    updateList((current) => ({
      ...current,
      apps: current.apps.filter((app) => appBindingKey(app) !== identity),
    }));
  };
  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!menuOpen) openMenu();
      else
        setHighlight((index) =>
          options.length === 0 ? 0 : Math.min(index + 1, options.length - 1),
        );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = options[highlight];
      if (selected) add(selected);
      else if (query.trim()) add({ name: query, identifier: null });
      return;
    }
    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      setMenuOpen(false);
      resetHighlight();
    }
  };
  const toggleMenu = () => {
    setMenuOpen((open) => !open);
    resetHighlight();
    input.current?.focus();
  };

  return (
    <section className={applicationClass.section}>
      <div className={applicationClass.heading}>
        <h3 className={applicationClass.title}>
          {translate({
            id: "personalization.modal.applications",
            message: "Applications",
          })}
        </h3>
        <span className={applicationClass.count}>{mode.apps.length}</span>
      </div>
      <div className={applicationClass.surface}>
        <div ref={combobox} className="relative flex items-center gap-1 px-1">
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              openMenu();
            }}
            onFocus={openMenu}
            onKeyDown={handleKeys}
            placeholder={translate({
              id: "personalization.modal.applications.add",
              message: "Add an application",
            })}
            aria-label={translate({
              id: "personalization.modal.applications.add",
              message: "Add an application",
            })}
            role="combobox"
            aria-expanded={menuOpen}
            aria-autocomplete="list"
            className={applicationClass.input}
          />
          <button
            type="button"
            onClick={toggleMenu}
            aria-label={translate({
              id: "personalization.modal.applications.toggle_list",
              message: "Toggle application list",
            })}
            aria-expanded={menuOpen}
            className={applicationClass.toggle}
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence>
            {menuOpen && options.length > 0 ? (
              <motion.ul
                {...menuMotion}
                role="listbox"
                className={applicationClass.menu}
              >
                {options.map((app, index) => (
                  <li key={`app-option-${app.name}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlight}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => add(app)}
                      className={optionClass(index === highlight)}
                    >
                      <AppIconBadge
                        appName={app.name}
                        iconPath={app.icon_path}
                        fallbackTextClass={iconTextClass}
                      />
                      <span className="truncate">{app.name}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
        <div className={applicationClass.scroll}>
          {mode.apps.length === 0 ? (
            <p className={applicationClass.empty}>
              {translate({
                id: "personalization.modal.applications.none",
                message: "No applications selected",
              })}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {mode.apps.map((app, index) => {
                const installed =
                  catalog.byIdentity.get(appBindingKey(app)) ??
                  catalog.byName.get(app.name.toLowerCase());
                return (
                  <li
                    key={`app-${index}-${appBindingKey(app)}`}
                    className={applicationClass.row}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AppIconBadge
                        appName={app.name}
                        iconPath={installed?.icon_path}
                        fallbackTextClass={iconTextClass}
                      />
                      <span className="ui-text-body-sm ui-color-primary truncate">
                        {app.name}
                      </span>
                      {!installed ? (
                        <span className="ui-text-meta ui-color-disabled shrink-0">
                          {translate({
                            id: "personalization.modal.applications.not_installed",
                            message: "Not installed",
                          })}
                        </span>
                      ) : null}
                    </div>
                    <button
                      onClick={() => remove(app)}
                      className={applicationClass.remove}
                      title={translate({
                        id: "personalization.modal.remove",
                        message: "Remove",
                      })}
                      aria-label={translate({
                        id: "personalization.modal.remove_app",
                        message: `Remove ${app.name}`,
                      })}
                    >
                      <X size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
