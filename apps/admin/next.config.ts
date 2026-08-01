import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "..", ".."),
    // Workspace packages (@starland/db, @starland/domain, @starland/i18n) use
    // TypeScript's NodeNext-style convention of writing `.js` extensions on
    // relative imports of `.ts` files (e.g. `./client.js` for `client.ts`).
    // `tsc`/`tsx`/`vitest` resolve this correctly, but Turbopack's bundler
    // (used by both `next dev` and `next build` in this Next.js version)
    // does not resolve `.js` to `.ts`/`.tsx` by default when transpiling
    // these packages' source directly. Without this, `next build` fails with
    // "Module not found" for every such barrel import.
    resolveExtensions: [
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".mjs",
      ".json",
    ],
  },
  // Workspace packages ship TypeScript source (no build step), so Next.js
  // must transpile them itself instead of treating them as pre-built deps.
  transpilePackages: ["@starland/i18n", "@starland/domain", "@starland/db"],
  // Fallback for the (unlikely, given Turbopack is the default bundler here)
  // case this app is ever built with webpack instead — same .js→.ts/.tsx
  // extension resolution problem, solved via webpack's documented option.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
