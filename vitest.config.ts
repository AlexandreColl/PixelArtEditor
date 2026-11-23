import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Pure utilities run in Node; files that need the DOM opt in with a @vitest-environment comment
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Every source file counts, including the ones no test loads yet
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
      exclude: ['**/*.test.*', 'src/main.tsx', 'src/types/**', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // A floor just under the current figures: new code should come with tests, not lower them
      thresholds: { lines: 54, statements: 54, functions: 50, branches: 41 },
    },
  },
})
