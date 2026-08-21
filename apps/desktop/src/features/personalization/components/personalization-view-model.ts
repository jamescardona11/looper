import type { AppBinding, Personality } from "../../../contracts";
import type { InstalledApp } from "../../../data/personalization";
import {
  appBindingKey,
  normalizeWebsite,
  shouldReplaceAppBinding,
} from "./personalization-utils";

export type PersonalizationViewProps = {
  isActive?: boolean;
  embedded?: boolean;
  showModeRules?: boolean;
};

export type PersonalityChange =
  | { kind: "prepend"; personality: Personality }
  | { kind: "remove"; id: string }
  | { kind: "patch"; id: string; patch: Partial<Personality> }
  | {
      kind: "replace";
      id: string;
      update: (personality: Personality) => Personality;
    }
  | { kind: "assign-app"; id: string; app: AppBinding };

export type InstalledAppIndexes = {
  byBinding: Map<string, InstalledApp>;
  byName: Map<string, InstalledApp>;
};

export type PersonalizationViewActions = {
  addPersonality: () => void;
  assignApp: (id: string, app: AppBinding) => void;
  closeEditor: () => void;
  deletePersonality: (id: string) => void;
  editPersonality: (id: string) => void;
  patchPersonality: (id: string, patch: Partial<Personality>) => void;
  replacePersonality: (
    id: string,
    update: (personality: Personality) => Personality,
  ) => void;
  requestDelete: (personality: Personality) => void;
  selectPersonality: (id: string) => void;
};

export function blankPersonality(id: string, name: string): Personality {
  return {
    id,
    name,
    enabled: true,
    apps: [],
    websites: [],
    instructions: [],
  };
}

export function changePersonalities(
  current: Personality[],
  change: PersonalityChange,
): Personality[] {
  switch (change.kind) {
    case "prepend":
      return [change.personality, ...current];
    case "remove":
      return current.filter((personality) => personality.id !== change.id);
    case "patch":
      return current.map((personality) =>
        personality.id === change.id
          ? { ...personality, ...change.patch }
          : personality,
      );
    case "replace":
      return current.map((personality) =>
        personality.id === change.id ? change.update(personality) : personality,
      );
    case "assign-app":
      return moveAppBinding(current, change.id, change.app);
  }
}

function moveAppBinding(
  personalities: Personality[],
  ownerId: string,
  app: AppBinding,
): Personality[] {
  return personalities.map((personality) => {
    const bindingsWithoutApp = personality.apps.filter(
      (binding) => !shouldReplaceAppBinding(binding, app),
    );
    if (personality.id !== ownerId) {
      return { ...personality, apps: bindingsWithoutApp };
    }
    return { ...personality, apps: bindingsWithoutApp.concat(app) };
  });
}

export function websiteDomainsFor(personalities: Personality[]): string[] {
  const domains = new Set<string>();
  personalities.forEach((personality) => {
    personality.websites.forEach((website) => {
      const domain = normalizeWebsite(website);
      if (domain !== "") domains.add(domain);
    });
  });
  return [...domains].sort();
}

export function indexInstalledApps(apps: InstalledApp[]): InstalledAppIndexes {
  const byBinding = new Map<string, InstalledApp>();
  const byName = new Map<string, InstalledApp>();
  apps.forEach((app) => {
    byBinding.set(appBindingKey(app), app);
    byName.set(app.name.toLowerCase(), app);
  });
  return { byBinding, byName };
}

export function selectedPersonality(
  personalities: Personality[],
  selectedId: string | null,
): Personality | null {
  return (
    personalities.find((personality) => personality.id === selectedId) ??
    personalities.at(0) ??
    null
  );
}

export function appIconPath(
  app: AppBinding,
  indexes: InstalledAppIndexes,
): string | null | undefined {
  return (
    indexes.byBinding.get(appBindingKey(app)) ??
    indexes.byName.get(app.name.toLowerCase())
  )?.icon_path;
}
