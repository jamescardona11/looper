import { convertFileSrc } from "@tauri-apps/api/core";
import { getInitials, getWebsiteFallback } from "./personalization-utils";

const iconSize = {
  chip: ["h-[18px]", "w-[18px]"].join(" "),
  list: ["h-4", "w-4"].join(" "),
};
const defaultFallbackTextClass = ["text", "[9px]"].join("-");

export const AppIconBadge = ({
  appName: label,
  iconPath: source,
  fallbackTextClass = defaultFallbackTextClass,
}: {
  appName: string;
  iconPath?: string | null;
  fallbackTextClass?: string;
}) => {
  const iconUrl = source ? convertFileSrc(source) : null;
  const base = [
    iconSize.chip,
    "shrink-0 flex items-center justify-center",
  ].join(" ");
  if (iconUrl) {
    return (
      <span className={`${base} overflow-visible`} aria-hidden="true">
        <img
          {...{ src: iconUrl, alt: "", loading: "lazy" }}
          className={["h-full w-full", "object-contain scale-[1.18]"].join(" ")}
        />
      </span>
    );
  }
  return (
    <span
      className={[
        base,
        "rounded-md border border-border-secondary",
        "bg-surface-overlay ui-color-secondary",
      ].join(" ")}
      aria-hidden="true"
    >
      <span
        className={[fallbackTextClass, "leading-none", "font-semibold"].join(
          " ",
        )}
      >
        {getInitials(label)}
      </span>
    </span>
  );
};

export const WebsiteFavicon = ({
  site: hostname,
  iconPath: source,
  size: scale = "chip",
  fallbackTextClass = defaultFallbackTextClass,
}: {
  site: string;
  iconPath?: string | null;
  size?: "chip" | "list";
  fallbackTextClass?: string;
}) => {
  const dimensions = iconSize[scale];
  if (!source) {
    return (
      <span
        className={[
          dimensions,
          "shrink-0 rounded-xs border border-border-secondary",
          "bg-surface-overlay flex items-center justify-center",
          "ui-color-secondary",
          fallbackTextClass,
        ].join(" ")}
        aria-hidden="true"
      >
        {getWebsiteFallback(hostname)}
      </span>
    );
  }
  return (
    <img
      {...{
        src: convertFileSrc(source),
        alt: "",
        loading: "lazy",
        "aria-hidden": "true",
      }}
      className={`${dimensions} shrink-0 rounded-xs`}
    />
  );
};
