import { defineConfig } from 'vitest/config'

// This app's tests exercise pure domain/lib logic only (e.g.
// src/lib/students/update-student.ts), not React components, so a plain
// Node environment is enough — no JSX/React testing plugin needed.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
