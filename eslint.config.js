// Root ESLint config — covers packages/core, server, proactive, scripts.
// the-vigil is deliberately excluded and has its own config: it isn't an
// npm workspace member (Metro's module resolution is sensitive to hoisting
// changes — verified the hard way earlier this session when a workspace
// migration silently broke the cron job's tsx path), so it needs its own
// isolated eslint + typescript-eslint install rather than sharing this one.
//
// typescript-eslint's plain `recommended` preset on purpose for this first
// pass, not `recommendedTypeChecked` — adopting a baseline across ~40 files
// at once is enough of a first pass; type-aware linting (which needs each
// package's tsconfig wired in) can follow once this baseline is clean.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "the-vigil/**", "supabase/functions/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // Underscore-prefixed unused args/vars are a common, intentional
      // "yes I know, ignore it" convention — don't fight it.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
