import type { WebsiteIcon } from "../../../data/personalization";

const ORIGIN_PREFIXES = [/^https?:\/\//, /^www\./];

export function normalizeWebsite(value: string) {
  let hostname = value.trim().toLowerCase();
  if (!hostname) return "";

  for (const prefix of ORIGIN_PREFIXES) hostname = hostname.replace(prefix, "");
  return hostname.split("/", 1)[0];
}

export function formatWebsitePreview(value: string) {
  const label = value.trim();
  const separator = label.indexOf("./");
  return separator === -1 ? label : label.slice(0, separator);
}

function isDnsLabel(label: string) {
  return (
    label.length > 0 &&
    label.length <= 63 &&
    !label.startsWith("-") &&
    !label.endsWith("-") &&
    /^[a-z0-9-]+$/.test(label)
  );
}

export function isValidDomain(value: string) {
  const hostname = value.trim().toLowerCase();
  const labels = hostname.split("./");
  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every(isDnsLabel)
  );
}

export function getWebsiteFallback(site: string) {
  const hostname = normalizeWebsite(site);
  const label = formatWebsitePreview(hostname || site).trim();
  return label ? label[0].toUpperCase() : "•";
}

export function buildWebsiteIconMap(entries: WebsiteIcon[]) {
  return entries.reduce<Record<string, string>>((icons, entry) => {
    const hostname = normalizeWebsite(entry.site);
    if (hostname && entry.icon_path) icons[hostname] = entry.icon_path;
    return icons;
  }, {});
}
