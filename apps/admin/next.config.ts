import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  // Workspace packages ship TypeScript source (no build step), so Next.js
  // must transpile them itself instead of treating them as pre-built deps.
  transpilePackages: ["@starland/i18n", "@starland/domain", "@starland/db"],
};

export default nextConfig;
