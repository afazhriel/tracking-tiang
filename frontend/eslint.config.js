import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.next',
    'out',
    'build',
    /* Artefak build Android/Capacitor. Dibuat oleh toolchain mobil,
       bukan bagian dari kode aplikasi yang dikelola di sini. */
    'android',
    /* Snapshot UI lama. Disimpan sebagai referensi visual, bukan
       bagian dari build Next.js. */
    'backup-ui',
  ]),

  {
    files: ['tests/**/*.mjs', 'lib/upstream.mjs', 'next.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  {
    /* Next.js mewajibkan `metadata` dan `viewport` diekspor langsung
       dari `app/layout.jsx`. Dua export itu bukan komponen, jadi
       aturan fast-refresh tidak berlaku di file layout. */
    files: ['app/**/layout.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    /* Boilerplate Vite yang masih ada di `src/` (index.html,
       vite.config.js, main.jsx). Tidak diimpor oleh Next.js, tapi
       tetap ikut lint supaya tidak ada error yang tertinggal. */
    files: ['src/main.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['app/**/page.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': ['error', { allowExportNames: ['generateStaticParams', 'metadata', 'generateMetadata'] }],
    },
  },
])
