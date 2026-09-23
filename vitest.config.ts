import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'apps/api/vitest.config.ts',
      'apps/extension/vitest.config.ts',
      {
        test: {
          name: 'architecture',
          include: ['scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
