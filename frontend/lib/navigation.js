import {
  BarChart3,
  Bell,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Sparkles,
  User,
  Users,
} from 'lucide-react'

// Lima menu utama, sementara URL halaman lama tetap dapat dibuka.
export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Proyek', href: '/proyek', icon: FolderKanban },
  { label: 'Tugas saya', href: '/tugas-saya', icon: ListChecks },
  { label: 'Laporan', href: '/laporan', icon: BarChart3 },
  { label: 'Tim', href: '/tim', icon: Users },
  { label: 'Asisten AI', href: '/asisten-ai', icon: Sparkles },
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
  if (href === '/tugas-saya') return matches(pathname, '/tiang')
  if (href === '/laporan') {
    return ['/kurva-s', '/pekerjaan', '/aktivitas'].some((legacy) => matches(pathname, legacy))
  }
  return false
}
