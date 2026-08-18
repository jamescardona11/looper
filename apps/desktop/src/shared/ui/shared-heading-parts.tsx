import type { ReactNode } from "react";

type SectionLabelProps = {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

type ScreenHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  titleAdornment?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

const HEADING_STYLES = {
  sectionText: [
    "shrink-0",
    "ui-text-body-lg-strong",
    "ui-color-secondary",
  ].join(" "),
  screenTitle: [
    "font-satoshi",
    "ui-text-screen-title",
    "ui-color-primary",
    "font-semibold",
    "tracking-[-0.035em]",
    "text-balance",
  ].join(" "),
  description: [
    "mt-1 max-w-2xl",
    "ui-text-body-sm ui-color-secondary",
    "leading-relaxed text-pretty",
  ].join(" "),
} as const;

function SectionHeadingAccessory({
  children,
  muted,
}: {
  children: ReactNode;
  muted: boolean;
}) {
  const tone = muted ? " ui-color-muted" : "";
  return (
    <span className={`flex shrink-0 items-center${tone}`}>{children}</span>
  );
}

function SectionHeadingText({ children }: { children: ReactNode }) {
  return <h2 className={HEADING_STYLES.sectionText}>{children}</h2>;
}

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
        <h2 className={HEADING_STYLES.screenTitle}>{title}</h2>
        {adornment ?? null}
      </div>
      {description ? (
        <p className={HEADING_STYLES.description}>{description}</p>
      ) : null}
    </div>
  );
}

function sectionAccessory(content: ReactNode, muted: boolean) {
  return content ? (
    <SectionHeadingAccessory muted={muted}>{content}</SectionHeadingAccessory>
  ) : null;
}

export function SectionLabel({
  icon,
  children,
  trailing,
  className = "",
}: SectionLabelProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {sectionAccessory(icon, true)}
      <SectionHeadingText>{children}</SectionHeadingText>
      {sectionAccessory(trailing, false)}
      <span aria-hidden="true" className="ui-divider-trailing flex-1" />
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
