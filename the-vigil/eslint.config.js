// Standalone config — the-vigil isn't an npm workspace member (Metro's
// module resolution is sensitive to hoisting; verified the hard way
// earlier this session), so it carries its own eslint + typescript-eslint
// install rather than sharing the root one. Same scope decision as root:
// plain `recommended`, not type-checked, first pass only. No React/RN-
// specific plugin yet (eslint-plugin-react, eslint-plugin-react-native) —
// a real follow-on decision, not defaulted into here.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", ".expo/**", "dist/**", "web-build/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
