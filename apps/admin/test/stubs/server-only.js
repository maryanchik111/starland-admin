// Next.js replaces the real `server-only` package with a no-op at build time
// for server bundles (it only throws when accidentally pulled into a client
// bundle). Vitest runs outside that build pipeline, so it needs the same
// no-op substitution to test server-only modules without tripping the guard.
export {}
