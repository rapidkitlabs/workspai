import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/ai/**/*.ts',
        'src/commands/**/*.ts',
        'src/config/**/*.ts',
        'src/core-bridge/**/*.ts',
        'src/generators/**/*.ts',
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
        'src/workspace.ts',
        'src/doctor.ts', // New feature, tests in progress
      ],
    },
  },
});
