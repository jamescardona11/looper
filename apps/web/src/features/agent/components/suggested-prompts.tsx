// Tappable prompt chips shown under the latest assistant reply. Picking one
// sends it as the next message (same path as the empty-state prompt chips).
interface SuggestedPromptsProps {
  suggestions: string[];
  disabled?: boolean;
  onPick: (text: string) => void;
}

export function SuggestedPrompts({ suggestions, disabled, onPick }: SuggestedPromptsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-6 pb-4">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
