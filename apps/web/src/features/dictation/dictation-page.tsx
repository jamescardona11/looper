import {
  type DictationSettingsDoc,
  useAuth,
  useDictationDictionary,
  useDictationReplacements,
  useDictationSettings,
  useDictationSnippets,
} from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { reportError } from "@/lib/errors";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";

interface DictationStyle {
  id: string;
  name: string;
  promptTemplate: string;
}

interface DictationSettingsData {
  styles?: {
    customTones?: DictationStyle[];
    selectedToneId?: string;
  };
  mode_rules?: ModeRule[];
  [key: string]: unknown;
}

type TransformPreset = "polish" | "literal" | "chat" | "email" | "prompt_better";
type ModeRuleTrigger =
  | { type: "bundle_id"; bundle_id: string }
  | { type: "url_pattern"; url_pattern: string };

interface ModeRule {
  id: string;
  enabled: boolean;
  trigger: ModeRuleTrigger;
  transform_preset: TransformPreset | null;
  auto_send_on_insert: boolean;
}

const triggerTypeOptions = [
  { value: "bundle_id", label: "App bundle ID" },
  { value: "url_pattern", label: "Website pattern" },
] as const;

const presetOptions = [
  { value: "__none__", label: "No preset" },
  { value: "polish", label: "Polish" },
  { value: "literal", label: "Literal" },
  { value: "chat", label: "Chat" },
  { value: "email", label: "Email" },
  { value: "prompt_better", label: "Prompt better" },
] as const;

function readSettingsData(doc: DictationSettingsDoc | null): DictationSettingsData {
  if (!doc?.data || typeof doc.data !== "object" || Array.isArray(doc.data)) {
    return {};
  }
  return doc.data as DictationSettingsData;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `style_${Date.now()}`;
}

function modeRuleTriggerValue(trigger: ModeRuleTrigger): string {
  return trigger.type === "bundle_id" ? trigger.bundle_id : trigger.url_pattern;
}

function modeRuleTrigger(type: ModeRuleTrigger["type"], value: string): ModeRuleTrigger {
  return type === "bundle_id"
    ? { type, bundle_id: value }
    : { type, url_pattern: value.toLowerCase() };
}

