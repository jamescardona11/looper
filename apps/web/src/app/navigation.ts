// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import {
  IconChartBar,
  IconHome,
  IconMessage,
  IconMicrophone,
  IconNotebook,
  IconSettings,
} from "@tabler/icons-react";
import { IconCreditCard } from "@tabler/icons-react";

type DestinationIcon = typeof IconHome;
export type NavGroup = "workspace" | "voice" | "manage" | "account" | null;

interface AppDestination {
  id: string;
  to: string;
  labelKey: string;
  commandLabelKey?: string;
  badge?: "unread";
  keywords: string;
  icon: DestinationIcon;
  navGroup: NavGroup;
  command: boolean;
  productRoute: boolean;
}

export const APP_DESTINATIONS = [
  {
    id: "home",
    to: "/home",
    labelKey: "nav.home",
    keywords: "home overview recent workspace",
    icon: IconHome,
    navGroup: "workspace",
    command: true,
    productRoute: true,
  },
  {
    id: "agent",
    to: "/agent",
    labelKey: "nav.chat",
    keywords: "recording assistant transcript dictation notes",
    icon: IconMessage,
    navGroup: "workspace",
    command: true,
    productRoute: true,
  },
  {
    id: "transcribe",
    to: "/transcribe",
    labelKey: "nav.transcribe",
    keywords: "stt speech to text",
    icon: IconMicrophone,
    navGroup: "voice",
    command: true,
    productRoute: true,
  },
  {
    id: "dictation",
    to: "/dictation",
    labelKey: "nav.dictation",
    keywords: "dictation dictionary replacements styles tones",
    icon: IconNotebook,
    navGroup: "voice",
    command: true,
    productRoute: true,
  },
  {
    id: "usage",
    to: "/usage",
    labelKey: "nav.usage",
    commandLabelKey: "cmd.usage",
    keywords: "stats metrics",
    icon: IconChartBar,
    navGroup: "manage",
    command: true,
    productRoute: true,
  },
  {
    id: "billing",
    to: "/billing",
    labelKey: "nav.billing",
    commandLabelKey: "cmd.pricingBilling",
    keywords: "plans subscription upgrade",
    icon: IconCreditCard,
    navGroup: "account",
    command: true,
    productRoute: true,
  },
  {
    id: "settings",
    to: "/settings",
    labelKey: "settings.title",
    keywords: "api key preferences account",
    icon: IconSettings,
    navGroup: null,
    command: true,
    productRoute: true,
  },
] as const satisfies readonly AppDestination[];

export type AppPath = (typeof APP_DESTINATIONS)[number]["to"];
export type AppDestinationId = (typeof APP_DESTINATIONS)[number]["id"];

export const WORKSPACE_DESTINATIONS = APP_DESTINATIONS.filter((destination) =>
  hasNavGroup(destination, "workspace"),
);
export const VOICE_DESTINATIONS = APP_DESTINATIONS.filter((destination) =>
  hasNavGroup(destination, "voice"),
);
export const MANAGE_DESTINATIONS = APP_DESTINATIONS.filter((destination) =>
  hasNavGroup(destination, "manage"),
);
export const ACCOUNT_DESTINATIONS = APP_DESTINATIONS.filter(
  (destination) => destination.navGroup === "account",
);
export const COMMAND_DESTINATIONS = APP_DESTINATIONS.filter((destination) => destination.command);

export function isAppPath(path: string): path is AppPath {
  return APP_DESTINATIONS.some(
    (destination) => destination.productRoute && destination.to === path,
  );
}

function hasNavGroup(destination: AppDestination, group: NavGroup): boolean {
  return destination.navGroup === group;
}
