import type { AppBinding, Personality } from "../../../contracts";
import type { InstalledApp } from "../../../data/personalization";
import { appBindingKey, normalizeWebsite } from "./personalization-utils";

export function applicationCatalog(installed: readonly InstalledApp[]) {
  const unique = new Map<string, InstalledApp>();
  for (const application of installed) {
    const identity = appBindingKey(application);
    if (!unique.has(identity)) unique.set(identity, application);
  }
  const options = [...unique.values()];
  return {
    options,
    byIdentity: new Map(options.map((app) => [appBindingKey(app), app])),
    byName: new Map(options.map((app) => [app.name.toLowerCase(), app])),
  };
}

export function availableApplications(
  options: readonly InstalledApp[],
  assigned: readonly AppBinding[],
  search: string,
) {
  const assignedKeys = new Set(assigned.map(appBindingKey));
  const needle = search.trim().toLowerCase();
  return options.filter(
    (candidate) =>
      !assignedKeys.has(appBindingKey(candidate)) &&
      (!needle || candidate.name.toLowerCase().includes(needle)),
  );
}

export type WebsiteCandidate =
  | { status: "empty" }
  | { status: "invalid"; domain: string }
  | { status: "duplicate"; domain: string }
  | { status: "ready"; domain: string };

export function classifyWebsite(
  input: string,
  websites: Personality["websites"],
  validDomain: (domain: string) => boolean,
): WebsiteCandidate {
  const domain = normalizeWebsite(input);
  if (!domain) return { status: "empty" };
  if (!validDomain(domain)) return { status: "invalid", domain };
  const duplicate = websites.some(
    (site) => site.toLowerCase() === domain.toLowerCase(),
  );
  return duplicate
    ? { status: "duplicate", domain }
    : { status: "ready", domain };
}

export const instructionsFromText = (value: string) => value.split(/\r?\n/);
