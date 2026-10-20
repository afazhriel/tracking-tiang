/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production'

// Target proxy `/api/*` -> backend. Jangan hardcode IP: pakai env agar
// tidak terikat infrastruktur dan bisa dibuat HTTPS (bukan HTTP polos).
const apiProxyOrigin = process.env.API_PROXY_ORIGIN || 'https://pjl.ituiot.com'

// Origin API untuk aplikasi native (APK). WebView memuat aset lokal
// dan memanggil backend langsung, jadi `connect-src` HARUS menyebut
// origin ini — kalau tidak, CSP memblokir semua request.
const apiConnectOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || apiProxyOrigin

// Content-Security-Policy: izinkan script/style inline bawaan Next.js,
// tile peta OpenStreetMap, dan blob: untuk pratinjau foto.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self' ${apiConnectOrigin}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

// CSP hanya di produksi: mode dev butuh websocket HMR + eval.
if (isProduction) {
  securityHeaders.push({ key: 'Content-Security-Policy', value: contentSecurityPolicy })
}

// Build untuk APK (Capacitor): ekspor statis ke folder `out/` sehingga
// seluruh aset ikut dibundel ke dalam APK. Deploy web biasa (SSR di
// belakang nginx) tetap memakai mode normal karena flag ini hanya aktif
// saat `CAPACITOR_BUILD=1` (lihat script `build:app`).
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1'

const nextConfig = {
  ...(isCapacitorBuild
    ? {
        output: 'export',
        // Ekspor statis tidak punya server Next.js, jadi rewrite `/api/*`
        // tidak berlaku — client memanggil origin API langsung (lib/native.js).
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${apiProxyOrigin}/api/:path*`,
            },
          ]
        },
      }),

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
