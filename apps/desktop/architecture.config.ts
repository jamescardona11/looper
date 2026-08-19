// Architecture rules for the desktop app, evaluated by the shared checker in
// tools/architecture-check. Violation codes are stable identifiers, in line
// with the web (WEB-*) and backend (BE-*) configs.
//
// Desktop is the largest surface in the repo and had no automated boundary
// enforcement. The rules below freeze the coupling that exists today: every
// allowlist may shrink but must not grow.

import { dirname, join, relative } from "node:path";
import type {
  ArchitectureConfig,
  RuleContext,
  Violation,
} from "@looper/architecture-check";

const sourceRoot = join(import.meta.dirname, "src");

// The only layer allowed to talk to the Tauri runtime. Everything else reaches
// the native side through it. Kept in step with ADR 0003: src/data/ is the sole
// caller of Rust commands. src/platform/ is deliberately NOT here — it is
// navigator sniffing plus a static capability table, with zero @tauri-apps
// imports, so pre-authorising it would licence a dependency nothing has asked
// for.
const tauriOwningRoots = ["data/"];

// The layers that own the native-facing surface and must therefore stay
// renderable-agnostic. Wider than `tauriOwningRoots` on purpose: platform/
// carries no Tauri import but must not grow UI either. The two lists answer
// opposite questions, so they must not be collapsed back into one.
const nativeOwningRoots = ["data/", "platform/"];

// Files outside data/ and platform/ that import a @tauri-apps module today.
// Measured on the current tree; the list may shrink but must not grow. Entries
// whose file is deleted simply become inert. Test files that only `vi.mock`
// a Tauri module do not import it and are therefore not listed.
const grandfatheredTauriConsumers = [
  "app/App.tsx",
  "app/providers.tsx",
  "app/runtime/QueryCacheBridge.tsx",
  "features/library/components/LibraryImportModal.tsx",
  "features/library/components/MeetingAwarenessOverlay.tsx",
  "features/library/components/MeetingCaptureOverlay.tsx",
  "features/library/components/WatchFoldersSetting.tsx",
  "features/library/components/library-view-content.tsx",
  "features/library/components/useLibraryExport.ts",
  "features/license/components/customer-portal-action.ts",
  "features/onboarding/OnboardingScreen.tsx",
  "features/personalization/components/personality-modal-icons.tsx",
  "features/pill/pill-dictation-overlay.tsx",
  "features/pill/pill-preflight.tsx",
  "features/pill/use-pill-interactions.ts",
  "features/pill/useOverlayPosition.ts",
  "features/pill/usePillState.ts",
  "features/settings/components/tabs/useAppTabControls.ts",
  "features/settings/useAccountCheckout.ts",
  "features/settings/useSettingsAppActions.ts",
  "features/settings/useSettingsPermissions.ts",
  "features/transcriptions/components/transcription-item-lifecycle.tsx",
  "features/transcriptions/use-transcription-retry.ts",
  "main.tsx",
  "shared/hooks/useShiftHeld.ts",
];

// `invoke` is the Rust command surface and is held to a stricter line than the
// rest of the Tauri API: no file outside data/ and platform/ may import it, and
// there is nothing to grandfather today.
//
// features/preview/pillPreviewBridge.ts calls `invoke` but is deliberately not
// listed: it is the browser-only pill preview harness (VITE_SIGNAL_PREVIEW),
// where no Tauri runtime exists, so it installs a stub `__TAURI_INTERNALS__`
// global instead of importing @tauri-apps. It never imports the module and is
// therefore invisible to an import-based rule.
const grandfatheredInvokeConsumers: string[] = [];

