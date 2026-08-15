import js from '@eslint/js';

const nodeGlobals = {
    Buffer: 'readonly',
    console: 'readonly',
    process: 'readonly',
    setTimeout: 'readonly',
    URL: 'readonly'
};

export default [
    {
        ignores: ['node_modules/**', 'data/**'],
        languageOptions: {
            globals: nodeGlobals
        }
    },
    js.configs.recommended
];
