import { useLingui } from "@lingui/react/macro";
import type { Personality } from "../../../types";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import { AppIconBadge, WebsiteFavicon } from "./PersonalityModal";
import {
  appIconPath,
  selectedPersonality,
  type InstalledAppIndexes,
  type PersonalizationViewActions,
} from "./personalization-view-model";
import { StylePreview } from "./personalization-view-preview";
import { styleExampleFor } from "./personalization-style-example";
import {
  appBindingKey,
  formatWebsitePreview,
  normalizeWebsite,
} from "./personalization-utils";

type StyleBrowserProps = {
  actions: PersonalizationViewActions;
  installedAppIndexes: InstalledAppIndexes;
  personalities: Personality[];
  selectedPersonalityId: string | null;
  shiftHeld: boolean;
  websiteIconBySite: Record<string, string>;
};

export function PersonalizationStyleBrowser({
  actions,
  installedAppIndexes,
  personalities,
  selectedPersonalityId,
  shiftHeld,
  websiteIconBySite,
}: StyleBrowserProps) {
  const { t } = useLingui();
  const selected = selectedPersonality(personalities, selectedPersonalityId);

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <aside className="flex w-[232px] shrink-0 flex-col gap-0.5">
        {personalities.map((personality, index) => {
          const active = selected?.id === personality.id;
          return (
            <button
              key={personality.id || `personality-${index}`}
              type="button"
              onClick={() => {
                if (shiftHeld) actions.requestDelete(personality);
                else actions.selectPersonality(personality.id);
              }}
              aria-current={active ? "true" : undefined}
              className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                active ? "bg-accent-10" : "hover:bg-surface-secondary"
              } ${shiftHeld ? "hover:!bg-red-500/5" : ""}`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    personality.enabled
                      ? "bg-[var(--color-success)]"
                      : "bg-border-secondary"
                  }`}
                />
                <span
                  className={`truncate ui-text-body-sm font-medium ${
                    active ? "text-[var(--color-accent)]" : "ui-color-primary"
                  }`}
                >
                  {personality.name}
                </span>
              </span>
              <span className="mt-0.5 block truncate ui-text-micro ui-color-muted">
                {personality.apps.length + personality.websites.length > 0
                  ? destinationNames(personality).slice(0, 3).join(", ")
                  : t({
                      id: "personalization.applies_everywhere",
                      message: "Applies everywhere",
                    })}
              </span>
            </button>
          );
        })}
      </aside>

      {selected ? (
        <StyleDetail
          actions={actions}
          installedAppIndexes={installedAppIndexes}
          personality={selected}
          websiteIconBySite={websiteIconBySite}
        />
      ) : null}
    </div>
  );
}

function StyleDetail({
  actions,
  installedAppIndexes,
  personality,
  websiteIconBySite,
}: {
  actions: PersonalizationViewActions;
  installedAppIndexes: InstalledAppIndexes;
  personality: Personality;
  websiteIconBySite: Record<string, string>;
}) {
  const { t } = useLingui();
  const example = styleExampleFor(personality.name, t);

  return (
    <section
      className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-primary bg-surface-surface p-5 shadow-sm"
      aria-label={personality.name}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ui-text-title-strong ui-color-primary">
            {personality.name}
          </h2>
          <p className="mt-1 ui-text-body-sm ui-color-muted">
            {personality.instructions[0] ??
              t({
                id: "personalization.no_notes",
                message: "No notes yet",
              })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ToggleSwitch
            enabled={personality.enabled}
            onToggle={() =>
              actions.patchPersonality(personality.id, {
                enabled: !personality.enabled,
              })
            }
            ariaLabel={
              personality.enabled
                ? t({
                    id: "personalization.disable_mode",
                    message: "Disable mode",
                  })
                : t({
                    id: "personalization.enable_mode",
                    message: "Enable mode",
                  })
            }
          />
          <button
            type="button"
            onClick={() => actions.editPersonality(personality.id)}
            className="rounded-lg border border-border-primary bg-surface-surface px-3 py-1.5 ui-text-button ui-color-primary transition-colors hover:bg-surface-secondary"
          >
            {t({
              id: "personalization.edit_style",
              message: "Edit style",
            })}
          </button>
        </div>
      </div>

      <p className="mt-5 ui-text-label font-semibold ui-color-secondary">
        {t({
          id: "personalization.where_applies",
          message: "Where it applies",
        })}
      </p>
      <DestinationChips
        installedAppIndexes={installedAppIndexes}
        personality={personality}
        websiteIconBySite={websiteIconBySite}
      />

      <StylePreview personality={personality} fallback={example} />

      {personality.instructions.length > 1 ? (
        <>
          <p className="mt-5 ui-text-label font-semibold ui-color-secondary">
            {t({
              id: "personalization.your_rules",
              message: "Your rules",
            })}
          </p>
          <ul className="mt-2 space-y-1">
            {personality.instructions.map((instruction, index) => (
              <li
                key={`rule-${index}`}
                className="ui-text-body-sm ui-color-secondary"
              >
                {instruction}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function DestinationChips({
  installedAppIndexes,
  personality,
  websiteIconBySite,
}: {
  installedAppIndexes: InstalledAppIndexes;
  personality: Personality;
  websiteIconBySite: Record<string, string>;
}) {
  const { t } = useLingui();
  const hasDestinations =
    personality.apps.length > 0 || personality.websites.length > 0;

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {personality.apps.map((app, index) => (
        <span
          key={`app-detail-${index}-${appBindingKey(app)}`}
          title={app.name}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-surface-primary/60 py-1 pr-2 pl-1"
        >
          <AppIconBadge
            appName={app.name}
            iconPath={appIconPath(app, installedAppIndexes)}
          />
          <span className="ui-text-micro ui-color-secondary">{app.name}</span>
        </span>
      ))}
      {personality.websites.map((site, index) => (
        <span
          key={`site-detail-${index}-${site || "empty"}`}
          title={formatWebsitePreview(site)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-primary bg-surface-primary/60 py-1 pr-2 pl-1"
        >
          <WebsiteFavicon
            site={site}
            iconPath={websiteIconBySite[normalizeWebsite(site)]}
            size="chip"
          />
          <span className="ui-text-micro ui-color-secondary">
            {formatWebsitePreview(site)}
          </span>
        </span>
      ))}
      {!hasDestinations ? (
        <span className="ui-text-micro ui-color-disabled">
          {t({
            id: "personalization.applies_everywhere",
            message: "Applies everywhere",
          })}
        </span>
      ) : null}
    </div>
  );
}

function destinationNames(personality: Personality): string[] {
  return personality.apps
    .map((app) => app.name)
    .concat(personality.websites.map(formatWebsitePreview));
}
