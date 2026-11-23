import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Pure utilities run in Node; files that need the DOM opt in with a @vitest-environment comment
    environment: 'node',
  },
})
