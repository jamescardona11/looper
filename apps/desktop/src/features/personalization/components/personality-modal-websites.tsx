import { useLingui } from "@lingui/react/macro";
import { Plus, X } from "@phosphor-icons/react";
import { useState, type KeyboardEvent } from "react";
import type { Personality } from "../../../contracts";
import { isValidDomain, normalizeWebsite } from "./personalization-utils";
import { WebsiteFavicon } from "./personality-modal-icons";
import { classifyWebsite } from "./personality-modal-model";

const websiteClass = {
  section: ["flex", "min-w-0", "flex-col", "gap-2"].join(" "),
  heading: ["flex items-center", "justify-between gap-2"].join(" "),
  title: ["ui-text-section-label-sm", "ui-color-muted"].join(" "),
  counter: ["ui-text-meta ui-color-disabled", "tabular-nums"].join(" "),
  surface: ["rounded-lg", "bg-surface-surface", "p-2"].join(" "),
  controls: ["flex", "items-center", "gap-1", "px-1"].join(" "),
  error: ["shrink-0 px-2", "ui-text-meta ui-color-error"].join(" "),
  scroll: ["mt-1 max-h-[240px]", "overflow-y-auto instructions-scroll"].join(
    " ",
  ),
  empty: ["px-2 py-2", "ui-text-meta ui-color-disabled"].join(" "),
  list: ["space-y", "0.5"].join("-"),
  identity: ["flex items-center gap-2", "min-w-0"].join(" "),
  domain: ["ui-text-label font-mono", "ui-color-primary truncate"].join(" "),
  input: [
    "min-w-0 flex-1 border-b border-border-secondary bg-transparent",
    "px-0.5 py-1 ui-text-body-sm ui-color-primary placeholder-content-disabled",
    "focus:outline-none focus:border-content-primary transition-colors",
  ].join(" "),
  add: [
    "inline-flex shrink-0 items-center justify-center rounded-md p-1",
    "text-content-muted hover:text-content-primary",
    "hover:bg-surface-overlay transition-colors",
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

export function PersonalityWebsites({
  personality: mode,
  icons,
  update,
  iconTextClass,
}: {
  personality: Readonly<Personality>;
  icons: Record<string, string>;
  update: (patch: Partial<Personality>) => void;
  iconTextClass: string;
}) {
  const { t: translate } = useLingui();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addWebsite = () => {
    const candidate = classifyWebsite(input, mode.websites, isValidDomain);
    if (candidate.status === "empty") {
      setError(null);
      return;
    }
    if (candidate.status === "invalid") {
      setError(
        translate({
          id: "personalization.modal.website.invalid",
          message: "Enter a valid domain like gmail.com",
        }),
      );
      return;
    }
    if (candidate.status === "duplicate") {
      setError(
        translate({
          id: "personalization.modal.website.duplicate",
          message: "That domain is already added",
        }),
      );
      return;
    }
    setError(null);
    update({ websites: [...mode.websites, candidate.domain] });
    setInput("");
  };
  const removeWebsite = (site: string) =>
    update({ websites: mode.websites.filter((entry) => entry !== site) });
  const submitFromKeyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addWebsite();
  };

  return (
    <section className={websiteClass.section}>
      <div className={websiteClass.heading}>
        <h3 className={websiteClass.title}>
          {translate({
            id: "personalization.modal.websites",
            message: "Websites",
          })}
        </h3>
        <span className={websiteClass.counter}>{mode.websites.length}</span>
      </div>
      <div className={websiteClass.surface}>
        <div className={websiteClass.controls}>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={submitFromKeyboard}
            placeholder={translate({
              id: "personalization.modal.websites.placeholder",
              message: "Add a site like gmail.com",
            })}
            aria-label={translate({
              id: "personalization.modal.websites.aria",
              message: "Add website domain",
            })}
            className={websiteClass.input}
          />
          <button
            onClick={addWebsite}
            aria-label={translate({
              id: "personalization.modal.add",
              message: "Add",
            })}
            className={websiteClass.add}
          >
            <Plus {...{ size: 14, "aria-hidden": "true" }} />
          </button>
        </div>
        {error ? <p className={websiteClass.error}>{error}</p> : null}
        <div className={websiteClass.scroll}>
          {mode.websites.length === 0 ? (
            <p className={websiteClass.empty}>
              {translate({
                id: "personalization.modal.websites.none",
                message: "No websites added",
              })}
            </p>
          ) : (
            <ul className={websiteClass.list}>
              {mode.websites.map((hostname, position) => {
                const site = hostname;
                return (
                  <li
                    key={`site-${position}-${site || "empty"}`}
                    className={websiteClass.row}
                  >
                    <div className={websiteClass.identity}>
                      <WebsiteFavicon
                        {...{
                          site,
                          iconPath: icons[normalizeWebsite(site)],
                          size: "list" as const,
                          fallbackTextClass: iconTextClass,
                        }}
                      />
                      <span className={websiteClass.domain}>{site}</span>
                    </div>
                    <button
                      onClick={() => removeWebsite(site)}
                      className={websiteClass.remove}
                      title={translate({
                        id: "personalization.modal.remove",
                        message: "Remove",
                      })}
                      aria-label={translate({
                        id: "personalization.modal.remove_site",
                        message: `Remove ${site}`,
                      })}
                    >
                      <X {...{ size: 12 }} />
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
