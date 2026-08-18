import { useTranslation } from "@looper/i18n/react";
import { IconKey } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/shared/components/ui";

export function ToolSetupNotice() {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <IconKey aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{t("tools.setupTitle")}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{t("tools.setupHint")}</p>
        <Link
          to="/settings"
          search={{ tab: "keys" }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
        >
          {t("tools.openApiKeys")}
        </Link>
      </div>
    </div>
  );
}
