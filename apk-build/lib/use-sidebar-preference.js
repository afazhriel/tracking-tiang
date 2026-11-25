'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'tracking_tiang_sidebar_open'

/* Nilai default saat belum pernah ada preferensi tersimpan.
   `true` = sidebar terbuka, sesuai marketers penuhi konten. */
const DEFAULT_OPEN = true

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_OPEN
    return raw === 'true'
  } catch {
    /* localStorage bisa diblokir (mode privat, iframe sandbox). */
    return DEFAULT_OPEN
  }
}

function writeStorage(open) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open))
  } catch {
    /* Kuota penuh atau storage dinonaktifkan — toggle tetap jalan,
       hanya tidak diingat setelah reload. */
  }
}

const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)

  /* Sinkron antar tab: buka sidebar di satu tab, tab lain ikut
     mengikuti supaya tidak ada dua layout berbeda. */
  function onStorage(event) {
    if (event.key === null || event.key === STORAGE_KEY) emit()
  }

  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Preferensi sidebar yang bertahan antar reload.
 *
 * Dibaca lewat `useSyncExternalStore`, bukan `useState` + `useEffect`.
 * Alasannya: localStorage adalah sumber data di luar React, jadi
 * React perlu member tahu perubahan lewat subscription. Kalau
 * effect yang menulis state, hasilnya render pertama di server dan
 * render pertama di client bisa berbeda — sidebar akan berkedip
 * terbuka sesaat sebelum state yang benar arrive.
 *
 * `getServerSnapshot` mengembalikan default supaya HTML dari server
 * dan hidrasi di client cocok.
 */
export function useSidebarPreference() {
  const open = useSyncExternalStore(subscribe, readStorage, () => DEFAULT_OPEN)

  const setOpen = useCallback((next) => {
    writeStorage(next === null ? DEFAULT_OPEN : next)
    emit()
  }, [])

  const toggle = useCallback(() => {
    setOpen(!readStorage())
  }, [setOpen])

  return { open, setOpen, toggle }
}

/**
 * Pintasan Ctrl/Cmd+B untuk lipat / lebarkan sidebar.
 *
 * Pola yang sama dengan VS Code dan Notion: user yang sudah terbiasa
 * tidak perlu mencari tombolnya. Dilewati saat sedang mengetik agar
 * tidak menabur shortcut di dalam input dan textarea.
 */
export function useSidebarShortcut(onToggle) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key.toLowerCase() !== 'b') return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.altKey || event.shiftKey) return

      const target = event.target
      const tag = target?.tagName?.toLowerCase()

      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (target?.isContentEditable) return

      event.preventDefault()
      onToggle()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onToggle])
}