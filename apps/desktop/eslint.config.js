import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  {
    ignores: ["dist/**", "src-tauri/**", "node_modules/**", "*.config.*"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/**" },
        { type: "shared", pattern: "src/shared/**" },
        { type: "legacy", pattern: "src/**", mode: "file" },
      ],
      "boundaries/ignore": ["**/*.test.*", "**/*.spec.*"],
    },
    rules: {
      // Feature isolation: features cannot import from other features
      "boundaries/dependencies": [
        "warn",
        {
          default: "disallow",
          rules: [
            {
              from: { type: "app" },
              allow: { to: { type: ["app", "feature", "shared", "legacy"] } },
            },
            {
              from: { type: "feature" },
              allow: { to: { type: ["shared", "legacy"] } },
            },
            {
              from: { type: "shared" },
              allow: { to: { type: ["shared", "legacy"] } },
            },
            {
              from: { type: "legacy" },
              allow: { to: { type: ["app", "feature", "shared", "legacy"] } },
            },
          ],
        },
      ],
      // No direct @tauri-apps imports outside boundary files
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@tauri-apps/api/*"],
              message:
                "Use feature api.ts or an existing app/shared boundary file instead of adding new direct @tauri-apps imports.",
            },
          ],
        },
      ],
      // Disable rules that conflict with TypeScript or flag pre-existing code
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      "no-useless-assignment": "off",
    },
  },
  // Override: allow @tauri-apps imports in app/shared boundary files, feature api/query files, and legacy
  {
    files: [
      "src/app/**/*.ts",
      "src/app/**/*.tsx",
      "src/shared/hooks/**/*.ts",
      "src/shared/hooks/**/*.tsx",
      "src/features/*/api.ts",
      "src/features/*/models-api.ts",
      "src/features/*/queries.ts",
      "src/features/*/models-queries.ts",
      "src/features/*/components/**/*.tsx",
      "src/features/*/steps/**/*.tsx",
      "src/features/*/*.ts",
      "src/features/*/*.tsx",
      "src/Home.tsx",
      "src/main.tsx",
      "src/app/App.tsx",
      "src/hooks/**/*.ts",
      "src/lib/**/*.ts",
      "src/data/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override: allow cross-feature imports for settings (cross-cutting)
  {
    files: ["src/features/*/queries.ts", "src/features/*/components/**/*.tsx"],
    rules: {
      "boundaries/dependencies": [
        "warn",
        {
          default: "disallow",
          rules: [
            {
              from: { type: "feature" },
              allow: { to: { type: ["feature", "shared", "legacy"] } },
            },
          ],
        },
      ],
    },
  },
  // Data boundary (F0c.1): invoke()/listen() from @tauri-apps must only be
  // imported inside src/data/**. Everything else talks to Tauri through the
  // typed wrappers there. This is a hard error (unlike the warn-level
  // no-restricted-imports above) so it actually fails `pnpm lint`. Existing
  // call sites outside src/data/** that aren't migrated yet carry their own
  // `eslint-disable-next-line` + TODO pointing at
  // ai_docs/f0c-migration-backlog.md — see that file for what's pending.
  {
    ignores: ["src/data/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='@tauri-apps/api/core'] ImportSpecifier[imported.name='invoke']",
          message:
            "invoke() is only allowed inside src/data/**. Add/use a wrapper there instead (see ai_docs/f0c-migration-backlog.md if this domain isn't migrated yet).",
        },
        {
          selector:
            "ImportDeclaration[source.value='@tauri-apps/api/event'] ImportSpecifier[imported.name='listen']",
          message:
            "listen() is only allowed inside src/data/**. Add/use a wrapper there instead (see ai_docs/f0c-migration-backlog.md if this domain isn't migrated yet).",
        },
      ],
    },
  },
);
