'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SidebarContext, useSidebar } from '../../lib/use-sidebar'

/* Lebar dua state dalam px. Angka ini jadi acuan semua padding,
   supaya state terlipat tidak pernah lebih sempit dari isinya. */
const WIDTH_OPEN = 272
const WIDTH_CLOSED = 76

/* Durasi transisi dipisah: panel melebar lebih lambat dari
   teks yang memudar, sehingga label tidak terlihat terpotong. */
const EASE_PANEL = [0.32, 0.72, 0, 1]
const DURATION_PANEL = 0.28
const DURATION_LABEL = 0.14

export function SidebarProvider({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}) {
  const [openState, setOpenState] = useState(true)

  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  /* Sengaja tidak ada hover-peek di sini.
     Versi sebelumnya memakai `expanded = open || hovering`, dan
     justru itu yang bikin panel tidak bisa terlipat: begitu user
     klik "Sembunyikan", kursor masih di atas sidebar sehingga
     `hovering` tetap true dan panel melebar lagi dalam hitungan
     frame. Dari sisi user terlihat macet, bukan responsif.
     Sidebar yang bisa dilipat harus benar-benar berhenti di
     state terlipat sampai ada klik atau Ctrl/Cmd+B. */
  const expanded = animate ? open : true

  const value = { open, setOpen, animate, expanded }

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  children,
  open,
  setOpen,
  animate = true,
}) {
  return (
    <SidebarProvider
      open={open}
      setOpen={setOpen}
      animate={animate}
    >
      {children}
    </SidebarProvider>
  )
}

/**
 * Tombol lipatkan sidebar.
 *
 * Letak dan label dibuat boring demi kejelasan:
 *  - Di footer, bukan di header. Header cuma branding; footer
 *    tempat kontrol tampilan, seperti di Linear dan Notion.
 *  - Tulisan penuh "Sembunyikan sidebar" / "Tampilkan sidebar".
 *    Kata "sembunyikan"/"tampilkan" menjelaskan aksinya, bukan
 *    kondisinya — user tidak perlu tahu istilah "collapse".
 *  - Pintasan Ctrl/Cmd+B ditampilkan sebagai hint, jadi cara
 *    kedua ini bisa ditemukan tanpa dokumentasi.
 */
export function SidebarToggle({ className }) {
  const { open, setOpen, expanded } = useSidebar()

  const label = open ? 'Sembunyikan' : 'Tampilkan'
  const action = open ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={action}
      aria-expanded={open}
      className={cn(
        /* `hidden md:flex`: melipat panel tidak berlaku di mobile,
           jadi tombol ini hanya boleh muncul di breakpoint atas.

           Catatan: jangan pakai nama group berisi garis miring
           seperti `group/toggle` di sini. Tailwind mereikannya
           sebagai selector `.group/toggle`, dan begitu selector itu
           ikut muncul di dalam arbitrary variant, PostCSS gagal
           parses dengan "Unexpected token Delim('/')". Bukan
           karena Tailwind salah, tapi karena nama group tidak
           perlu ada di sini — tidak ada `group-hover/toggle:*`
           yang dipakai. */
        'relative hidden h-9 shrink-0 items-center overflow-hidden rounded-lg md:flex',
        'border border-neutral-200 bg-paper text-neutral-600',
        'transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        expanded ? 'w-full gap-2.5 px-2.5' : 'w-9 justify-center px-0',
        className
      )}
    >
      <PanelGlyph open={open} />

      {/* Teks + shortcut baru muat saat panel lebar. Saat terlipat
          ruangnya 52px, jadi ikon saja + tooltip. */}
      <motion.span
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: DURATION_LABEL, ease: 'easeOut' }}
        className="min-w-0 flex-1 truncate text-left text-xs font-medium"
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
        aria-hidden
      >
        {label}
      </motion.span>

      {expanded && <ShortcutHint />}
    </button>
  )
}

