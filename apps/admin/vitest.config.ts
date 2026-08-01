import { defineConfig } from 'vitest/config'
import path from 'path'

// This app's tests exercise pure domain/lib logic only (e.g.
// src/lib/students/update-student.ts), not React components, so a plain
// Node environment is enough — no JSX/React testing plugin needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
  },
})
