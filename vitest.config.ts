import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function fromRoot(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      '@ttt/contracts': fromRoot('./packages/contracts/src/index.ts'),
      '@ttt/game-engine': fromRoot('./packages/game-engine/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 20_000,
    fileParallelism: false,
    include: ['apps/*/test/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/index.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
