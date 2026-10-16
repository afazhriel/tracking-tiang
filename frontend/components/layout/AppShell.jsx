'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, MapPin } from 'lucide-react'
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

import { clearAuth, getStoredUser } from '../../lib/api'
import { useAuthGate } from '../../lib/use-api'
import { formatDate } from '../../lib/format'
import {
  NAV_ITEMS,
  NAV_SECONDARY,
  isActivePath,
} from '../../lib/navigation'

import ProjectProvider from './ProjectProvider'
import { useProject } from '../../lib/project-context'
import { ErrorNotice } from '../ui/states'

function AppSidebar({ title }) {
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
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_8px_18px_-10px_rgba(201,111,66,.9)]">
        <MapPin className="h-5 w-5" />
      </span>

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
          Tracking Tiang
        </span>
        <span className="block truncate text-xs text-neutral-500">
          Project Dashboard
        </span>
      </motion.div>
    </div>
  )
}

function UserMenu() {
  const [user] = useState(() => getStoredUser())

  const name = user?.name || user?.nama || 'Pengguna'
  const initial = String(name).trim().charAt(0).toUpperCase() || 'U'

  function handleLogout() {
    clearAuth()
    /* Full reload supaya semua state client (project, progress, cache)
       ikut dibersihkan setelah token dihapus. */
    window.location.href = '/login'
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        href="/notifikasi"
        aria-label="Notifikasi"
        className="relative rounded-xl border border-neutral-200 bg-paper p-2.5 text-neutral-600 transition-all hover:border-lagoon-300 hover:bg-lagoon-50 hover:text-lagoon-700"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-600 ring-2 ring-paper" />
      </Link>

      {/* Nama + inisial leading ke /profil. Di mobile disembunyikan
          supaya header tidak melebar — profil tetap bisa dibuka lewat
          sidebar dan drawer navigasi. */}
      <Link
        href="/profil"
        aria-label="Buka profil"
        className="hidden items-center gap-2.5 rounded-xl border border-neutral-200 bg-paper px-2.5 py-1.5 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50 sm:flex"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-plum-500 to-lagoon-600 text-xs font-medium text-white">
          {initial}
        </span>
        <span className="max-w-[9rem] truncate text-sm font-medium text-neutral-800">
          {name}
        </span>
      </Link>

      <button
        type="button"
        onClick={handleLogout}
        aria-label="Keluar"
        title="Keluar"
        className="rounded-xl border border-neutral-200 bg-paper p-2.5 text-neutral-600 transition-all hover:border-clay-300 hover:bg-clay-50 hover:text-clay-700"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Bar project di bawah header.
 *
 * Kalau backend punya lebih dari satu project, bar ini jadi
 * selector. Pilih project lain = muat ulang halaman supaya tidak
 * ada cache progress/peta dari project lama yang ikut tertinggal.
 */
function ProjectBar() {
  const { project, projectId, projects, selectProject } = useProject()

  if (!project) return null

  const options = projects.length ? projects : []

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-200/70 bg-neutral-50/70 px-4 py-3 text-xs text-neutral-500 sm:px-6">
      {options.length > 1 ? (
        <label className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-medium text-neutral-700">Project</span>

          <select
            value={projectId ?? ''}
            onChange={(event) => selectProject(event.target.value)}
            aria-label="Pilih project aktif"
            className="min-w-0 max-w-[16rem] truncate rounded-lg border border-neutral-200 bg-paper px-2 py-1 text-xs font-medium text-neutral-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code ? `${item.code} · ${item.name}` : item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="font-medium text-neutral-800">{project.name}</span>
      )}

      {project.code && options.length <= 1 && (
        <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200">
          {project.code}
        </span>
      )}

      {project.startDate && (
        <span>
          Periode: {formatDate(project.startDate)}
          {project.endDate ? ` — ${formatDate(project.endDate)}` : ''}
        </span>
      )}

      <span className="ml-auto text-neutral-400">Project ID: {projectId}</span>
    </div>
  )
}

function ShellContent({ children, title }) {
  const { error, loading, reload } = useProject()

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900 md:flex-row">
        <AppSidebar title={title} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-paper/85 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="hidden h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-lagoon-500 sm:block"
                />

                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brand-600">
                    Project Tracking
                  </p>
                  <h1 className="truncate font-display text-lg font-semibold text-neutral-900">
                    {title}
                  </h1>
                </div>
              </div>

              <UserMenu />
            </div>

            <ProjectBar />
          </header>

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

          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>

          <footer className="border-t border-neutral-200/80 bg-paper px-4 py-4 text-xs text-neutral-400 sm:px-6">
            <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2">
              <span>Tracking Tiang · Project Control System</span>
              <span>Data progress mengikuti endpoint Laravel yang tersedia.</span>
            </div>
          </footer>
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