'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ChevronDown, LogOut, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'

import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarToggle,
} from '../../src/components/TemplateSidebar'

import { useSidebar } from '../../lib/use-sidebar'
import {
  useSidebarPreference,
  useSidebarShortcut,
} from '../../lib/use-sidebar-preference'

import { api, clearAuth, getStoredUser } from '../../lib/api'
import { useAuthGate } from '../../lib/use-api'
import {
  NAV_ITEMS,
  NAV_SECONDARY,
  isActivePath,
} from '../../lib/navigation'

import ProjectProvider from './ProjectProvider'
import { useProject } from '../../lib/project-context'
import { ErrorNotice } from '../ui/states'
import { cn } from '../../lib/utils'

function AppSidebar({ title, trailing }) {
  const pathname = usePathname()
  const { open, toggle } = useSidebarPreference()

  /* Sidebar bisa dilipat tanpa mouse — penting kalau user sedang
     mengisi form panjang di kanan dan tidak mau geser kursor. */
  useSidebarShortcut(toggle)

  return (
    <Sidebar open={open} setOpen={toggle} animate>
      <SidebarBody
        className="justify-between gap-6 md:sticky md:top-0 md:h-screen"
        mobileLabel={title}
        trailing={trailing}
      >
        <div className="flex flex-1 flex-col">
          <SidebarHeader />

          <nav className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                active={isActivePath(pathname, item.href)}
                link={{
                  label: item.label,
                  href: item.href,
                  icon: <item.icon className="h-[18px] w-[18px]" />,
                }}
              />
            ))}
          </nav>
        </div>

        {/* Kontrol tampilan dipisah dari navigasi: menu sekunder di
            atas, pemipit sidebar di bawah garis pemisah. */}
        <div className="mt-auto flex flex-col gap-3 border-t border-neutral-200/80 pt-3">
          {NAV_SECONDARY.map((item) => (
            <SidebarLink
              key={item.href}
              active={isActivePath(pathname, item.href)}
              link={{
                label: item.label,
                href: item.href,
                icon: <item.icon className="h-[18px] w-[18px]" />,
              }}
            />
          ))}

          <SidebarToggle />
        </div>
      </SidebarBody>
    </Sidebar>
  )
}

/**
 * Header sidebar.
 *
 * Cuma branding — tidak ada kontrol di sini. Tombol lipatnya ada
 * di footer supaya header tidak jadi dua tempat berebut klik, dan
 * teks brand bisa menyempit penuh tanpa mengorbankan ruang tombol.
 */
