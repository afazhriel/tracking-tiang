import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  LayoutDashboard,
  MapPin,
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

export const NAV_SECONDARY = {
  label: 'Notifikasi',
  href: '/notifikasi',
  icon: Bell,
}

export function isActivePath(pathname, href) {
  if (!pathname) return false

  if (href === '/dashboard') return pathname === '/dashboard'

  return pathname === href || pathname.startsWith(`${href}/`)
}