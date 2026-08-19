import type { ReactNode } from "react";

type SectionLabelProps = {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

const SECTION_TEXT = [
  "shrink-0",
  "ui-text-body-lg-strong",
  "ui-color-secondary",
].join(" ");

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
  return <h2 className={SECTION_TEXT}>{children}</h2>;
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

export default SectionLabel;