function SidebarHeader() {
  const { expanded } = useSidebar()

  return (
    <div className="mb-6 flex items-center gap-2.5">
      {/* Mark aplikasi (public/brand/logo-mark.svg) — sumber yang sama
          dengan favicon dan icon launcher, jadi logo di bar web tidak
          pernah berbeda dari logo di aplikasi mobile. */}
      <img
        src="/brand/logo-mark.svg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-xl shadow-[0_8px_18px_-10px_rgba(201,111,66,.9)]"
      />

      <motion.div
        initial={false}
        animate={{
          opacity: expanded ? 1 : 0,
          width: expanded ? 'auto' : 0,
        }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      >
        <span className="block truncate font-display text-sm font-semibold text-neutral-900">
          Tracking Proyek
        </span>
        <span className="block truncate text-xs text-neutral-500">
          Project Dashboard
        </span>
      </motion.div>
    </div>
  )
}

/**
 * Kontrol profil di kanan atas — satu-satunya elemen bar atas.
 *
 * Bentuknya tombol avatar yang membuka dropdown berisi: identitas
 * pengguna, link profil & notifikasi (dengan badge unread),
 * project selector (kalau backend punya >1 project), dan logout.
 * Panel ditutup saat klik di luar, Escape, atau setelah memilih
 * link — supaya tidak menutupi konten secara diam-diam.
 */
function UserMenu({ compact = false }) {
  const [user] = useState(() => getStoredUser())
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const { projectId, projects, selectProject } = useProject()

  const name = user?.name || user?.nama || 'Pengguna'
  const role = user?.role?.name || user?.role || 'Project Control'
  const initial = String(name).trim().charAt(0).toUpperCase() || 'U'

  /* Jumlah notifikasi belum dibaca untuk badge pada dropdown.
     Polling ringan tiap 60 detik; kegagalan (mis. 401) diabaikan
     diam-diam. */
  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const payload = await api.getUnreadNotificationCount()
        const count =
          payload?.data?.unread ?? payload?.meta?.unread ?? 0

        if (active) setUnread(Number(count) || 0)
      } catch {
        /* abaikan — badge cukup tidak tampil */
      }
    }

    const handleUpdate = () => { load() }

    load()

    const timer = setInterval(load, 60000)

    if (typeof window !== 'undefined') {
      window.addEventListener('tracking_tiang:notifications-updated', handleUpdate)
    }

    return () => {
      active = false
      clearInterval(timer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('tracking_tiang:notifications-updated', handleUpdate)
      }
    }
  }, [])

  /* Tutup dropdown saat klik di luar root atau menekan Escape. */
  useEffect(() => {
    if (!open) return

    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleLogout() {
    clearAuth()
    /* Navigasi klien — BUKAN `window.location.href = '/login'`.
       Di APK (Capacitor, html5mode), muat dokumen penuh ke `/login`
       dibalas WebView lokal dengan `index.html` (halaman landing),
       sehingga user tampak "tidak pernah keluar". Negara client lama
       tetap bersih: begitu token hilang, AuthGate melempar ke
       `/login` lewat router klien juga. */
    router.replace('/login')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? 'Menu profil' : `Profil ${name}`}
        className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-paper py-1 pl-1 pr-2 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:gap-2.5 sm:pr-2.5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-plum-500 to-lagoon-600 text-xs font-semibold text-white">
          {initial}
        </span>

        {!compact && (
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[9rem] truncate text-sm font-medium leading-tight text-neutral-800">
              {name}
            </span>
            <span className="block max-w-[9rem] truncate text-[11px] leading-tight text-neutral-500">
              {role}
            </span>
          </span>
        )}

        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu profil"
          className="absolute right-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-neutral-200 bg-paper p-1.5 shadow-lift"
        >
          <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-plum-500 to-lagoon-600 text-sm font-semibold text-white">
              {initial}
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {name}
              </p>
              <p className="truncate text-xs text-neutral-500">{role}</p>
            </div>
          </div>

          <div className="my-1.5 h-px bg-neutral-200/80" />

          <Link
            href="/profil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <UserRound className="h-4 w-4 text-neutral-400" />
            Profil saya
          </Link>

          <Link
            href="/notifikasi"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Bell className="h-4 w-4 text-neutral-400" />
            Notifikasi

            {unread > 0 && (
              <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          {/* Project selector pindah ke sini dari bar project lama:
              hanya muncul kalau backend mengirim lebih dari satu
              project. Pilih project lain = reload halaman supaya
              cache progress/peta lama ikut terhapus. */}
          {projects.length > 1 && (
            <>
              <div className="my-1.5 h-px bg-neutral-200/80" />

              <label className="block px-3 pb-1 pt-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                  Project aktif
                </span>

                <select
                  value={projectId ?? ''}
                  onChange={(event) => selectProject(event.target.value)}
                  className="mt-1.5 w-full truncate rounded-lg border border-neutral-200 bg-paper px-2 py-1.5 text-xs font-medium text-neutral-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                >
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `${item.code} · ${item.name}` : item.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="my-1.5 h-px bg-neutral-200/80" />

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-clay-700 transition-colors hover:bg-clay-50"
          >
            <LogOut className="h-4 w-4 text-clay-500" />
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}

function ShellContent({ children, title }) {
  const { error, loading, reload } = useProject()

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900 md:flex-row">
        <AppSidebar title={title} trailing={<UserMenu compact />} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Bar atas tanpa judul — hanya profil di kanan. Judul halaman
              cukup lewat PageHeader di konten dan label bar mobile. */}
          <div className="sticky top-0 z-40 hidden h-12 items-center justify-end border-b border-neutral-200/80 bg-paper/85 px-4 backdrop-blur-md sm:px-6 md:flex">
            <UserMenu />
          </div>

          {(error || loading) && (
            <div className="px-4 pt-5 sm:px-6">
              {error ? (
                <ErrorNotice
                  error={error}
                  onRetry={reload}
                  title="Backend tidak dapat dihubungi"
                />
              ) : (
                <div className="animate-pulse rounded-card border border-neutral-200 bg-paper px-4 py-3 text-xs text-neutral-400">
                  Memuat informasi project...
                </div>
              )}
            </div>
          )}

          <main className="safe-bottom flex-1 px-4 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
    </div>
  )
}

function AuthGate({ children }) {
  const { authenticated } = useAuthGate()
  const router = useRouter()

  useEffect(() => {
    if (!authenticated) {
      router.replace('/login')
    }
  }, [authenticated, router])

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-neutral-500">
        <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-600" />
        Memeriksa login...
      </div>
    )
  }

  return children
}

/**
 * AppShell = Sidebar + Header + Main content.
 * Semua halaman internal memakai komponen ini supaya layout,
 * navigasi, dan design system konsisten.
 */
export default function AppShell({ title, children }) {
  const heading = title || 'Dashboard'

  return (
    <AuthGate>
      <ProjectProvider>
        <ShellContent title={heading}>{children}</ShellContent>
      </ProjectProvider>
    </AuthGate>
  )
}