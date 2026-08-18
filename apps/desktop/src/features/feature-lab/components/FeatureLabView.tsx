import { useLingui } from "@lingui/react/macro";
import {
  ArrowRight,
  CheckCircle,
  DeviceMobile,
  FileMd,
  FlowArrow,
  MagnifyingGlass,
  Quotes,
  ShieldCheck,
  TestTube,
  TextAa,
  WarningCircle,
  Waveform,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import ScreenHeader from "../../../shared/ui/ScreenHeader";
import WorkspacePage from "../../../shared/ui/WorkspacePage";
import type { FeatureDiagnostic } from "../types";

type FeatureLabViewProps = {
  onOpenDictionary: () => void;
  onOpenLibrary: () => void;
  onOpenMemory: () => void;
  onOpenWorkflows: () => void;
  onOpenAppSettings: () => void;
  runDiagnostics: () => Promise<FeatureDiagnostic[]>;
};

type FeatureCardProps = {
  action: string;
  description: string;
  icon: PhosphorIcon;
  onClick?: () => void;
  title: string;
};

export default function FeatureLabView({
  onOpenDictionary,
  onOpenLibrary,
  onOpenMemory,
  onOpenWorkflows,
  onOpenAppSettings,
  runDiagnostics,
}: FeatureLabViewProps) {
  const { t } = useLingui();
  const reducedMotion = useReducedMotion();
  const [diagnostics, setDiagnostics] = useState<FeatureDiagnostic[]>([]);
  const [running, setRunning] = useState(false);

  const handleRunDiagnostics = async () => {
    if (running) return;
    setRunning(true);
    try {
      const results = await runDiagnostics();
      setDiagnostics([]);
      for (const diagnostic of results) {
        setDiagnostics((current) => [
          ...current,
          { ...diagnostic, checkedAt: new Date().toLocaleTimeString() },
        ]);
        if (!reducedMotion) {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const cards: FeatureCardProps[] = [
    {
      title: t({ id: "feature_lab.workflows.title", message: "Workflows v2" }),
      description: t({
        id: "feature_lab.workflows.body",
        message: "Create app, site, field, hotkey, and manual workflows.",
      }),
      action: t({
        id: "feature_lab.workflows.action",
        message: "Open workflows",
      }),
      icon: FlowArrow,
      onClick: onOpenWorkflows,
    },
    {
      title: t({
        id: "feature_lab.snippets.title",
        message: "Dynamic snippets",
      }),
      description: t({
        id: "feature_lab.snippets.body",
        message: "Try DATE, TIME, CLIPBOARD, APP, and SELECTION variables.",
      }),
      action: t({
        id: "feature_lab.snippets.action",
        message: "Open snippets",
      }),
      icon: Quotes,
      onClick: onOpenDictionary,
    },
    {
      title: t({ id: "feature_lab.memory.title", message: "Looper Memory" }),
      description: t({
        id: "feature_lab.memory.body",
        message:
          "Search dictations, recordings, and meetings in one local index.",
      }),
      action: t({ id: "feature_lab.memory.action", message: "Search Memory" }),
      icon: MagnifyingGlass,
      onClick: onOpenMemory,
    },
    {
      title: t({
        id: "feature_lab.meetings.title",
        message: "Live meeting transcript",
      }),
      description: t({
        id: "feature_lab.meetings.body",
        message:
          "Record a meeting, watch live text, and mark important moments.",
      }),
      action: t({
        id: "feature_lab.meetings.action",
        message: "Open meetings",
      }),
      icon: Waveform,
      onClick: onOpenLibrary,
    },
    {
      title: t({
        id: "feature_lab.privacy.title",
        message: "Overlay privacy",
      }),
      description: t({
        id: "feature_lab.privacy.body",
        message:
          "Hide Looper overlays from screen capture on supported systems.",
      }),
      action: t({
        id: "feature_lab.privacy.action",
        message: "Open privacy setting",
      }),
      icon: ShieldCheck,
      onClick: onOpenAppSettings,
    },
    {
      title: t({
        id: "feature_lab.markdown.title",
        message: "Markdown mirror",
      }),
      description: t({
        id: "feature_lab.markdown.body",
        message:
          "Mirror dictations and recordings into an Obsidian-compatible folder.",
      }),
      action: t({
        id: "feature_lab.markdown.action",
        message: "Open mirror setting",
      }),
      icon: FileMd,
      onClick: onOpenAppSettings,
    },
    {
      title: t({
        id: "feature_lab.mobile.title",
        message: "Mobile Local STT",
      }),
      description: t({
        id: "feature_lab.mobile.body",
        message:
          "Run readiness and the 100-dictation evidence gate from Mobile Feature Lab.",
      }),
      action: t({
        id: "feature_lab.mobile.action",
        message: "Continue on mobile",
      }),
      icon: DeviceMobile,
    },
  ];

  return (
    <WorkspacePage
      className="h-full"
      contentClassName="mt-6 min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1"
      header={
        <ScreenHeader
          icon={<TestTube size={20} weight="duotone" aria-hidden="true" />}
          title={t({
            id: "feature_lab.title",
            message: "Try every new capability",
          })}
          description={t({
            id: "feature_lab.subtitle",
            message:
              "Open each real product flow. Diagnostics verify local wiring; microphone, insertion, and physical-device checks remain hands-on.",
          })}
          trailing={
            <button
              type="button"
              onClick={() => void handleRunDiagnostics()}
              disabled={running}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-content-primary px-3.5 ui-text-body-sm-strong text-surface-primary transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCircle size={16} aria-hidden="true" />
              {running
                ? t({
                    id: "feature_lab.diagnostics.running",
                    message: "Checking…",
                  })
                : t({
                    id: "feature_lab.diagnostics.run",
                    message: "Run diagnostics",
                  })}
            </button>
          }
        />
      }
    >
      <div className="rounded-xl border border-border-primary bg-surface-surface p-4">
        <div className="flex items-center gap-2">
          <TextAa size={18} className="ui-color-secondary" aria-hidden="true" />
          <h2 className="ui-text-body-sm-strong ui-color-primary">
            {t({
              id: "feature_lab.insertion.title",
              message: "Insertion + deterministic formatting",
            })}
          </h2>
        </div>
        <p className="mt-1 ui-text-meta ui-color-muted">
          {t({
            id: "feature_lab.insertion.body",
            message:
              "Focus the field and dictate: “comprar leche mejor dicho agua punto”. Expected: “Comprar agua.”",
          })}
        </p>
        <textarea
          aria-label={t({
            id: "feature_lab.insertion.field_aria",
            message: "Dictation test field",
          })}
          placeholder={t({
            id: "feature_lab.insertion.placeholder",
            message: "Focus here, then use your Looper shortcut…",
          })}
          className="mt-3 min-h-24 w-full resize-y rounded-lg border border-border-secondary bg-surface-overlay px-3 py-2.5 ui-text-body-sm ui-color-primary outline-none transition-[border-color,box-shadow] duration-150 placeholder:ui-color-disabled focus:border-border-hover focus:ring-2 focus:ring-border-primary"
        />
      </div>

      {diagnostics.length > 0 ? (
        <div
          className="mt-4 rounded-xl border border-border-primary bg-surface-surface p-4"
          aria-live="polite"
        >
          <h2 className="ui-text-body-sm-strong ui-color-primary">
            {t({
              id: "feature_lab.diagnostics.title",
              message: "Runtime evidence",
            })}
          </h2>
          <div className="mt-3 divide-y divide-border-primary">
            {diagnostics.map((diagnostic) => (
              <div
                key={diagnostic.id}
                className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                {diagnostic.status === "pass" ? (
                  <CheckCircle
                    size={17}
                    weight="fill"
                    className="mt-0.5 text-[var(--color-success)]"
                    aria-hidden="true"
                  />
                ) : (
                  <WarningCircle
                    size={17}
                    className="mt-0.5 text-[var(--color-warning)]"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="ui-text-body-sm-strong ui-color-primary">
                    {diagnostic.label}
                  </div>
                  <div className="mt-0.5 ui-text-meta ui-color-muted">
                    {diagnostic.detail}
                  </div>
                </div>
                <span className="shrink-0 font-mono ui-text-micro tabular-nums ui-color-disabled">
                  {diagnostic.checkedAt}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-border-primary bg-surface-surface pb-0">
        {cards.map((card) => (
          <FeatureCard key={card.title} {...card} />
        ))}
      </div>
    </WorkspacePage>
  );
}

function FeatureCard({
  action,
  description,
  icon: Icon,
  onClick,
  title,
}: FeatureCardProps) {
  const { t } = useLingui();
  const content = (
    <>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated ui-color-secondary">
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="ui-text-body-sm-strong ui-color-primary">{title}</h2>
        <p className="mt-1 ui-text-meta ui-color-muted text-pretty">
          {description}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-1 ui-text-micro font-semibold ${
          onClick
            ? "bg-success/10 text-[var(--color-success)]"
            : "bg-warning/10 text-[var(--color-warning)]"
        }`}
      >
        {onClick
          ? t({ id: "feature_lab.status.available", message: "Available" })
          : t({ id: "feature_lab.status.manual", message: "Manual" })}
      </span>
      <span className="inline-flex min-w-32 shrink-0 items-center justify-end gap-1.5 ui-text-meta font-medium ui-color-secondary">
        {action}
        {onClick ? <ArrowRight size={13} aria-hidden="true" /> : null}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-3 border-b border-border-primary p-4 opacity-75 last:border-b-0">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border-primary p-4 text-left transition-colors duration-150 ease-out last:border-b-0 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-hover motion-reduce:transition-none"
    >
      {content}
    </button>
  );
}