export function DictationPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();
  const settings = useDictationSettings();
  const settingsData = readSettingsData(settings.doc);
  const styles = settingsData.styles?.customTones ?? [];
  const selectedToneId = settingsData.styles?.selectedToneId ?? null;
  const modeRules = settingsData.mode_rules ?? [];

  const [term, setTerm] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [snippetTrigger, setSnippetTrigger] = useState("");
  const [snippetExpansion, setSnippetExpansion] = useState("");
  const [styleName, setStyleName] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [modeTriggerType, setModeTriggerType] = useState<ModeRuleTrigger["type"]>("bundle_id");
  const [modeTriggerValue, setModeTriggerValue] = useState("");
  const [modePreset, setModePreset] = useState<TransformPreset | "__none__">("polish");
  const [modeAutoSend, setModeAutoSend] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, task: () => Promise<void>) {
    if (!isAuthenticated) return;
    setPending(action);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(reportError(cause, t("dictation.saveFailed")));
    } finally {
      setPending(null);
    }
  }

  function saveSettings(nextStyles: DictationStyle[], nextSelectedToneId = selectedToneId) {
    return settings.update({
      ...settingsData,
      styles: {
        ...(settingsData.styles ?? {}),
        customTones: nextStyles,
        selectedToneId: nextSelectedToneId,
      },
    });
  }

  function saveModeRules(nextRules: ModeRule[]) {
    return settings.update({
      ...settingsData,
      mode_rules: nextRules,
    });
  }

  function addTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTerm = term.trim();
    if (!nextTerm) return;
    void run("dictionary.add", async () => {
      await dictionary.add(nextTerm);
      setTerm("");
    });
  }

  function addReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSource = source.trim();
    const nextDestination = destination.trim();
    if (!nextSource || !nextDestination) return;
    void run("replacement.add", async () => {
      await replacements.add(nextSource, nextDestination);
      setSource("");
      setDestination("");
    });
  }

  function addSnippet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTrigger = snippetTrigger.trim();
    const nextExpansion = snippetExpansion.trim();
    if (!nextTrigger || !nextExpansion) return;
    void run("snippet.add", async () => {
      await snippets.add(nextTrigger, nextExpansion);
      setSnippetTrigger("");
      setSnippetExpansion("");
    });
  }

  function addStyle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = styleName.trim();
    const nextPrompt = stylePrompt.trim();
    if (!nextName || !nextPrompt) return;
    const nextStyle = { id: newId(), name: nextName, promptTemplate: nextPrompt };
    void run("style.add", async () => {
      await saveSettings([...styles, nextStyle], selectedToneId ?? nextStyle.id);
      setStyleName("");
      setStylePrompt("");
    });
  }

  function removeStyle(id: string) {
    const nextStyles = styles.filter((style) => style.id !== id);
    const nextSelected = selectedToneId === id ? (nextStyles[0]?.id ?? null) : selectedToneId;
    void run(`style.remove.${id}`, async () => {
      await saveSettings(nextStyles, nextSelected);
    });
  }

  function selectStyle(id: string) {
    void run(`style.select.${id}`, async () => {
      await saveSettings(styles, id);
    });
  }

  function addModeRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValue = modeTriggerValue.trim();
    if (!nextValue) return;
    const nextRule: ModeRule = {
      id: newId(),
      enabled: true,
      trigger: modeRuleTrigger(modeTriggerType, nextValue),
      transform_preset: modePreset === "__none__" ? null : modePreset,
      auto_send_on_insert: modeAutoSend,
    };
    void run("modeRule.add", async () => {
      await saveModeRules([...modeRules, nextRule]);
      setModeTriggerValue("");
      setModePreset("polish");
      setModeAutoSend(false);
    });
  }

  function removeModeRule(id: string) {
    void run(`modeRule.remove.${id}`, async () => {
      await saveModeRules(modeRules.filter((rule) => rule.id !== id));
    });
  }

  return (
    <ProductPageLayout>
      <ProductPageHeader
        eyebrow={t("nav.studio")}
        title={t("web.studio.title")}
        description={t("web.studio.subtitle")}
      />

      {error ? (
        <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5">
        <div className="web-product-panel overflow-hidden rounded-xl">
          <section className="border-border border-b p-5">
            <div className="mb-5">
              <h2 className="font-medium text-lg tracking-tight">{t("dictation.dictionary")}</h2>
              <p className="mt-1 text-muted-foreground text-sm">{t("dictation.dictionaryHint")}</p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={addTerm}>
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("dictation.termPlaceholder")}
                aria-label={t("dictation.term")}
                disabled={!isAuthenticated}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!isAuthenticated || pending === "dictionary.add"}
                className="min-h-11 sm:min-h-10 sm:w-auto"
              >
                <IconPlus aria-hidden />
                {t("dictation.addTerm")}
              </Button>
            </form>

            <EntryList
              mutationsDisabled={!isAuthenticated}
              isLoading={dictionary.isLoading}
              emptyText={t("dictation.noTerms")}
              items={dictionary.entries.map((entry) => ({
                id: entry.id,
                title: entry.term,
                meta: new Date(entry.createdAt).toLocaleDateString(),
                removeLabel: t("dictation.removeTerm"),
                onRemove: () =>
                  void run(`dictionary.remove.${entry.id}`, () => dictionary.remove(entry.id)),
              }))}
            />
          </section>

          <section className="border-border border-b p-5">
            <div className="mb-5">
              <h2 className="font-medium text-lg tracking-tight">{t("dictation.replacements")}</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {t("dictation.replacementsHint")}
              </p>
            </div>

            <form
              className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              onSubmit={addReplacement}
            >
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder={t("dictation.sourcePlaceholder")}
                aria-label={t("dictation.source")}
                disabled={!isAuthenticated}
              />
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={t("dictation.destinationPlaceholder")}
                aria-label={t("dictation.destination")}
                disabled={!isAuthenticated}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!isAuthenticated || pending === "replacement.add"}
                className="min-h-11 sm:min-h-10 md:w-auto"
              >
                <IconPlus aria-hidden />
                {t("dictation.addReplacement")}
              </Button>
            </form>

            <EntryList
              mutationsDisabled={!isAuthenticated}
              isLoading={replacements.isLoading}
              emptyText={t("dictation.noReplacements")}
              items={replacements.rules.map((rule) => ({
                id: rule.id,
                title: rule.source,
                meta: rule.destination,
                removeLabel: t("dictation.removeReplacement"),
                onRemove: () =>
                  void run(`replacement.remove.${rule.id}`, () => replacements.remove(rule.id)),
              }))}
            />
          </section>

          <section className="p-5">
            <div className="mb-5">
              <h2 className="font-medium text-lg tracking-tight">{t("dictation.snippets")}</h2>
              <p className="mt-1 text-muted-foreground text-sm">{t("dictation.snippetsHint")}</p>
            </div>

            <form
              className="grid gap-3 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.5fr)_auto]"
              onSubmit={addSnippet}
            >
              <Input
                value={snippetTrigger}
                onChange={(event) => setSnippetTrigger(event.target.value)}
                placeholder={t("dictation.snippetTriggerPlaceholder")}
                aria-label={t("dictation.snippetTrigger")}
                disabled={!isAuthenticated}
              />
              <Input
                value={snippetExpansion}
                onChange={(event) => setSnippetExpansion(event.target.value)}
                placeholder={t("dictation.snippetExpansionPlaceholder")}
                aria-label={t("dictation.snippetExpansion")}
                disabled={!isAuthenticated}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!isAuthenticated || pending === "snippet.add"}
                className="min-h-11 sm:min-h-10 md:w-auto"
              >
                <IconPlus aria-hidden />
                {t("dictation.addSnippet")}
              </Button>
            </form>

            <EntryList
              mutationsDisabled={!isAuthenticated}
              isLoading={snippets.isLoading}
              emptyText={t("dictation.noSnippets")}
              items={snippets.snippets.map((snippet) => ({
                id: snippet.id,
                title: snippet.trigger,
                meta: snippet.expansion,
                removeLabel: t("dictation.removeSnippet"),
                onRemove: () =>
                  void run(`snippet.remove.${snippet.id}`, () => snippets.remove(snippet.id)),
              }))}
            />
          </section>
        </div>

        <section className="web-product-panel rounded-xl p-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-medium text-lg tracking-tight">{t("dictation.styles")}</h2>
              <p className="mt-1 text-muted-foreground text-sm">{t("dictation.stylesHint")}</p>
            </div>
            <p className="text-muted-foreground text-xs">
              {settings.isLoading
                ? t("common.loading")
                : t("dictation.settingsVersion", {
                    version: String(settings.doc?.version ?? 0),
                  })}
            </p>
          </div>

          <form className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]" onSubmit={addStyle}>
            <Input
              value={styleName}
              onChange={(event) => setStyleName(event.target.value)}
              placeholder={t("dictation.styleNamePlaceholder")}
              aria-label={t("dictation.styleName")}
              disabled={!isAuthenticated}
            />
            <Input
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
              placeholder={t("dictation.stylePromptPlaceholder")}
              aria-label={t("dictation.stylePrompt")}
              disabled={!isAuthenticated}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!isAuthenticated || pending === "style.add"}
              className="min-h-11 sm:min-h-10"
            >
              <IconPlus aria-hidden />
              {t("dictation.addStyle")}
            </Button>
          </form>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {styles.length === 0 ? (
              <p className="border-border border-t pt-3 text-muted-foreground text-xs md:col-span-2">
                {t("dictation.noStyles")}
              </p>
            ) : (
              styles.map((style) => (
                <article
                  key={style.id}
                  aria-label={`${style.name} ${style.promptTemplate}`}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-sm">{style.name}</h3>
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                        {style.promptTemplate}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="touch-target relative"
                      aria-label={`${t("dictation.removeStyle")}: ${style.name}`}
                      onClick={() => removeStyle(style.id)}
                      disabled={!isAuthenticated}
                    >
                      <IconTrash aria-hidden />
                    </Button>
                  </div>
                  <Button
                    variant={selectedToneId === style.id ? "secondary" : "outline"}
                    size="sm"
                    className="mt-4 min-h-11 sm:min-h-10"
                    onClick={() => selectStyle(style.id)}
                    aria-pressed={selectedToneId === style.id}
                    disabled={!isAuthenticated}
                  >
                    {selectedToneId === style.id
                      ? t("dictation.selectedStyle")
                      : t("dictation.selectStyle")}
                  </Button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="web-product-panel rounded-xl p-5">
          <div className="mb-5">
            <h2 className="font-medium text-lg tracking-tight">{t("dictation.smartModes")}</h2>
            <p className="mt-1 text-muted-foreground text-sm">{t("dictation.smartModesHint")}</p>
          </div>

          <form
            className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_180px_auto_auto]"
            onSubmit={addModeRule}
          >
            <Select
              value={modeTriggerType}
              onValueChange={setModeTriggerType}
              items={triggerTypeOptions}
              aria-label={t("dictation.smartModeTriggerType")}
              disabled={!isAuthenticated}
            />
            <Input
              value={modeTriggerValue}
              onChange={(event) => setModeTriggerValue(event.target.value)}
              placeholder={t("dictation.smartModeTriggerPlaceholder")}
              aria-label={t("dictation.smartModeTrigger")}
              disabled={!isAuthenticated}
            />
            <Select
              value={modePreset}
              onValueChange={(value) => setModePreset(value)}
              items={presetOptions}
              aria-label={t("dictation.smartModePreset")}
              disabled={!isAuthenticated}
            />
            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={modeAutoSend}
                onChange={(event) => setModeAutoSend(event.target.checked)}
                aria-label={t("dictation.smartModeAutoSend")}
                disabled={!isAuthenticated}
              />
              {t("dictation.smartModeAutoSend")}
            </label>
            <Button
              type="submit"
              variant="outline"
              disabled={!isAuthenticated || pending === "modeRule.add"}
              className="min-h-11 sm:min-h-10"
            >
              <IconPlus aria-hidden />
              {t("dictation.addSmartMode")}
            </Button>
          </form>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {modeRules.length === 0 ? (
              <p className="border-border border-t pt-3 text-muted-foreground text-xs md:col-span-2">
                {t("dictation.noSmartModes")}
              </p>
            ) : (
              modeRules.map((rule) => {
                const trigger = modeRuleTriggerValue(rule.trigger);
                const presetLabel =
                  presetOptions.find((option) => option.value === rule.transform_preset)?.label ??
                  t("dictation.smartModeNoPreset");
                return (
                  <article
                    key={rule.id}
                    aria-label={`${trigger} ${presetLabel}`}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-sm">{trigger}</h3>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {rule.trigger.type === "bundle_id"
                            ? t("dictation.smartModeBundleId")
                            : t("dictation.smartModeUrlPattern")}
                          {" · "}
                          {presetLabel}
                          {rule.auto_send_on_insert ? ` · ${t("dictation.smartModeAutoSend")}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="touch-target relative"
                        aria-label={`${t("dictation.removeSmartMode")}: ${trigger}`}
                        onClick={() => removeModeRule(rule.id)}
                        disabled={!isAuthenticated}
                      >
                        <IconTrash aria-hidden />
                      </Button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </ProductPageLayout>
  );
}

function EntryList({
  mutationsDisabled,
  isLoading,
  emptyText,
  items,
}: {
  mutationsDisabled: boolean;
  isLoading: boolean;
  emptyText: string;
  items: Array<{
    id: string;
    title: string;
    meta: string;
    removeLabel: string;
    onRemove: () => void;
  }>;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return <p className="mt-5 text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="mt-4 border-border border-t pt-3 text-muted-foreground text-xs">{emptyText}</p>
    );
  }

  return (
    <ul className="mt-5 divide-y divide-border rounded-lg border border-border bg-background">
      {items.map((item) => (
        <li
          key={item.id}
          aria-label={`${item.title} ${item.meta}`}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{item.title}</p>
            <p className="truncate text-muted-foreground text-xs">{item.meta}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="touch-target relative"
            aria-label={`${item.removeLabel}: ${item.title}`}
            onClick={item.onRemove}
            disabled={mutationsDisabled}
          >
            <IconTrash aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
