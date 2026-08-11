import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Package boundary rule (see root eslint.config.js for context on why it's
  // duplicated here): ESLint's flat config does not merge a nested project's
  // config with a parent directory's config, so `apps/admin` needs its own
  // copy of this rule for it to actually run when `pnpm --filter
  // @starland/admin lint` (i.e. `pnpm lint` via turbo) executes.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@starland/integrations-kitchen", "**/integrations/kitchen/**"],
          message:
            "Кухонна інтеграція заборонена в apps/admin. Її код живе тільки в portal і api — " +
            "див. розділ 8 docs/specs/2026-07-31-starland-design.md.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
