import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'

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

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata = {
  title: {
    default: 'Tracking Tiang',
    template: '%s · Tracking Tiang',
  },
  description:
    'Project tracking tiang tegangan — monitoring titik, progres pekerjaan, dan kurva S.',
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