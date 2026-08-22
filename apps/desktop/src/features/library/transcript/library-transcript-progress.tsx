import { IntelligencePixel } from "../../../shared/ui/IntelligencePixel";

const PROGRESS_CLASS = [
  "flex flex-col h-full w-full",
  "items-center justify-center gap-5",
].join(" ");
const LABEL_CLASS = ["ui-text-label font-medium", "text-content-disabled"].join(
  " ",
);
const PIXEL_PROPS = { active: true, size: "md" as const };

export function TranscriptProgress({ label }: { label: string }) {
  return (
    <div className={PROGRESS_CLASS}>
      <IntelligencePixel {...PIXEL_PROPS} />
      <div className={LABEL_CLASS}>{label}</div>
    </div>
  );
}
