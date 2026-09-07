import { PRODUCT_ACCESS_IS_FREE, TIERS } from "@looper/config/billing";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowRight, IconCheck, IconMenu2, IconX } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { includedMarketingFeatures } from "@/features/billing";
import { LooperMark } from "@/shared/components/looper-mark";
import { PageSurface } from "@/shared/components/page-surface";
import { buttonVariants } from "@/shared/components/ui/button";

// The marketing surface shares the paper workspace direction with the product
// while reusing its semantic tokens, typography, controls, and radius scale.
export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <GrainOverlay />
      <Nav />
      <PageSurface>
        <HeroSection />
        <StackStrip />
        <ReasonsSection />
        <ProofSection />
        <ComparisonSection />
        {!PRODUCT_ACCESS_IS_FREE ? <PricingSection /> : null}
        <LandingFAQSection />
        <FinalCTA />
      </PageSurface>
      <FooterSection />
    </div>
  );
}

// ── Shared marketing primitives ───────────────────────────────────────────────

/** Uppercase catalog label that precedes every section heading (the .label of
 *  the sales landing, translated to tokens: condensed, wide-tracked, tenuous). */
function Eyebrow({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`font-display font-semibold text-[0.7rem] uppercase leading-none tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

/** The three window dots used on every chrome (terminal, screenshots, file-tree). */
function WindowDots() {
  return (
    <span className="flex gap-1.5" aria-hidden="true">
      <span className="size-2.5 rounded-full bg-muted-foreground/30" />
      <span className="size-2.5 rounded-full bg-muted-foreground/30" />
      <span className="size-2.5 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

/** A bordered "window" frame: header strip (dots + label) over a body. The sales
 *  landing wraps every screenshot, terminal, and file-tree in this chrome. */
function Window({
  label,
  meta,
  children,
  className = "",
}: {
  label: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="flex items-center justify-between border-border border-b px-4 py-2.5">
        <div className="flex items-center gap-3">
          <WindowDots />
          <Eyebrow className="text-muted-foreground">{label}</Eyebrow>
        </div>
        {meta ? <span className="font-mono text-primary text-xs">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Paper-grain overlay (sales landing body::before). Scoped to the landing
 *  marketing subtree, not global, so the in-app surfaces stay clean. Data-URI
 *  SVG noise, no color literal, so it passes j11/no-color-literal. */
function GrainOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] opacity-[0.025]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }}
    />
  );
}

const PRIMARY_CTA = "h-11 rounded-lg px-6 text-sm transition-colors hover:bg-primary/90";
const SECONDARY_CTA =
  "h-11 rounded-lg border-border px-6 text-sm transition-colors hover:border-primary hover:bg-primary/[0.06]";

// ── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  const NAV_LINKS = [
    { label: t("landing.nav.features"), href: "#features" },
  ];

  return (
    <header className="sticky top-0 z-50 border-border/60 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex min-h-11 items-center gap-2.5 sm:min-h-10">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <LooperMark className="size-3.5" />
          </span>
          <Eyebrow className="text-foreground">Looper</Eyebrow>
        </a>
        <nav className="hidden items-center gap-7 text-muted-foreground text-sm md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-primary">
              {l.label}
            </a>
          ))}
          <Link
            to="/sign-in"
            className="flex items-center gap-1.5 transition-colors hover:text-primary"
          >
            {t("landing.getStarted")}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            to="/sign-in"
            className="hidden text-muted-foreground text-sm transition-colors hover:text-primary sm:inline"
          >
            {t("auth.signIn")}
          </Link>
          <Link
            to="/sign-in"
            className={buttonVariants({
              variant: "primary",
              size: "sm",
              className: "min-h-11 rounded-lg sm:min-h-10",
            })}
          >
            {t("landing.getStarted")}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
            aria-expanded={menuOpen}
            className="touch-target relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
          >
            {menuOpen ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen ? (
        <nav className="flex flex-col gap-1 border-border/60 border-t px-6 py-3 text-sm md:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={close}
              className="flex min-h-11 items-center rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/sign-in"
            onClick={close}
            className="flex min-h-11 items-center rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("landing.getStarted")}
          </Link>
          <Link
            to="/sign-in"
            onClick={close}
            className="flex min-h-11 items-center rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("auth.signIn")}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

// ── Hero (asymmetric 7/5: copy left, live workspace right) ────────────────────

function HeroSection() {
  const { t } = useTranslation();
  return (
    <section id="top" className="border-border/60 border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pt-16 pb-20 sm:pt-20 sm:pb-24 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Eyebrow className="text-muted-foreground">{t("landing.hero.eyebrow")}</Eyebrow>
          <h1 className="mt-7 font-bold font-display text-[clamp(3rem,2.35rem+3vw,4.8rem)] text-foreground leading-[0.95] tracking-tighter">
            {t("landing.hero.headline")}{" "}
            <span className="text-primary">{t("landing.hero.headlineAccent")}</span>
          </h1>
          <p className="mt-7 max-w-prose text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
            {t("landing.hero.subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/sign-in"
              className={buttonVariants({ variant: "primary", className: PRIMARY_CTA })}
            >
              {t("landing.getStarted")}
              <IconArrowRight className="size-4" />
            </Link>
            <Link
              to="/sign-in"
              className={buttonVariants({ variant: "outline", className: SECONDARY_CTA })}
            >
              {t("landing.getStarted")}
            </Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
            {[
              t("landing.hero.guarantee1"),
              t("landing.hero.guarantee2"),
              t("landing.hero.guarantee3"),
            ].map((g) => (
              <li key={g} className="flex items-center gap-2">
                <span className="text-primary">·</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Stack strip ─────────────────────────────────────────────────────────────

const STACK = ["OpenAI", "Anthropic", "Google", "GPT-4o", "Claude", "Gemini", "Mistral", "Llama"];

function StackStrip() {
  const { t } = useTranslation();
  return (
    <section className="border-border/60 border-b px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Eyebrow className="block text-center text-muted-foreground">
          {t("landing.stack.label")}
        </Eyebrow>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {STACK.map((name) => (
            <span key={name} className="font-medium text-muted-foreground text-sm">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── The reasons (typography-driven, numbered, no icon tiles) ──────────────────

function ReasonsSection() {
  const { t } = useTranslation();

  const REASONS = [
    {
      n: "01",
      title: t("landing.platform.headline"),
      body: t("landing.platform.subtitle"),
      aside: ["web", "mobile", "desktop"],
      asideAccent: t("landing.platform.desktopTitle"),
    },
    {
      n: "02",
      title: t("landing.features.headline"),
      body: t("landing.features.subtitle"),
      aside: ["dictation · styles", "files · live transcription", "meetings · memory"],
      asideAccent: t("landing.feature.aiChatTitle"),
    },
    {
      n: "03",
      title: t("landing.feature.byokTitle"),
      body: t("landing.feature.byokDesc"),
      aside: ["OpenAI", "Anthropic", "Google"],
      asideAccent: t("landing.included.byokTitle"),
    },
  ];

  return (
    <section id="features" className="border-border/60 border-b px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <Eyebrow className="text-muted-foreground">{t("landing.reasons.eyebrow")}</Eyebrow>
        <div className="mt-12 space-y-16">
          {REASONS.map((r) => (
            <article key={r.n} className="grid items-start gap-6 md:grid-cols-12">
              <div className="md:col-span-2">
                <span className="block font-bold font-display text-6xl text-primary tabular-nums leading-none tracking-tighter md:text-7xl">
                  {r.n}
                </span>
              </div>
              <div className="md:col-span-7">
                <h3 className="mb-5 font-display font-semibold text-2xl text-foreground tracking-tight md:text-3xl">
                  {r.title}
                </h3>
                <p className="max-w-prose text-muted-foreground leading-relaxed">{r.body}</p>
              </div>
              <div className="hidden pt-2 font-mono text-muted-foreground text-xs leading-6 md:col-span-3 md:block">
                {r.aside.map((a) => (
                  <div key={a}>{a}</div>
                ))}
                <div className="mt-2 text-primary">→ {r.asideAccent}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── What you actually get (stats + file-tree, the showroom of real infra) ──────

function ProofSection() {
  const { t } = useTranslation();

  const STATS = [
    ["7", t("landing.proof.stat1Label")],
    ["3", t("landing.proof.stat2Label")],
    ["3", t("landing.proof.stat3Label")],
    ["BYOK", t("landing.proof.stat4Label")],
  ] as const;

  return (
    <section className="border-border/60 border-b px-6 py-28">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <Eyebrow className="text-muted-foreground">{t("landing.proof.eyebrow")}</Eyebrow>
          <h2 className="mt-6 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.proof.headline")}
          </h2>
          <p className="mt-6 max-w-prose text-muted-foreground leading-relaxed">
            {t("landing.proof.subtitle")}
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-4 gap-y-6">
            {STATS.map(([stat, label], i) => (
              <div key={label}>
                <dt>
                  <Eyebrow className="text-muted-foreground">{label}</Eyebrow>
                </dt>
                <dd
                  className={`mt-1.5 font-bold font-display text-3xl tabular-nums tracking-tight ${
                    i === STATS.length - 1 ? "text-primary" : "text-foreground"
                  }`}
                >
                  {stat}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <Window label={t("landing.proof.treeLabel")} meta="apps + backend">
            <pre className="overflow-x-auto p-5 font-mono text-foreground text-xs leading-6">
              {"looper/\n"}
              {"├── "}
              <span className="text-primary">apps/</span>
              {"\n"}
              {"│   ├── web/        "}
              <span className="text-muted-foreground">vite · react · tanstack router</span>
              {"\n"}
              {"│   ├── mobile/     "}
              <span className="text-muted-foreground">expo · react native · ios · android</span>
              {"\n"}
              {"│   └── desktop/    "}
              <span className="text-muted-foreground">tauri 2 · rust</span>
              {"\n"}
              {"├── "}
              <span className="text-primary">backend/</span>
              {"        "}
              <span className="text-muted-foreground">convex · reactive queries + auth</span>
              {"\n"}
              {"│   └── ai/         "}
              <span className="text-muted-foreground">
                dictation · transcription · meetings · recording assistant
              </span>
              {"\n"}
              {"├── "}
              <span className="text-primary">packages/</span>
              {"\n"}
              {"│   ├── theme/      "}
              <span className="text-muted-foreground">semantic tokens · light</span>
              {"\n"}
              {"│   └── i18n/       "}
              <span className="text-muted-foreground">en + es, parity-checked</span>
              {"\n"}
              {"├── billing/       "}
              <span className="text-muted-foreground">stripe · polar · revenuecat</span>
              {"\n"}
              {"└── ...\n"}
            </pre>
          </Window>
        </div>
      </div>
    </section>
  );
}

// ── Comparison (dot-matrix ledger, our column uses the primary signal) ─────────

function ComparisonSection() {
  const { t } = useTranslation();

  // Columns: us first (tinted), then the fragmented alternatives. Rows are
  // capabilities. A dot means present, an en-dash absent. Honest: we only claim
  // what the product ships (every row maps to a real surface in the repo).
  const cols = [
    t("landing.cmp.colUs"),
    t("landing.cmp.colSeparate"),
    t("landing.cmp.colChatbot"),
    t("landing.cmp.colImage"),
  ];
  const rows: { label: string; values: boolean[] }[] = [
    { label: t("landing.cmp.rowChat"), values: [true, true, true, false] },
    { label: t("landing.cmp.rowImages"), values: [true, true, false, true] },
    { label: t("landing.cmp.rowVoice"), values: [true, true, false, false] },
    { label: t("landing.cmp.rowDocs"), values: [true, false, false, false] },
    { label: t("landing.cmp.rowHistory"), values: [true, false, false, false] },
    { label: t("landing.cmp.rowKey"), values: [true, false, false, false] },
    { label: t("landing.cmp.rowPlatforms"), values: [true, false, false, false] },
  ];
  const mobileGroups = [
    {
      label: t("landing.comparison.withLabel"),
      items: [
        t("landing.comparison.with1"),
        t("landing.comparison.with2"),
        t("landing.comparison.with3"),
        t("landing.comparison.with4"),
      ],
      positive: true,
    },
    {
      label: t("landing.comparison.withoutLabel"),
      items: [
        t("landing.comparison.without1"),
        t("landing.comparison.without2"),
        t("landing.comparison.without3"),
        t("landing.comparison.without4"),
      ],
      positive: false,
    },
  ];

  return (
    <section className="border-border/60 border-b px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12">
          <Eyebrow className="text-muted-foreground">{t("landing.comparison.eyebrow")}</Eyebrow>
          <h2 className="mt-4 max-w-2xl font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.comparison.headline")}
          </h2>
        </div>

        <div data-testid="mobile-comparison" className="space-y-3 md:hidden">
          {mobileGroups.map(({ label, items, positive }) => (
            <section
              key={label}
              className={`rounded-xl border p-5 ${
                positive ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-card"
              }`}
            >
              <Eyebrow className={positive ? "text-primary" : "text-muted-foreground"}>
                {label}
              </Eyebrow>
              <ul className="mt-5 space-y-4">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                        positive
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {positive ? (
                        <IconCheck className="size-3" aria-hidden />
                      ) : (
                        <IconX className="size-3" aria-hidden />
                      )}
                    </span>
                    <span className={positive ? "text-foreground" : "text-muted-foreground"}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div data-testid="desktop-comparison" className="hidden md:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="w-[34%] py-4 pr-4 text-left font-normal">
                  <Eyebrow className="text-muted-foreground">
                    {t("landing.comparison.capLabel")}
                  </Eyebrow>
                </th>
                {cols.map((c, i) => (
                  <th
                    key={c}
                    className={`px-3 py-4 text-center font-medium ${
                      i === 0 ? "bg-primary/[0.07] text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-border/60 border-b">
                  <td className="py-2.5 pr-4 text-foreground">{row.label}</td>
                  {cols.map((column, columnIndex) => {
                    const isUs = columnIndex === 0;
                    const isAvailable = row.values[columnIndex] ?? false;
                    return (
                      <td
                        key={column}
                        className={`px-3 py-2.5 text-center ${isUs ? "bg-primary/[0.07]" : ""}`}
                      >
                        {isAvailable ? (
                          <>
                            <span
                              aria-hidden="true"
                              className={`text-base leading-none ${
                                isUs ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              ●
                            </span>
                            <span className="sr-only">{t("landing.cmp.yes")}</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-muted-foreground/50">
                              –
                            </span>
                            <span className="sr-only">{t("landing.cmp.no")}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 max-w-2xl text-muted-foreground text-sm">
          {t("landing.comparison.note")}
        </p>
      </div>
    </section>
  );
}

// ── Pricing (dot-matrix ledger of real tiers, no "recommended" badge) ─────────

function PricingSection() {
  const { t } = useTranslation();
  const [selectedTier, setSelectedTier] = useState<(typeof TIERS)[number]["tier"]>("pro");

  // Tiers become columns; the union of every tier's marketingFeatures becomes
  // the rows. A dot marks inclusion. The middle tier (Pro) is highlighted with a
  // Primary tint band + eyebrow, never a badge or ring (DESIGN.md forbids it).
  const highlightTier = "pro";
  const featureRows: { key: string; label: string }[] = [];
  for (const tier of TIERS) {
    for (const key of includedMarketingFeatures(tier.tier, TIERS)) {
      if (!featureRows.some((r) => r.key === key)) {
        featureRows.push({ key, label: t(key) });
      }
    }
  }
  const selectedPlan = TIERS.find((tier) => tier.tier === selectedTier) ?? TIERS[1]!;
  const selectedFeatures = includedMarketingFeatures(selectedPlan.tier, TIERS);

  return (
    <section id="pricing" className="border-border/60 border-b px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14">
          <Eyebrow className="text-muted-foreground">{t("landing.pricing.eyebrow")}</Eyebrow>
          <h2 className="mt-4 max-w-3xl font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.pricing.headline")}
          </h2>
          <p className="mt-5 text-muted-foreground">{t("landing.pricing.subtitle")}</p>
        </div>

        <div data-testid="landing-mobile-pricing" className="md:hidden">
          <fieldset className="grid grid-cols-3 border border-border">
            <legend className="sr-only">{t("billing.plans")}</legend>
            {TIERS.map((tier) => {
              const selected = tier.tier === selectedTier;
              return (
                <button
                  key={tier.tier}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedTier(tier.tier)}
                  className={`min-w-0 border-border border-r px-2 py-3 font-display font-semibold text-xs uppercase tracking-[0.12em] transition-colors last:border-r-0 ${
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tier.name}
                </button>
              );
            })}
          </fieldset>

          <article
            aria-label={selectedPlan.name}
            className={`border border-t-0 p-5 ${
              selectedPlan.tier === highlightTier
                ? "border-primary/60 bg-primary/[0.07]"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow
                  className={
                    selectedPlan.tier === highlightTier ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {selectedPlan.name}
                </Eyebrow>
                <p className="mt-2 max-w-[16rem] text-muted-foreground text-sm leading-6">
                  {t(`billing.planHint.${selectedPlan.tier}`)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-bold font-display text-4xl tabular-nums tracking-tight">
                  ${selectedPlan.displayPriceUsd}
                </span>
                <span className="block text-muted-foreground text-xs">{t("billing.perMonth")}</span>
              </div>
            </div>

            <ul className="mt-6 space-y-3">
              {selectedFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{t(feature)}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/sign-in"
              className={buttonVariants({
                variant: selectedPlan.tier === highlightTier ? "primary" : "outline",
                className: "mt-7 w-full rounded-none",
              })}
            >
              {t("landing.getStarted")}
              <IconArrowRight className="size-4" aria-hidden />
            </Link>
          </article>
        </div>

        <div
          data-testid="landing-desktop-pricing"
          className="hidden max-w-full overflow-x-auto md:block"
        >
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-border border-b align-bottom">
                <th className="w-[40%] py-5 pr-4 text-left font-normal">
                  <Eyebrow className="text-muted-foreground">
                    {t("landing.pricing.featuresLabel")}
                  </Eyebrow>
                </th>
                {TIERS.map((tier) => {
                  const isHi = tier.tier === highlightTier;
                  return (
                    <th
                      key={tier.tier}
                      className={`px-5 py-5 text-left align-bottom ${isHi ? "bg-primary/[0.07]" : ""}`}
                    >
                      <Eyebrow className={isHi ? "text-primary" : "text-muted-foreground"}>
                        {tier.name}
                      </Eyebrow>
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-bold font-display text-4xl text-foreground tabular-nums tracking-tight">
                          ${tier.displayPriceUsd}
                        </span>
                        <span className="font-normal text-muted-foreground text-sm">
                          {t("billing.perMonth")}
                        </span>
                      </div>
                      <p className="mt-1 font-normal text-muted-foreground text-xs">
                        {tier.description}
                      </p>
                      <Link
                        to="/sign-in"
                        className={buttonVariants({
                          variant: isHi ? "primary" : "outline",
                          size: "sm",
                          className: `mt-4 w-full rounded-none transition-all ${
                            isHi
                              ? "hover:shadow-[0_0_0_6px] hover:shadow-primary/25"
                              : "hover:border-primary hover:bg-primary/[0.06]"
                          }`,
                        })}
                      >
                        {t("landing.getStarted")}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row) => (
                <tr key={row.key} className="border-border/60 border-b">
                  <td className="py-2.5 pr-4 text-foreground text-sm">{row.label}</td>
                  {TIERS.map((tier) => {
                    const isHi = tier.tier === highlightTier;
                    const included = includedMarketingFeatures(tier.tier, TIERS).includes(row.key);
                    return (
                      <td
                        key={tier.tier}
                        className={`px-5 py-2.5 text-center ${isHi ? "bg-primary/[0.07]" : ""}`}
                      >
                        {included ? (
                          <>
                            <span
                              aria-hidden="true"
                              className={`text-base leading-none ${
                                isHi ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              ●
                            </span>
                            <span className="sr-only">{t("landing.cmp.yes")}</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-muted-foreground/50">
                              –
                            </span>
                            <span className="sr-only">{t("landing.cmp.no")}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-2xl rounded-none border border-primary/40 bg-primary/[0.07] px-4 py-3 text-muted-foreground text-sm leading-6">
          <Eyebrow className="mr-2 text-primary">{t("landing.pricing.eyebrow")}</Eyebrow>
          {t("landing.pricing.note")}
        </p>
      </div>
    </section>
  );
}

// ── Landing FAQ (divide-y list, 4/8, primary "+" rotates 45° on open) ─────────

function LandingFAQSection() {
  const { t } = useTranslation();

  const LANDING_FAQ_ITEMS = [
    { question: t("landing.faq.q1"), answer: t("landing.faq.a1") },
    { question: t("landing.faq.q2"), answer: t("landing.faq.a2") },
    { question: t("landing.faq.q3"), answer: t("landing.faq.a3") },
    { question: t("landing.faq.q4"), answer: t("landing.faq.a4") },
    { question: t("landing.faq.q5"), answer: t("landing.faq.a5") },
    { question: t("landing.faq.q6"), answer: t("landing.faq.a6") },
  ];

  const landingFaqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section className="border-border/60 border-b px-6 py-28">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data for SEO
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingFaqSchema) }}
      />
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Eyebrow className="text-muted-foreground">{t("landing.nav.features")}</Eyebrow>
          <h2 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.faq.headline")}
          </h2>
        </div>

        <div className="divide-y divide-border lg:col-span-8">
          {LANDING_FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6">
                <span className="font-medium text-foreground transition-colors group-open:text-primary">
                  {item.question}
                </span>
                <span className="mt-0.5 font-mono text-lg text-primary leading-none transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 max-w-prose text-muted-foreground text-sm leading-relaxed">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA (no gradient, eyebrow + kit buttons) ───────────────────────────

function FinalCTA() {
  const { t } = useTranslation();
  return (
    <section className="border-border/60 border-b px-6 py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-12">
        <div className="md:col-span-7">
          <Eyebrow className="text-muted-foreground">{t("landing.cta.eyebrow")}</Eyebrow>
          <h2 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.cta.headline")}
          </h2>
          <p className="mt-5 max-w-prose text-muted-foreground">{t("landing.cta.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-4 md:col-span-5 md:justify-end">
          <Link
            to="/sign-in"
            className={buttonVariants({ variant: "primary", className: PRIMARY_CTA })}
          >
            {t("landing.getStarted")}
            <IconArrowRight className="size-4" />
          </Link>
          <Link
            to="/sign-in"
            className={buttonVariants({ variant: "outline", className: SECONDARY_CTA })}
          >
            {t("landing.getStarted")}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer (multi-column with dot-status roadmap) ─────────────────────────────

function FooterSection() {
  const { t } = useTranslation();
  return (
    <footer>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-16 md:grid-cols-12">
        <div className="col-span-2 md:col-span-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <LooperMark className="size-3.5" />
            </span>
            <Eyebrow className="text-foreground">Looper</Eyebrow>
          </div>
          <p className="max-w-md text-muted-foreground text-sm leading-relaxed">
            {t("landing.footer.pitch")}
          </p>
        </div>

        <div className="md:col-span-2">
          <Eyebrow className="text-muted-foreground">{t("landing.footer.productLabel")}</Eyebrow>
          <ul className="mt-4 space-y-2 text-muted-foreground text-sm">
            <li>
              <a href="#features" className="transition-colors hover:text-primary">
                {t("landing.nav.features")}
              </a>
            </li>
            <li>
              <Link to="/changelog" className="transition-colors hover:text-primary">
                {t("landing.footer.changelog")}
              </Link>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <Eyebrow className="text-muted-foreground">{t("landing.footer.roadmapLabel")}</Eyebrow>
          <ul className="mt-4 space-y-2 text-muted-foreground text-sm">
            <li>
              <span className="text-primary">●</span> looper-web
            </li>
            <li>
              <span className="text-primary">●</span> looper-mobile
            </li>
            <li>
              <span className="text-primary">●</span> looper-desktop
            </li>
            <li>
              <Link to="/roadmap" className="transition-colors hover:text-primary">
                {t("landing.footer.roadmap")}
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-2 md:col-span-3">
          <Eyebrow className="text-muted-foreground">{t("landing.footer.legalLabel")}</Eyebrow>
          <ul className="mt-4 space-y-2 text-muted-foreground text-sm">
            <li>{t("landing.footer.trust1")}</li>
            <li>{t("landing.footer.trust2")}</li>
            <li>{t("landing.footer.trust3")}</li>
            <li className="flex gap-x-4 pt-1">
              <Link to="/privacy" className="transition-colors hover:text-primary">
                {t("legal.privacy")}
              </Link>
              <Link to="/terms" className="transition-colors hover:text-primary">
                {t("legal.terms")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-border/60 border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 font-mono text-muted-foreground text-xs">
          <span>{t("landing.footer.copyright")}</span>
          <span>{t("landing.footer.tagline")}</span>
        </div>
      </div>
    </footer>
  );
}
