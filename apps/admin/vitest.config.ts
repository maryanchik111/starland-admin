import { defineConfig } from 'vitest/config'
import path from 'path'

// This app's tests exercise pure domain/lib logic only (e.g.
// src/lib/students/update-student.ts), not React components, so a plain
// Node environment is enough — no JSX/React testing plugin needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js swaps `server-only` for a no-op in server bundles; vitest
      // runs outside that pipeline, so modules importing it need the same
      // substitution here or the import throws unconditionally.
      'server-only': path.resolve(__dirname, './test/stubs/server-only.js'),
    },
  },
  test: {
    environment: 'node',
  },
})
