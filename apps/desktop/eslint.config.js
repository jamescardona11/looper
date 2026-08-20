import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const sourceFiles = ["src/**/*.{ts,tsx}"];

const tauriBoundaryRules = [
  {
    selector:
      "ImportDeclaration[source.value='@tauri-apps/api/core'] ImportSpecifier[imported.name='invoke']",
    message:
      "Rust commands belong in src/data/**. Import a typed data wrapper instead of invoke().",
  },
  {
    selector:
      "ImportDeclaration[source.value='@tauri-apps/api/event'] ImportSpecifier[imported.name='listen']",
    message:
      "Tauri event subscriptions belong in src/data/**. Import a typed data wrapper instead of listen().",
  },
  {
    selector:
      "ImportDeclaration[source.value='@tauri-apps/api/core'] ImportNamespaceSpecifier",
    message:
      "Namespace imports can bypass the invoke() boundary. Import the specific allowed API or add a typed wrapper in src/data/**.",
  },
  {
    selector:
      "ImportDeclaration[source.value='@tauri-apps/api/event'] ImportNamespaceSpecifier",
    message:
      "Namespace imports can bypass the listen() boundary. Import the specific allowed type or add a typed wrapper in src/data/**.",
  },
  {
    selector: "ImportExpression[source.value='@tauri-apps/api/core']",
    message:
      "Dynamic imports can bypass the invoke() boundary. Add a typed wrapper in src/data/**.",
  },
  {
    selector: "ImportExpression[source.value='@tauri-apps/api/event']",
    message:
      "Dynamic imports can bypass the listen() boundary. Add a typed wrapper in src/data/**.",
  },
];

export default defineConfig(
  globalIgnores([
    "dist/",
    "src-tauri/",
    "node_modules/",
    "*.config.*",
  ]),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: sourceFiles,
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Cross-feature dependencies and the complete Tauri allowlist are enforced by
  // architecture.config.ts. ESLint owns only the invoke/listen hard boundary.
  {
    files: sourceFiles,
    ignores: ["src/data/**"],
    rules: {
      "no-restricted-syntax": ["error", ...tauriBoundaryRules],
    },
  },
);
