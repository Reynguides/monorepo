// @ts-check
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".wrangler/**",
      // Config files are themselves untyped; don't TS-aware-lint them.
      "eslint.config.js",
      "vitest.config.ts",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "no-nested-ternary": "error",
      // Banned per ADR-0009: `as unknown as X` double casts must Zod-validate instead.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression",
          message: "Avoid double `as` casts. Validate with Zod at boundaries.",
        },
      ],
      complexity: ["error", 10],
      "max-lines": ["error", { max: 300, skipBlankLines: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true }],
    },
  },
  {
    files: ["test/**/*.ts", "vitest.config.ts"],
    rules: {
      // Test ergonomics: stubs sometimes return `any`-typed handlers; assertions
      // often inline arrays/objects; complexity rules conflict with test setup.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      complexity: "off",
      "max-lines-per-function": "off",
    },
  },
  eslintConfigPrettier,
);
