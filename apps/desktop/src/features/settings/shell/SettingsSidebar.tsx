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
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { SettingsSection } from "../preferences/settings-navigation";

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
    <aside className="min-w-0 border-b border-border-primary pb-3 min-[1081px]:border-r min-[1081px]:border-b-0 min-[1081px]:pb-0 min-[1081px]:pr-4">
      <nav
        aria-label={t({
          id: "settings.route.navigation",
          message: "Setup navigation",
        })}
        className="flex max-w-full gap-2 overflow-x-auto min-[1081px]:h-full min-[1081px]:flex-col min-[1081px]:gap-3 min-[1081px]:overflow-y-auto"
      >
        {navigationGroups.map((group) => (
          <div className="contents min-[1081px]:block" key={group.heading.id}>
            <p className="mb-1.5 hidden ui-text-uppercase-micro ui-color-muted font-semibold uppercase tracking-[0.085em] min-[1081px]:block">
              {t(group.heading)}
            </p>
            <div className="contents min-[1081px]:flex min-[1081px]:flex-col min-[1081px]:gap-0.5">
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
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon: Icon,
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
    ? "bg-[var(--color-accent)] text-white"
    : "ui-color-secondary hover:bg-surface-elevated hover:text-content-secondary";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "page" : undefined}
      className={`group inline-flex h-[31px] w-auto shrink-0 items-center whitespace-nowrap rounded-md px-2 text-left ui-text-body-sm-strong transition-[background-color,color,transform] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)] min-[1081px]:w-full ${stateClass}`}
    >
      <Icon aria-hidden="true" className="mr-2 shrink-0" size={14} />
      {label}
    </button>
  );
}
