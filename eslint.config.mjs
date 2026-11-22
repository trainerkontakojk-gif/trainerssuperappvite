import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'reference-repo/**',
      'plan/**',
      '**/.turbo/**',
      'docs/**',
      '.codex-plugin/**',
      'scripts/**',
      '**/apply-migration.js',
    ],
  },

  // Base config for all JavaScript/TypeScript files
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Common rules for all source files
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // React-specific (apps/web only)
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../hooks/useApi',
              importNames: ['getApi', 'postApi', 'putApi', 'patchApi', 'deleteApi'],
              message:
                'Wrapper functions sudah dihapus. Gunakan Hono RPC client dari lib/api.ts sebagai gantinya.',
            },
          ],
        },
      ],
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // Node.js apps (api + telefun)
  {
    files: [
      'apps/api/src/**/*.ts',
      'apps/telefun/src/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Provider client SDKs stay behind the API usage-logging wrappers.
  {
    files: ['apps/api/src/**/*.ts', 'apps/telefun/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@google/genai',
              importNames: ['GoogleGenAI'],
              allowTypeImports: true,
              message:
                'Panggil AI hanya melalui wrapper di apps/api/src/lib (gemini.ts / openai.ts / sumopod.ts). Wrapper mencatat logAiUsage() memakai UsageContext dan userId; client SDK langsung melewatkan pencatatan biaya. Import type/enum seperti Type atau Modality tetap boleh.',
            },
            {
              name: 'openai',
              importNames: ['default', 'OpenAI'],
              allowTypeImports: true,
              message:
                'Panggil AI hanya melalui wrapper di apps/api/src/lib (gemini.ts / openai.ts / sumopod.ts). Wrapper mencatat logAiUsage() memakai UsageContext dan userId; client SDK langsung melewatkan pencatatan biaya. Import type/enum seperti Type atau Modality tetap boleh.',
            },
          ],
        },
      ],
    },
  },

  // Gemini's usage-logging wrapper is the sole runtime client-construction site.
  // It remains restricted from importing the separate OpenAI SDK.
  {
    files: ['apps/api/src/lib/gemini.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'openai',
              importNames: ['default', 'OpenAI'],
              allowTypeImports: true,
              message:
                'Panggil AI hanya melalui wrapper di apps/api/src/lib (gemini.ts / openai.ts / sumopod.ts). Wrapper mencatat logAiUsage() memakai UsageContext dan userId; client SDK langsung melewatkan pencatatan biaya. Import type/enum seperti Type atau Modality tetap boleh.',
            },
          ],
        },
      ],
    },
  },

  // Literal model IDs belong in the model registries or task policy.
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    ignores: [
      'packages/types/src/ai-models.ts',
      'packages/types/src/ai-model-policy.ts',
      'apps/api/src/lib/ai-models.ts',
      'apps/api/src/lib/ai-usage.ts',
      '**/*.{test,spec,e2e}.{ts,tsx}',
      '**/__tests__/**',
      '**/e2e/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(gemini|gpt|claude|mimo)-(?!live$)/]',
          message:
            'Jangan tulis model id langsung. Ambil dari AI_TASK_DEFINITIONS (packages/types/src/ai-model-policy.ts) atau helper di apps/api/src/lib/ai-models.ts, supaya kebijakan model dan monitoring biaya tetap satu sumber.',
        },
        {
          selector: 'TemplateElement[value.raw=/^(gemini|gpt|claude|mimo)-(?!live$)/]',
          message:
            'Jangan tulis model id langsung. Ambil dari AI_TASK_DEFINITIONS (packages/types/src/ai-model-policy.ts) atau helper di apps/api/src/lib/ai-models.ts, supaya kebijakan model dan monitoring biaya tetap satu sumber.',
        },
      ],
    },
  },

  // Vitest test files
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
);
