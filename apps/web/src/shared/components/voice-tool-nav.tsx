import { useTranslation } from "@looper/i18n/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/cn";

const tools = [
  { to: "/transcribe", labelKey: "nav.transcribe" },
  { to: "/dictation", labelKey: "nav.dictation" },
] as const;

export function VoiceToolNav() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label={t("nav.voiceTools")}
      className="flex gap-6 overflow-x-auto border-border border-b"
    >
      {tools.map((tool) => {
        const active = pathname === tool.to;
        return (
          <Link
            key={tool.to}
            to={tool.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-transparent border-b-2 py-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {t(tool.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
