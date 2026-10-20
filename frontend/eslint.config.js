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
    /* Next.js mewajibkan sejumlah file `page.jsx`/`layout.jsx`
       mengekspor hal selain komponen: `metadata`, `viewport`, dan
       `generateStaticParams`. Ketiganya bukan komponen, jadi aturan
       fast-refresh tidak berlaku di file-file ini. */
    files: [
      'app/**/layout.{js,jsx}',
      'app/**/page.{js,jsx}',
      'app/**/[[]*[]]/page.{js,jsx}',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    /* Next.js mengganti `process.env.NEXT_PUBLIC_*` menjadi literal
       saat build; mengakses `process.env` di modul yang juga jalan di
       browser adalah pola resmi. `process` hanya perlu dikenal lint di
       file yang memang membacanya. */
    files: ['lib/native.js', 'next.config.mjs'],
    languageOptions: {
      globals: { ...globals.browser, process: 'readonly' },
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
])
