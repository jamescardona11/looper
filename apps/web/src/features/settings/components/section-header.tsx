import { Eyebrow } from "@/shared/components/eyebrow";

export function SectionHeader({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start gap-4 border-border border-b pb-4 md:mb-6 md:pb-6">
      {icon ? (
        <span className="hidden size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary md:grid [&_svg]:size-5">
          {icon}
        </span>
      ) : null}
      <div>
        <Eyebrow className="hidden text-muted-foreground md:block">{title}</Eyebrow>
        <h2 className="font-display font-semibold text-lg tracking-tight md:mt-2 md:text-2xl">
          {title}
        </h2>
        {hint ? <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{hint}</p> : null}
      </div>
    </header>
  );
}
