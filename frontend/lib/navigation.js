import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  User,
  Users,
} from 'lucide-react'

/**
 * Definisi navigasi utama aplikasi.
 * Satu sumber kebenaran untuk Sidebar, mobile bar, dan status aktif.
 */
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Tiang', href: '/tiang', icon: MapPin },
  { label: 'Pekerjaan', href: '/pekerjaan', icon: ClipboardList },
  { label: 'Kurva S', href: '/kurva-s', icon: BarChart3 },
  { label: 'Aktivitas', href: '/aktivitas', icon: Activity },
]

/**
 * Navigasi sekunder: notifikasi, tim, dan profil.
 *
 * Dipisah dari `NAV_ITEMS` karena ketiganya bukan "monitoring
 * harian" — dan `/tim` baru relevan kalau backend someday
 * menyediakan endpoint user/team. Tetap ditampilkan supaya
 * kebutuhan backend terlihat jelas, bukan disembunyikan.
 */
export const NAV_SECONDARY = [
  { label: 'Notifikasi', href: '/notifikasi', icon: Bell },
  { label: 'Tim', href: '/tim', icon: Users },
  { label: 'Profil', href: '/profil', icon: User },
]

export function isActivePath(pathname, href) {
  if (!pathname) return false

  if (href === '/dashboard') return pathname === '/dashboard'

  return pathname === href || pathname.startsWith(`${href}/`)
}
