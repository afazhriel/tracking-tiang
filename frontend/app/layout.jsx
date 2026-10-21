import localFont from 'next/font/local'

import 'leaflet/dist/leaflet.css'
import './globals.css'

/* Font asli disimpan bersama source agar build tidak bergantung pada jaringan
   Google Fonts. Jenis huruf dan CSS variable desain tetap sama. */
const jakarta = localFont({
  src: './fonts/PlusJakartaSans.ttf',
  weight: '400 800',
  variable: '--font-jakarta',
  display: 'swap',
})

const grotesk = localFont({
  src: './fonts/SpaceGrotesk.ttf',
  weight: '500 700',
  variable: '--font-grotesk',
  display: 'swap',
})

const jetbrains = localFont({
  src: './fonts/JetBrainsMono.ttf',
  weight: '400 600',
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata = {
  title: {
    default: 'Tracking Proyek',
    template: '%s · Tracking Proyek',
  },
  description:
    'Project tracking tiang tegangan — monitoring titik, progres pekerjaan, dan kurva S.',
  manifest: '/manifest.json',
  icons: {
    /* SVG lebih tajam di tab browser; PNG dipakai perangkat yang
       tidak mendukung SVG favicon. Dihasilkan oleh
       scripts/generate-icons.mjs dari public/brand/logo-mark.svg. */
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tracking Proyek',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#c96f42',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body
        className={`${jakarta.variable} ${grotesk.variable} ${jetbrains.variable}`}
      >
        {children}
      </body>
    </html>
  )
}