// Minimal flat ESLint config to enable TS parsing and base rules.
// This ensures ESLint v9 can run reliably in CI and locally without requiring
// a full config migration. It mirrors essential parser and rule settings from
// the legacy `.eslintrc.cjs` used by this project.

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'templates/', 'test-workspace/', 'coverage/'],
  },
  {
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      // Project defaults
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off',

      // TypeScript rules (keep test-friendly defaults)
      '@typescript-eslint/no-explicit-any': ['warn', { ignoreRestArgs: true, fixToUnknown: false }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  // Test files: allow any and non-null assertion for mocks and brevity
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
