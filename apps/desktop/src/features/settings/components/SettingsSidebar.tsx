import { useLingui } from "@lingui/react/macro";
import {
  ArrowsClockwise as Sync,
  CalendarBlank,
  Database,
  Info,
  Key,
  Keyboard,
  Microphone,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
  User,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";

import type { SettingsSection } from "../settings-navigation";

type SettingsSidebarProps = {
  activeSection: SettingsSection;
  loading: boolean;
  onSelect: (section: SettingsSection) => void;
};

type NavigationItem = {
  section: SettingsSection;
  icon: PhosphorIcon;
  label: { id: string; message: string };
  hiddenWhileLoading?: boolean;
};

type NavigationGroup = {
  heading: { id: string; message: string };
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    heading: { id: "settings.modal.section.account", message: "Account" },
    items: [
      {
        section: "account",
        icon: User,
        label: { id: "settings.modal.tab.account", message: "Account" },
      },
      {
        section: "sync",
        icon: Sync,
        label: { id: "settings.modal.tab.sync", message: "Sync" },
      },
    ],
  },
  {
    heading: {
      id: "settings.modal.section.dictation",
      message: "Dictation",
    },
    items: [
      {
        section: "processing",
        icon: SquaresFour,
        label: {
          id: "settings.modal.tab.processing_models",
          message: "Processing & Models",
        },
      },
      {
        section: "microphone",
        icon: Microphone,
        label: {
          id: "settings.modal.tab.microphone_language",
          message: "Microphone & Language",
        },
      },
      {
        section: "shortcuts",
        icon: Keyboard,
        label: {
          id: "settings.modal.tab.shortcuts",
          message: "Shortcuts",
        },
      },
      {
        section: "behavior",
        icon: SlidersHorizontal,
        label: { id: "settings.modal.tab.behavior", message: "Behavior" },
      },
      {
        section: "providers",
        icon: Key,
        label: {
          id: "settings.modal.tab.providers",
          message: "Cloud providers",
        },
        hiddenWhileLoading: true,
      },
    ],
  },
  {
    heading: {
      id: "settings.modal.section.workspace",
      message: "Workspace",
    },
    items: [
      {
        section: "appearance",
        icon: Palette,
        label: {
          id: "settings.modal.tab.appearance",
          message: "Appearance",
        },
      },
      {
        section: "calendar",
        icon: CalendarBlank,
        label: {
          id: "settings.modal.tab.calendar_meetings",
          message: "Calendar & Meetings",
        },
      },
      {
        section: "privacy",
        icon: ShieldCheck,
        label: { id: "settings.modal.tab.privacy", message: "Privacy" },
      },
      {
        section: "storage",
        icon: Database,
        label: {
          id: "settings.modal.tab.storage_data",
          message: "Storage & Data",
        },
      },
    ],
  },
  {
    heading: { id: "settings.modal.section.about", message: "About" },
    items: [
      {
        section: "about",
        icon: Info,
        label: {
          id: "settings.modal.tab.about_looper",
          message: "About Looper",
        },
      },
    ],
  },
];

export function SettingsSidebar({
  activeSection,
  loading,
  onSelect,
}: SettingsSidebarProps) {
  const { t } = useLingui();

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-border-primary bg-surface-surface">
      <div className="px-4 pt-5 pb-4">
        <h2 className="ui-text-title-strong ui-color-primary">
          {t({ id: "settings.modal.title", message: "Settings" })}
        </h2>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-2">
        {navigationGroups.map((group) => (
          <div className="space-y-1" key={group.heading.id}>
            <p className="px-2.5 pb-1.5 ui-text-uppercase-meta ui-color-disabled font-semibold">
              {t(group.heading)}
            </p>
            {group.items.map((item) =>
              loading && item.hiddenWhileLoading ? null : (
                <SidebarItem
                  key={item.section}
                  icon={item.icon}
                  label={t(item.label)}
                  selected={activeSection === item.section}
                  onSelect={() => onSelect(item.section)}
                />
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon: _Icon,
  label,
  selected,
  onSelect,
}: {
  icon: PhosphorIcon;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const stateClass = selected
    ? "bg-[var(--color-accent)] ui-color-on-solid shadow-sm"
    : "ui-color-muted hover:bg-surface-elevated hover:text-content-secondary";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center rounded-lg px-2.5 py-2 text-left ui-text-body-sm-strong transition-colors ${stateClass}`}
      whileTap={{ scale: 0.98 }}
    >
      {label}
    </motion.button>
  );
}
