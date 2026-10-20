import "@fontsource-variable/jetbrains-mono/wght.css";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import 'leaflet/dist/leaflet.css'
import './globals.css'

/* Font diunduh saat build lalu di-self-host oleh Next.js,
   jadi tidak ada request ke Google Fonts saat runtime. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
})

const jetbrains = { variable: "fontsource-jetbrains-variable", className: "fontsource-jetbrains-class" }

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
  /* `viewportFit: 'cover'` wajib supaya `env(safe-area-inset-*)`
     bernilai nyata di perangkat berponi (notch) dan gesture bar.
     Tanpa ini, padding safe-area di globals.css selalu 0. */
  viewportFit: 'cover',
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