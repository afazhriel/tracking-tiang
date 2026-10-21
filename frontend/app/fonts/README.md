# Font aplikasi

Keluarga font tetap Plus Jakarta Sans, Space Grotesk, dan JetBrains Mono,
menggunakan file variable resmi Google Fonts. Semua glyph asli dipertahankan.
CSS variables dan rentang bobot yang dipakai desain tidak berubah.

Sumber: https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl

- `plusjakartasans/PlusJakartaSans[wght].ttf`
- `spacegrotesk/SpaceGrotesk[wght].ttf`
- `jetbrainsmono/JetBrainsMono[wght].ttf`

File OFL setiap keluarga disertakan. Unduhan dilakukan melalui HTTPS dan sumber
dipatok ke commit tersebut. Build memakai `next/font/local`, sehingga tidak perlu
mengunduh stylesheet/font Google selama build dan tetap dilayani dari origin
aplikasi pada browser.

Perubahan ini menangani kegagalan nyata run 39561128994: Turbopack gagal
memproses URL font Google pada production build. Gate tetap wajib dan tidak ada
fallback yang menyembunyikan kegagalan build.
