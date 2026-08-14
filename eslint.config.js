'use strict';

const js = require('@eslint/js');
const typescriptParser = require('@babel/eslint-parser');

const typescriptFiles = ['src/**/*.ts', 'tests/**/*.ts'];

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'Dataset/**', 'MLTraining/**'],
  },
  {
    ...js.configs.recommended,
    files: ['eslint.config.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-typescript'],
        },
        sourceType: 'module',
      },
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message: 'Gunakan tipe spesifik; any memerlukan alasan dan issue tindak lanjut.',
        },
      ],
    },
  },
];
