import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Code-quality gate (US-09). The `Lint` job in .github/workflows/ci.yml picks
 * this up automatically through the `lint` npm script.
 *
 * The rule set is deliberately the recommended baseline, not a house style:
 * a gate the team argues with is a gate the team turns off.
 */
export default tseslint.config(
  {
    // Build output and dependencies: not ours to fix.
    ignores: ['build/**', 'dist/**', 'coverage/**', 'node_modules/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    // Server, workers and infrastructure: plain Node.
    files: ['src/**/*.ts'],
    ignores: ['src/static/**'],
    languageOptions: { globals: globals.node },
  },

  {
    // The React bundle runs in the browser, not in Node.
    files: ['src/static/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['spec/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  {
    // Tooling configuration is CommonJS and runs in Node, where require() is
    // the only way to load another module.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['**/*.{ts,tsx,cjs,mjs}'],
    rules: {
      // An underscore prefix is how this codebase marks a binding it must
      // declare but does not read, such as an unused callback argument.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

);
