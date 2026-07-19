import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/index.ts',
        'src/workspace.ts',
        'src/doctor.ts',
        'src/create.ts',
        'src/ai/**/*.ts',
        'src/commands/**/*.ts',
        'src/config/**/*.ts',
        'src/contracts/**/*.ts',
        'src/core-bridge/**/*.ts',
        'src/generators/**/*.ts',
        'src/observability/**/*.ts',
        'src/runtime-adapters/**/*.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 60,
        functions: 75,
        statements: 60,
        branches: 50,
      },
    },
  },
});