// Cross-feature imports that exist today, one entry per (file, target feature).
// The list may shrink but must not grow. It freezes these measured cycles:
// dictionary<->voice, personalization<->voice, pill<->library,
// onboarding<->import, library<->settings.
const grandfatheredCrossFeatureImports = [
  {
    from: "features/dictionary/components/dictionary-view-presentation.ts",
    to: "voice",
  },
  { from: "features/dictionary/components/DictionaryView.tsx", to: "settings" },
  { from: "features/dictionary/dictionary-cache-policy.ts", to: "settings" },
  { from: "features/dictionary/queries.test.ts", to: "settings" },
  {
    from: "features/import/components/import-step-footer.tsx",
    to: "onboarding",
  },
  {
    from: "features/import/components/import-step-source.tsx",
    to: "onboarding",
  },
  { from: "features/import/components/ImportStep.test.tsx", to: "onboarding" },
  { from: "features/import/components/ImportStep.tsx", to: "onboarding" },
  { from: "features/import/components/ImportStep.tsx", to: "settings" },
  { from: "features/import/components/ImportStep.tsx", to: "transcriptions" },
  {
    from: "features/library/components/library-detail-session.tsx",
    to: "settings",
  },
  {
    from: "features/library/components/library-view-content.tsx",
    to: "settings",
  },
  { from: "features/library/components/MeetingCaptureOverlay.tsx", to: "pill" },
  { from: "features/library/components/MeetingDetail.tsx", to: "settings" },
  {
    from: "features/library/components/MeetingDocumentDock.tsx",
    to: "settings",
  },
  {
    from: "features/library/components/MeetingTranscriptPanel.tsx",
    to: "settings",
  },
  {
    from: "features/library/components/WatchFoldersSetting.tsx",
    to: "settings",
  },
  {
    from: "features/onboarding/onboarding-screen-policy.test.ts",
    to: "settings",
  },
  { from: "features/onboarding/onboarding-screen-policy.ts", to: "license" },
  { from: "features/onboarding/onboarding-screen-policy.ts", to: "settings" },
  { from: "features/onboarding/onboarding-step-content.tsx", to: "import" },
  { from: "features/onboarding/OnboardingScreen.tsx", to: "import" },
  { from: "features/onboarding/OnboardingScreen.tsx", to: "license" },
  { from: "features/onboarding/OnboardingScreen.tsx", to: "settings" },
  {
    from: "features/onboarding/steps/license-modal-render.test.tsx",
    to: "license",
  },
  { from: "features/onboarding/steps/LicenseModal.tsx", to: "license" },
  { from: "features/onboarding/steps/ModelStep.tsx", to: "settings" },
  {
    from: "features/personalization/components/CompactStyleRow.tsx",
    to: "voice",
  },
  {
    from: "features/personalization/components/ModeRulesSection.tsx",
    to: "voice",
  },
  {
    from: "features/personalization/components/personalization-view-embedded.tsx",
    to: "voice",
  },
  { from: "features/pill/PillOverlay.tsx", to: "library" },
  { from: "features/preview/SignalPreviewFloating.tsx", to: "pill" },
  { from: "features/preview/SignalPreviewPill.tsx", to: "pill" },
  { from: "features/settings/account-checkout-policy.ts", to: "license" },
  { from: "features/settings/components/AccountView.tsx", to: "license" },
  { from: "features/settings/components/SettingsTabContent.tsx", to: "sync" },
  {
    from: "features/settings/components/tabs/AboutOverview.tsx",
    to: "updates",
  },
  {
    from: "features/settings/components/tabs/AppStorageSection.tsx",
    to: "library",
  },
  { from: "features/settings/useAccountCheckout.ts", to: "license" },
  { from: "features/settings/useSettingsResources.ts", to: "license" },
  {
    from: "features/transcriptions/components/TranscriptionItem.tsx",
    to: "settings",
  },
  {
    from: "features/transcriptions/components/TranscriptionList.tsx",
    to: "settings",
  },
  {
    from: "features/transcriptions/transcription-item-policy.ts",
    to: "settings",
  },
  { from: "features/voice/components/VoiceView.tsx", to: "dictionary" },
  { from: "features/voice/components/VoiceView.tsx", to: "personalization" },
];