/** "Ctrl B" — hanya shown di panel lebar, swayanya dekoratif. */
function ShortcutHint() {
  return (
    <kbd
      aria-hidden
      className="hidden shrink-0 rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] leading-none text-neutral-400 lg:block"
    >
      {typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad/.test(navigator.platform || '') ? (
        '⌘B'
      ) : (
        'Ctrl B'
      )}
    </kbd>
  )
}

/** Ikon panel: garis dengan sisi yang terisi menunjuk arah lipatan. */
function PanelGlyph({ open }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-[18px] w-[18px] shrink-0"
    >
      <rect
        x="2.75"
        y="3.75"
        width="14.5"
        height="12.5"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d={open ? 'M10 4.5v11' : 'M6.5 4.5v11'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x={open ? '10.75' : '3.5'}
        y="4.5"
        width={open ? '5.75' : '2.5'}
        height="11"
        rx="1.5"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  )
}

/**
 * Tooltip untuk state terlipat.
 *
 * Dirender lewat portal ke <body>, bukan `absolute` di dalam
 * sidebar. Alasannya: <aside> memakai `overflow-hidden` supaya
 * label yang sedang memudar tidak meluber keluar panel — konsekuensinya
 * tooltip `left-full` ikut terpotong dan tidak pernah terlihat.
 * Portal lepas dari clipping itu, lalu posisinya dihitung dari
 * bounding box elemen pemicunya.
 */
