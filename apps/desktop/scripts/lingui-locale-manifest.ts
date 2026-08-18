import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type LocaleManifest = string[];

const manifestFile = (cwd: string) =>
  resolve(cwd, "supported-app-locales.json");

const readManifest = (filename: string): unknown =>
  JSON.parse(readFileSync(filename, "utf8"));

const validateManifest = (value: unknown): LocaleManifest => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("supported-app-locales.json must be a non-empty array");
  }

  const locales = value.map((entry) => {
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      entry !== entry.trim() ||
      entry !== entry.toLowerCase()
    ) {
      throw new Error(
        "supported-app-locales.json must use lowercase, trimmed locale codes",
      );
    }
    return entry;
  });

  if (new Set(locales).size !== locales.length) {
    throw new Error("supported-app-locales.json contains duplicate locale");
  }

  return locales;
};

export const loadSupportedLocales = (cwd: string): LocaleManifest =>
  validateManifest(readManifest(manifestFile(cwd)));
