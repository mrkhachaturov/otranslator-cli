import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    setupFiles: ['test/e2e/setup-env.ts'],
  },
});
