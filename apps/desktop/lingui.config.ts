import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { loadSupportedLocales } from "./scripts/lingui-locale-manifest";

const supportedLocales = loadSupportedLocales(process.cwd());

export default defineConfig({
  locales: supportedLocales,
  sourceLocale: "en",
  fallbackLocales: {
    default: "en",
  },
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["src/locales/**", "**/*.d.ts"],
    },
  ],
});
