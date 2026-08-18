import { useLingui } from "@lingui/react/macro";
import { X } from "@phosphor-icons/react";
import type { ImportFileProbe } from "../../../data/library";
import { formatBytes, formatDuration } from "./library-utils";

type ProbeIndex = Record<string, ImportFileProbe>;

export const importFileName = (path: string): string =>
  path.split(/[\\/]/).pop() ?? path;

export const importFileMetadata = (
  path: string,
  probes: ProbeIndex,
): string => {
  const probe = probes[path];
  if (!probe) return "";
  const duration =
    probe.duration_ms == null ? null : formatDuration(probe.duration_ms / 1000);
  const size = probe.size_bytes == null ? null : formatBytes(probe.size_bytes);
  return [duration, size].filter(Boolean).join(" · ");
};

type ImportFileListProps = {
  paths: string[];
  probes: ProbeIndex;
  shiftHeld: boolean;
  onRemove: (index: number) => void;
};

const removeClass = (shiftHeld: boolean) =>
  [
    "flex h-5 w-5 shrink-0 items-center justify-center rounded",
    "text-content-disabled transition-all hover:bg-surface-elevated",
    "hover:text-content-primary focus-visible:opacity-100 group-hover:opacity-100",
    shiftHeld ? "opacity-100" : "opacity-0",
  ].join(" ");

const ImportFileRow = ({
  path,
  index,
  probes,
  shiftHeld,
  onRemove,
}: ImportFileListProps & { path: string; index: number }) => {
  const { t } = useLingui();
  const name = importFileName(path);
  return (
    <div title={path} className="group flex items-center gap-2 py-0.5">
      <span className="min-w-0 flex-1 truncate ui-text-body-sm text-content-secondary">
        {name}
      </span>
      <span className="shrink-0 ui-text-meta text-content-disabled">
        {importFileMetadata(path, probes)}
      </span>
      <button
        onClick={() => onRemove(index)}
        aria-label={t({
          id: "library.import.remove_file",
          message: `Remove ${name}`,
        })}
        className={removeClass(shiftHeld)}
      >
        <X size={11} aria-hidden="true" />
      </button>
    </div>
  );
};

export const ImportFileList = (props: ImportFileListProps) => {
  const { t } = useLingui();
  return (
    <div className="max-h-24 overflow-y-auto custom-scrollbar">
      {props.paths.map((path, index) => (
        <ImportFileRow
          {...props}
          key={`${path}-${index}`}
          path={path}
          index={index}
        />
      ))}
      {props.paths.length === 0 && (
        <p className="py-0.5 ui-text-body-sm text-content-disabled">
          {t({
            id: "library.import.no_files",
            message: "No recordings selected",
          })}
        </p>
      )}
    </div>
  );
};
