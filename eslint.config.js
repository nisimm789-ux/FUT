import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const RUNTIME = { group: ['react', 'react-dom', 'wxt', 'wxt/*', '@wxt-dev/*', 'fastify'], message: 'Pure packages must stay runtime-agnostic.' };
const EA_AND_UI = { group: ['@fc/ea-adapter', '@fc/ui'], message: 'Domain code must not depend on the EA adapter or UI.' };
const WRITE_PATH = { group: ['@fc/ea-actions'], message: 'READ code must not depend on the WRITE/action package.' };

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', '**/dist/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-restricted-globals': ['error', { name: 'eval', message: 'No dynamic code execution.' }],
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // Dependency direction (also enforced by scripts/architecture.test.ts).
  // One block per file group: flat-config rule entries replace, not merge.
  {
    files: ['packages/{contracts,domain,solver,club-engine,telemetry}/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [RUNTIME, EA_AND_UI, WRITE_PATH] }],
    },
  },
  {
    files: ['packages/ea-actions/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [RUNTIME, EA_AND_UI] }],
    },
  },
  {
    files: ['packages/{ea-adapter,ui}/**/*.{ts,tsx}', 'apps/extension/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [WRITE_PATH] }],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
