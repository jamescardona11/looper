import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";

type HomeAskBarProps = {
  onAsk: (query: string) => void;
};

/**
 * Composer "Ask Memory" al pie de la home (patrón Otter): una pregunta en
 * lenguaje natural salta a Memory con la búsqueda ya hecha.
 */
export default function HomeAskBar({ onAsk }: HomeAskBarProps) {
  const { t } = useLingui();
  const [value, setValue] = useState("");

  const submit = () => {
    const query = value.trim();
    if (!query) return;
    onAsk(query);
    setValue("");
  };

  return (
    <form
      data-ui-dock="home-memory"
      className="sticky bottom-0 z-20 mt-3 flex shrink-0 items-center gap-2.5 rounded-full border border-border-primary bg-surface-surface py-1.5 pr-2 pl-4 shadow-md"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Sparkle
        size={15}
        className="shrink-0 text-content-disabled"
        aria-hidden="true"
      />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t({
          id: "home.ask.placeholder",
          message: "Ask Memory anything — “what did we decide about pricing?”",
        })}
        aria-label={t({ id: "home.ask.aria", message: "Ask Memory" })}
        className="min-w-0 flex-1 bg-transparent ui-text-body-sm ui-color-primary outline-none placeholder:text-content-disabled"
      />
      <button
        type="submit"
        aria-label={t({ id: "home.ask.submit", message: "Search Memory" })}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-hover motion-reduce:transition-none"
      >
        <ArrowUp size={13} aria-hidden="true" />
      </button>
    </form>
  );
}
