import { useTranslation } from "@looper/i18n/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useEffect, useReducer } from "react";
import { type AppPath, COMMAND_DESTINATIONS } from "@/app/navigation";
import { cn } from "@/lib/cn";
import { Dialog, DialogContent, DialogTrigger } from "@/shared/components/ui/dialog";

type Command = {
  id: string;
  labelKey: string;
  keywords: string;
  icon: (typeof COMMAND_DESTINATIONS)[number]["icon"];
  to: AppPath;
};

const COMMANDS: Command[] = COMMAND_DESTINATIONS.map((destination) => ({
  id: destination.id,
  labelKey:
    "commandLabelKey" in destination && typeof destination.commandLabelKey === "string"
      ? destination.commandLabelKey
      : destination.labelKey,
  keywords: destination.keywords,
  icon: destination.icon,
  to: destination.to,
}));

type PaletteState = {
  open: boolean;
  query: string;
  active: number;
};

type PaletteAction =
  | { type: "toggle" }
  | { type: "setOpen"; open: boolean }
  | { type: "setQuery"; query: string }
  | { type: "setActive"; active: number };

const CLOSED_STATE: PaletteState = { open: false, query: "", active: 0 };

function paletteReducer(state: PaletteState, action: PaletteAction): PaletteState {
  if (action.type === "toggle") {
    return state.open ? CLOSED_STATE : { ...state, open: true };
  }
  if (action.type === "setOpen") {
    return action.open ? { ...state, open: true } : CLOSED_STATE;
  }
  if (action.type === "setQuery") {
    return { ...state, query: action.query, active: 0 };
  }
  return { ...state, active: action.active };
}

// ⌘K / Ctrl+K command palette: fuzzy-jump to any screen. The signature of a
// "serious" web app. Keyboard-first (↑↓ to move, ↵ to run, esc to close);
// no dependency — a filtered list + a global key listener.
export function CommandPalette({ trigger }: { trigger?: ReactElement }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [{ open, query, active }, dispatch] = useReducer(paletteReducer, CLOSED_STATE);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? COMMANDS.filter((command) =>
        `${t(command.labelKey)} ${command.keywords ?? ""}`.toLowerCase().includes(normalizedQuery),
      )
    : COMMANDS;
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch({ type: "toggle" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (c: Command) => {
    dispatch({ type: "setOpen", open: false });
    void navigate({
      to: c.to,
    });
  };

  // Base UI Dialog owns Escape, scroll-lock, focus-trap and focus return; the
  // ArrowUp/Down + Enter handling below is the palette's own list navigation.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dispatch({
        type: "setActive",
        active: Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0)),
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dispatch({ type: "setActive", active: Math.max(activeIndex - 1, 0) });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[activeIndex];
      if (c) run(c);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => dispatch({ type: "setOpen", open: nextOpen })}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        aria-label={t("cmd.palette")}
        showClose={false}
        className="top-[15vh] max-w-lg translate-y-0 overflow-hidden rounded-xl p-0 text-left"
      >
        <input
          value={query}
          onChange={(e) => dispatch({ type: "setQuery", query: e.target.value })}
          onKeyDown={onKeyDown}
          aria-label={t("cmd.searchPlaceholder")}
          placeholder={t("cmd.searchPlaceholder")}
          className="w-full border-border border-b bg-transparent px-4 py-3.5 text-foreground text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-muted-foreground text-sm">
              {t("cmd.noCommandsFound")}
            </li>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseEnter={() => dispatch({ type: "setActive", active: i })}
                    onClick={() => run(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === activeIndex
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    <span className="text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">{t(c.labelKey)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between border-border border-t px-4 py-2 text-[10px] text-muted-foreground">
          <span>{t("cmd.keyboardHint")}</span>
          <span className="rounded border border-border px-1.5 py-0.5">⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
