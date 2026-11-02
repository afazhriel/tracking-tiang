import {
  BarChart3,
  Bell,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  User,
  Users,
} from 'lucide-react'

// Lima menu utama, sementara URL halaman lama tetap dapat dibuka.
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Proyek', href: '/proyek', icon: FolderKanban },
  { label: 'Input Progres', href: '/input-progres', icon: ClipboardList },
  { label: 'Laporan', href: '/laporan', icon: BarChart3 },
  { label: 'Tim', href: '/tim', icon: Users },
]

export const NAV_SECONDARY = [
  { label: 'Notifikasi', href: '/notifikasi', icon: Bell },
  { label: 'Profil', href: '/profil', icon: User },
]

function matches(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isActivePath(pathname, href) {
  if (!pathname) return false
  if (matches(pathname, href)) return true
  if (href === '/input-progres') return matches(pathname, '/tiang')
  if (href === '/laporan') {
    return ['/kurva-s', '/pekerjaan', '/aktivitas'].some((legacy) => matches(pathname, legacy))
  }
  return false
}
