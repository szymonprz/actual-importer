import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/**
 * Layer boundaries (see ARCHITECTURE.md). Lower layers must not import higher
 * ones; only src/ledger talks to Actual and only src/commands prompts.
 */
const CLI_ONLY = {
  group: ["**/commands/**", "**/cli.js", "@clack/prompts", "yargs", "yargs/*"],
  message: "CLI code (commands, prompts, yargs) belongs in src/commands/ — core layers must stay UI-free.",
};
const NO_ACTUAL_SDK = {
  group: ["@actual-app/api", "@actual-app/api/*"],
  message: "Only src/ledger/actual.ts may use the Actual SDK; depend on the Ledger interface instead.",
};
const NO_LEDGER_ADAPTER = {
  group: ["**/ledger/actual.js"],
  message: "Depend on the Ledger interface (ledger/ledger.ts); only commands open a real budget.",
};
const restrict = (...patterns) => ["error", { patterns }];

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": restrict(NO_ACTUAL_SDK),
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "exit",
          message: "Throw UserError instead; src/cli.ts decides the exit code.",
        },
      ],
    },
  },
  {
    // Pure, UI-free core.
    files: ["src/domain/**/*.ts", "src/parsers/**/*.ts", "src/import/**/*.ts", "src/config/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(NO_ACTUAL_SDK, NO_LEDGER_ADAPTER, CLI_ONLY),
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": restrict(NO_ACTUAL_SDK, CLI_ONLY, {
        group: ["**/import/**", "**/ledger/**", "**/config/**", "**/parsers/**"],
        message: "src/domain is the innermost layer and imports nothing from the app.",
      }),
    },
  },
  {
    files: ["src/ledger/actual.ts"],
    rules: { "no-restricted-imports": restrict(CLI_ONLY) },
  },
  {
    files: ["src/cli.ts", "src/**/fixtures/**"],
    rules: { "no-restricted-properties": "off" },
  },
];
