import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'data/**']
  },
  js.configs.recommended
];
