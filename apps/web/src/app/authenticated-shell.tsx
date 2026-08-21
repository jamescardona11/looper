import { useAuth, useCurrentUser, useIsAdmin } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import {
  IconChevronUp,
  IconCreditCard,
  IconLogout,
  IconMenu2,
  IconSearch,
  IconSettings,
  IconShieldLock,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { type KeyboardEvent, lazy, type RefObject, Suspense, useRef, useState } from "react";
import {
  APP_DESTINATIONS,
  MANAGE_DESTINATIONS,
  VOICE_DESTINATIONS,
  WORKSPACE_DESTINATIONS,
} from "@/app/navigation";
import { cn } from "@/lib/cn";
import { CommandPalette } from "@/shared/components/command-palette";
import { ConfirmProvider } from "@/shared/components/confirm-dialog";
import { LooperMark } from "@/shared/components/looper-mark";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/shared/components/ui/menu";
import { TooltipProvider } from "@/shared/components/ui/tooltip";

const ThreadSidebar = lazy(() =>
  import("@/features/agent").then((module) => ({
    default: module.ThreadSidebar,
  })),
);

export default function AuthenticatedShell() {
  return (
    <TooltipProvider>
      <ConfirmProvider>
        <AuthenticatedChrome />
      </ConfirmProvider>
    </TooltipProvider>
  );
}

function AuthenticatedChrome() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openNavigationRef = useRef<HTMLButtonElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);

  function closeSidebar() {
    const restoreFocus = sidebarOpen;
    setSidebarOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => openNavigationRef.current?.focus());
    }
  }

  function openSidebar() {
    setSidebarOpen(true);
    requestAnimationFrame(() => closeNavigationRef.current?.focus());
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <button
        type="button"
        aria-label={t("common.close")}
        aria-hidden={!sidebarOpen}
        tabIndex={-1}
        onClick={closeSidebar}
        className={cn(
          "fixed inset-0 z-30 bg-background/80 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <AppSidebar
        pathname={pathname}
        open={sidebarOpen}
        onClose={closeSidebar}
        closeButtonRef={closeNavigationRef}
      />

      <div className="flex min-w-0 flex-1 flex-col" inert={sidebarOpen ? true : undefined}>
        <MobileHeader open={sidebarOpen} onOpen={openSidebar} buttonRef={openNavigationRef} />
        <section
          aria-label={t("common.pageContent")}
          data-web-workspace
          className="min-h-0 flex-1 overflow-y-auto"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: this is the shell's only scroll viewport
          tabIndex={0}
        >
          <Outlet />
        </section>
      </div>
    </div>
  );
}

function AppSidebar({
  pathname,
  open,
  onClose,
  closeButtonRef,
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const isAgent = pathname === "/agent";
  const sidebarRef = useRef<HTMLElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the aside becomes a modal dialog only while the mobile drawer is open
    <aside
      data-pathname={pathname}
      ref={sidebarRef}
      id="app-sidebar"
      data-testid="app-sidebar"
      role={open ? "dialog" : "complementary"}
      aria-modal={open ? true : undefined}
      aria-label={open ? t("nav.workspace") : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-border border-r bg-card transition-transform duration-200 ease-out lg:static lg:translate-x-0",
        open ? "visible translate-x-0 shadow-2xl" : "invisible -translate-x-full lg:visible",
      )}
    >
      <div className={cn("flex h-12 shrink-0 items-center gap-2 border-border border-b px-3")}>
        <Link to="/home" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
            <LooperMark className="size-4" />
          </span>
          <span className="truncate font-medium text-sm tracking-tight">Looper</span>
        </Link>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="touch-target relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <IconX className="size-4" aria-hidden />
        </button>
      </div>

      <div className="shrink-0 space-y-4 px-2 py-3">
        <CommandPalette
          trigger={
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 text-muted-foreground text-xs transition-colors hover:border-ring hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconSearch className="size-3.5" aria-hidden />
              <span className="flex-1 text-left">{t("cmd.searchPlaceholder")}</span>
              <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[9px]">
                ⌘K
              </kbd>
            </button>
          }
        />

        <NavSection
          label={t("nav.workspace")}
          destinations={WORKSPACE_DESTINATIONS}
          onNavigate={onClose}
        />
        <NavSection
          label={t("nav.voiceTools")}
          destinations={VOICE_DESTINATIONS}
          onNavigate={onClose}
          compact
        />
      </div>

      {isAgent ? (
        <Suspense fallback={<div className="min-h-0 flex-1" />}>
          <ThreadSidebar onNavigate={onClose} />
        </Suspense>
      ) : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-2", isAgent && "hidden")}>
        <NavSection
          label={t("nav.manage")}
          destinations={MANAGE_DESTINATIONS}
          onNavigate={onClose}
        />
      </div>

      <div className="shrink-0 border-border border-t p-2">
        {isAgent ? (
          <div className="mb-2">
            <NavSection destinations={MANAGE_DESTINATIONS} onNavigate={onClose} compact />
          </div>
        ) : null}
        {isAdmin ? (
          <Link
            to="/admin"
            onClick={onClose}
            className={navItemClass}
            activeProps={{ className: activeNavItemClass }}
          >
            <IconShieldLock className="size-4" aria-hidden />
            <span className="flex-1">{t("nav.admin")}</span>
          </Link>
        ) : null}
        <AccountMenu onNavigate={onClose} />
      </div>
    </aside>
  );
}

type Destination =
  | (typeof WORKSPACE_DESTINATIONS)[number]
  | (typeof VOICE_DESTINATIONS)[number]
  | (typeof MANAGE_DESTINATIONS)[number];

const navItemClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeNavItemClass = "bg-primary text-primary-foreground shadow-sm";

function NavSection({
  label,
  destinations,
  onNavigate,
  compact = false,
}: {
  label?: string;
  destinations: readonly Destination[];
  onNavigate: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (destinations.length === 0) return null;

  return (
    <nav aria-label={label} className={cn(!compact && "space-y-1")}>
      {label ? (
        <p className="px-2.5 pb-1 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.16em]">
          {label}
        </p>
      ) : null}
      {destinations.map((destination) => (
        <Link
          key={destination.id}
          to={destination.to}
          onClick={onNavigate}
          className={navItemClass}
          activeProps={{ className: activeNavItemClass }}
          activeOptions={{ exact: true }}
        >
          <destination.icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t(destination.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

function MobileHeader({
  open,
  onOpen,
  buttonRef,
}: {
  open: boolean;
  onOpen: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const destination = APP_DESTINATIONS.find((item) => item.to === pathname);
  const label = destination ? t(destination.labelKey) : "Looper";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-border border-b bg-card px-3 lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        aria-label={t("nav.openMenu")}
        aria-controls="app-sidebar"
        aria-expanded={open}
        className="touch-target relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <IconMenu2 className="size-4" aria-hidden />
      </button>
      <span className="font-medium text-sm">{label}</span>
    </header>
  );
}

function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { user } = useCurrentUser();
  const displayName = user?.email ?? t("nav.account");
  const handleSignOut = () => {
    onNavigate();
    void signOut();
  };

  return (
    <Menu>
      <MenuTrigger className="mt-1 flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[popup-open]:bg-secondary data-[popup-open]:text-foreground">
        <IconUserCircle className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs">{displayName}</span>
        <IconChevronUp className="size-3.5" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" side="top" className="min-w-[210px]">
        {user?.email ? (
          <>
            <div className="px-2 py-1.5">
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            </div>
            <MenuSeparator />
          </>
        ) : null}
        <MenuItem render={<Link to="/settings" onClick={onNavigate} />}>
          <IconSettings className="size-4" />
          {t("nav.settings")}
        </MenuItem>
        <MenuItem render={<Link to="/billing" onClick={onNavigate} />}>
          <IconCreditCard className="size-4" />
          {t("nav.billing")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onClick={handleSignOut}>
          <IconLogout className="size-4" />
          {t("auth.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