const featurePathPattern = /^features\/([^/]+)\//;
const invokeImportPattern =
  /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*["']@tauri-apps\/api\/core["']/;

function isTauriSpecifier(specifier: string): boolean {
  return specifier === "@tauri-apps" || specifier.startsWith("@tauri-apps/");
}

function isTauriOwner(path: string): boolean {
  return tauriOwningRoots.some((root) => path.startsWith(root));
}

function featureOf(path: string): string | null {
  return featurePathPattern.exec(path)?.[1] ?? null;
}

function resolveRelative(fileAbsolutePath: string, specifier: string): string {
  return relative(
    sourceRoot,
    join(dirname(fileAbsolutePath), specifier),
  ).replaceAll("\\", "/");
}

// Custom rules bypass the engine's expectFiles guard, so each one asserts its
// own scope: a renamed or emptied directory must break the build loudly rather
// than turn the rule into a no-op.
function missingScope(
  code: string,
  label: string,
  matched: number,
): Violation[] {
  return matched > 0
    ? []
    : [
        {
          code: "RULE-NO-FILES",
          file: code,
          detail: `${label} matched no files under ${sourceRoot} — the enforced directory is missing or empty`,
        },
      ];
}

// The Tauri runtime is a platform detail. Only data/ and platform/ may name it,
// so a command rename or an API upgrade stays a one-layer change.
function checkTauriBoundary(context: RuleContext): Violation[] {
  const allowedConsumers = new Set(grandfatheredTauriConsumers);
  const allowedInvokers = new Set(grandfatheredInvokeConsumers);

  return [
    ...missingScope(
      "DESKTOP-TAURI-BOUNDARY",
      tauriOwningRoots.map((root) => `src/${root}`).join(" / "),
      context.files.filter((file) => isTauriOwner(file.path)).length,
    ),
    ...context.files.flatMap((file) => {
      if (isTauriOwner(file.path)) return [];
      const violations: Violation[] = [];

      if (
        invokeImportPattern.test(file.source) &&
        !allowedInvokers.has(file.path)
      ) {
        violations.push({
          code: "DESKTOP-TAURI-BOUNDARY",
          file: file.path,
          detail:
            "imports invoke from @tauri-apps/api/core — Rust commands are called from src/data/ only",
        });
      }

      const specifier = file.imports.find(isTauriSpecifier);
      if (specifier && !allowedConsumers.has(file.path)) {
        violations.push({
          code: "DESKTOP-TAURI-BOUNDARY",
          file: file.path,
          detail: `imports ${specifier} outside ${tauriOwningRoots.map((root) => `src/${root}`).join(" and ")}`,
        });
      }

      return violations;
    }),
  ];
}

// Features own their internals. No feature reaches into another feature's file
// tree beyond what the frozen list records, and nothing reaches a feature
// through the "@/features/…" alias at all.
function checkFeatureBoundaries(context: RuleContext): Violation[] {
  const featureFiles = context.files.filter(
    (file) => featureOf(file.path) !== null,
  );

  return [
    ...missingScope(
      "DESKTOP-FEATURE-BOUNDARIES",
      "src/features/",
      featureFiles.length,
    ),
    // The alias ban applies to EVERY file, not just files inside a feature:
    // app/, shared/ and main.tsx reach features too, and scoping this to
    // featureFiles would leave exactly those callers unchecked.
    ...context.files.flatMap((file) =>
      file.imports
        .filter((specifier) => specifier.startsWith("@/features/"))
        .map((specifier) => ({
          code: "DESKTOP-FEATURE-BOUNDARIES",
          file: file.path,
          detail: `deep imports through ${specifier} — features are reached by relative path or not at all`,
        })),
    ),
    ...featureFiles.flatMap((file) => {
      const currentFeature = featureOf(file.path);

      return file.imports.flatMap((specifier) => {
        if (!specifier.startsWith(".")) return [];

        const targetFeature = featureOf(
          resolveRelative(file.absolutePath, specifier),
        );
        if (!targetFeature || targetFeature === currentFeature) return [];
        if (
          grandfatheredCrossFeatureImports.some(
            (entry) => entry.from === file.path && entry.to === targetFeature,
          )
        ) {
          return [];
        }

        return [
          {
            code: "DESKTOP-FEATURE-BOUNDARIES",
            file: file.path,
            detail: `imports ${specifier} from feature "${targetFeature}" — new cross-feature coupling is not allowed`,
          },
        ];
      });
    }),
  ];
}

// Layering goes app/features → data/platform, never the reverse: the modules
// that own the native surface must stay renderable-agnostic.
function checkDataLayerPurity(context: RuleContext): Violation[] {
  const ownerFiles = context.files.filter((file) =>
    nativeOwningRoots.some((root) => file.path.startsWith(root)),
  );

  return [
    ...missingScope(
      "DESKTOP-DATA-LAYER-PURITY",
      nativeOwningRoots.map((root) => `src/${root}`).join(" / "),
      ownerFiles.length,
    ),
    ...ownerFiles.flatMap((file) =>
      file.imports.flatMap((specifier) => {
        const resolved = specifier.startsWith("@/")
          ? specifier.slice(2)
          : specifier.startsWith(".")
            ? resolveRelative(file.absolutePath, specifier)
            : null;
        if (resolved === null) return [];
        if (!/^(app|features)\//.test(resolved)) return [];
        return [
          {
            code: "DESKTOP-DATA-LAYER-PURITY",
            file: file.path,
            detail: `imports ${specifier} (${resolved}) — data/ and platform/ never depend on app/ or features/`,
          },
        ];
      }),
    ),
  ];
}

export const architectureConfig: ArchitectureConfig = {
  root: sourceRoot,
  rules: [
    {
      code: "DESKTOP-TAURI-BOUNDARY",
      kind: "custom",
      check: checkTauriBoundary,
    },
    {
      code: "DESKTOP-FEATURE-BOUNDARIES",
      kind: "custom",
      check: checkFeatureBoundaries,
    },
    {
      code: "DESKTOP-DATA-LAYER-PURITY",
      kind: "custom",
      check: checkDataLayerPurity,
    },
  ],
};
