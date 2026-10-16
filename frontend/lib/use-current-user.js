'use client'

import { useMemo, useSyncExternalStore } from 'react'

import {
  AUTH_CHANGED_EVENT,
  USER_KEY,
  normalizeUser,
} from './api'

function subscribe(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener(AUTH_CHANGED_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(AUTH_CHANGED_EVENT, callback)
  }
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

/* Harus fungsi yang sama antar render (`useSyncExternalStore`
   membandingkan hasil snapshot dengan `Object.is`). */
function getServerSnapshot() {
  return null
}

/**
 * User yang sedang login, dibaca dari localStorage dan didengarkan
 * perubahannya (login/logout dari tab lain ikut tampil).
 *
 * `role` adalah kebenaran untuk gating UI (mis. tombol admin).
 * Backend tetap memegang otorisasi sebenarnya lewat Policy.
 */
export function useCurrentUser() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return useMemo(() => {
    if (!raw) return normalizeUser(null)

    try {
      return normalizeUser(JSON.parse(raw))
    } catch {
      return normalizeUser(null)
    }
  }, [raw])
}