import type { ReactNode } from "react";

type ScreenHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  titleAdornment?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

const SCREEN_TITLE = [
  "font-satoshi",
  "ui-text-screen-title",
  "ui-color-primary",
  "font-semibold",
  "tracking-[-0.035em]",
  "text-balance",
].join(" ");

const SCREEN_DESCRIPTION = [
  "mt-1 max-w-2xl",
  "ui-text-body-sm ui-color-secondary",
  "leading-relaxed text-pretty",
].join(" ");

function ScreenHeadingCopy({
  title,
  description,
  adornment,
}: {
  title: ReactNode;
  description?: ReactNode;
  adornment?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className={SCREEN_TITLE}>{title}</h2>
        {adornment ?? null}
      </div>
      {description ? <p className={SCREEN_DESCRIPTION}>{description}</p> : null}
    </div>
  );
}

export function ScreenHeader({
  icon,
  title,
  description,
  titleAdornment,
  trailing,
  className = "",
}: ScreenHeaderProps) {
  return (
    <header className={`border-b border-border-primary pb-5 ${className}`}>
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-accent-10 ui-color-accent [&_svg]:size-4">
          {icon}
        </div>
        <ScreenHeadingCopy
          title={title}
          description={description}
          adornment={titleAdornment}
        />
        {trailing ? <div className="self-center">{trailing}</div> : null}
      </div>
    </header>
  );
}

export default ScreenHeader;
