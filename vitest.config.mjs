import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'tests/integration/server-startup.test.js',
      '**/node_modules/**',
      '**/.git/**',
    ],
    fileParallelism: false,
    hookTimeout: 10_000,
    testTimeout: 10_000,
  },
});
