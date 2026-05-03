// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nodePlugin from 'eslint-plugin-n';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.tgz'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nodePlugin.configs['flat/recommended-module'],
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // The Node plugin doesn't know about TS path resolution out of the box.
      // tsc + tsup handle module resolution; we don't need n/no-missing-import.
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        { ignores: ['fetch', 'FormData', 'File', 'Blob', 'Response', 'Request'] },
      ],
      // Prefer the unused-args convention used elsewhere in the codebase.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // CLI binaries and one-shot probe scripts use process.exit to surface failure.
    files: ['src/cli/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'n/no-process-exit': 'off',
      'no-console': 'off',
    },
  },
  {
    // Config files at the repo root run outside src/ — relax a few rules.
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    rules: {
      'n/no-extraneous-import': 'off',
    },
  },
  prettierConfig,
);