function CollapsedHint({ children }) {
  const [position, setPosition] = useState(null)
  const anchorRef = useRef(null)

  function show() {
    const box = anchorRef.current?.getBoundingClientRect()
    if (!box) return

    setPosition({
      top: box.top + box.height / 2,
      left: box.right + 12,
    })
  }

  function hide() {
    setPosition(null)
  }

  return (
    <>
      <span
        ref={anchorRef}
        className="block"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>

      {createPortal(
        <AnimatePresence>
          {position && (
            <motion.span
              role="tooltip"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
              }}
              className="pointer-events-none z-[200] -translate-y-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lift"
            >
              {children}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export /**
 * Wadah dua tampilan sidebar.
 *
 * `children` dirender dua kali karena bentuknya beda total:
 * desktop jadi panel lebar yang bisa terlipat, mobile jadi bar
 * h-14 plus drawer. Anak yang hanya relevan di desktop
 * (tombol lipatkan sidebar) menyembunyikan dirinya sendiri lewat
 * `hidden md:flex`, jadi tidak perlu filter di sini.
 */
function SidebarBody({
  className,
  children,
  mobileLabel,
  ...props
}) {
  return (
    <>
      <DesktopSidebar className={className} {...props}>
        {children}
      </DesktopSidebar>

      <MobileSidebar label={mobileLabel}>
        {children}
      </MobileSidebar>
    </>
  )
}

function DesktopSidebar({
  className,
  children,
  ...props
}) {
  const { expanded } = useSidebar()
  const width = expanded ? WIDTH_OPEN : WIDTH_CLOSED

  return (
    <motion.aside
      className={cn(
        'relative hidden shrink-0 flex-col overflow-hidden border-r border-neutral-200/80 bg-paper md:flex',
        className
      )}
      style={{
        /* Padding ikut state lebarnya. Kalau padding tetap, state
           76px akan memotong ikon di dalamnya. */
        paddingLeft: expanded ? 16 : 12,
        paddingRight: expanded ? 16 : 12,
        paddingTop: 16,
        paddingBottom: 16,
      }}
      initial={false}
      animate={{ width }}
      transition={{ duration: DURATION_PANEL, ease: EASE_PANEL }}
      {...props}
    >
      {children}
    </motion.aside>
  )
}

/**
 * Label sidebar.
 *
 * Dipisah jadi komponen sendiri supaya SidebarLink tidak perlu
 * tahu soal lebar panel. Yang penting: `overflow-hidden` +
 * `whitespace-nowrap` supaya teks memendek dari samping, bukan
 * pecah baris di tengah animasi.
 */
function SidebarLabel({ active, children }) {
  const { expanded } = useSidebar()

  return (
    <motion.span
      initial={false}
      animate={{ opacity: expanded ? 1 : 0 }}
      transition={{ duration: DURATION_LABEL, ease: 'easeOut' }}
      className={cn(
        'min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm',
        active ? 'font-medium' : 'font-normal'
      )}
      /* Label yang transparan tidak boleh memblokir klik pointer. */
      style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      aria-hidden={!expanded}
    >
      {children}
    </motion.span>
  )
}

/**
 * Drawer mobile.
 *
 * State-nya sengaja terpisah dari preferensi sidebar desktop.
 * Kalau berbagi, mobile akan membuka drawer sendirian di setiap
 * load kalau user pernah melipat sidebar di desktop — dan
 * sebaliknya, menekan tombol lipat desktop tidak akan pernah
 * menutup drawer di layar kecil. Dua konteks layar, dua state.
 */
function MobileSidebar({ children, label }) {
  const [open, setOpen] = useState(false)

  /* Kunci scroll body selagi drawer terbuka supaya halaman di
     belakang tidak ikut bergulir. */
  useEffect(() => {
    if (!open) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /* Escape menutup drawer: user di mobile tidak punya tombol
       collapse, jadi keyboard adalah jalur keluar yang wajar. */
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="flex h-14 w-full items-center justify-between gap-3 border-b border-neutral-200/80 bg-paper px-4 md:hidden">
      <span className="truncate text-sm font-semibold text-neutral-800">
        {label}
      </span>

      <button
        type="button"
        aria-label="Buka menu navigasi"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-800 transition-colors hover:bg-neutral-900/[.06]"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-espresso-950/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.nav
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: DURATION_PANEL, ease: EASE_PANEL }}
              onClick={(event) => event.stopPropagation()}
              className="flex h-full w-[min(19rem,85vw)] flex-col overflow-y-auto border-r border-neutral-200 bg-paper p-5 shadow-lift"
            >
              <button
                type="button"
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-100"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu navigasi"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Drawer selalu tampil penuh. "Hemat ruang" tidak
                  relevan di layar kecil, dan kalau memakai state
                  desktop yang sama, link di dalam drawer ikut jadi
                  ikon saja saat sidebar desktop terlipat. */}
              <SidebarProvider animate={false}>{children}</SidebarProvider>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SidebarLink({
  link,
  className,
  active = false,
  showLabel = true,
  ...props
}) {
  const { expanded } = useSidebar()

  const content = (
    <>
      {/* Penanda aktif: batang terracotta, bukan hanya latar berbeda. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity',
          active ? 'opacity-100' : 'opacity-0'
        )}
      />

      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          active
            ? 'bg-brand-600/10 text-brand-700'
            : 'text-neutral-500 group-hover/sidebar:text-neutral-700'
        )}
      >
        {link.icon}
      </span>

      {showLabel && <SidebarLabel active={active}>{link.label}</SidebarLabel>}
    </>
  )

  const linkClasses = cn(
    'group/sidebar relative flex items-center rounded-xl transition-colors',
    expanded ? 'gap-3 px-2.5 py-2' : 'justify-center px-0 py-2',
    'text-neutral-600 hover:bg-neutral-900/[.05] hover:text-neutral-900',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
    active && 'bg-paper text-neutral-900 shadow-[0_1px_2px_rgba(60,44,30,.08)] ring-1 ring-neutral-200',
    className
  )

  /* Terlipat: bungkus tooltip supaya nama menunya tetap muncul
     saat hover. Terbuka: label sudah cukup jelas, tanpa tooltip. */
  if (!expanded) {
    return (
      <CollapsedHint>
        <Link
          href={link.href}
          aria-current={active ? 'page' : undefined}
          aria-label={link.label}
          className={linkClasses}
          {...props}
        >
          {content}
        </Link>
      </CollapsedHint>
    )
  }

  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={linkClasses}
      {...props}
    >
      {content}
    </Link>
  )
}