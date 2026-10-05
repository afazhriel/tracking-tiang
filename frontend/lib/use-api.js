'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { AUTH_CHANGED_EVENT, TOKEN_KEY } from './api'

/**
 * Auth gate tanpa effect.
 *
 * Membaca token dari localStorage sebagai external store sehingga:
 * - tidak ada cascading render,
 * - tidak ada layar "loading" yang berkedip,
 * - tetap mengikuti mekanisme token existing (`tracking_tiang_token`).
 */
function subscribeToAuth(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener(AUTH_CHANGED_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(AUTH_CHANGED_EVENT, callback)
  }
}

function getAuthSnapshot() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function getServerAuthSnapshot() {
  return null
}

export function useAuthGate() {
  const token = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getServerAuthSnapshot
  )

  return {
    checking: false,
    authenticated: Boolean(token),
  }
}

/**
 * Hook pemuat data generik.
 *
 * - `loader` harus async dan melempar ApiError saat gagal.
 * - Request yang sudah outdated diabaikan (race-safe).
 * - Halaman cukup menulis `loading / error / data` tanpa logika
 *   fetch yang berulang di tiap file.
 */
export function useResource(loader, deps = [], options = {}) {
  const { enabled = true } = options

  const loaderRef = useRef(loader)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  const [state, setState] = useState({
    data: null,
    error: null,
    loading: Boolean(enabled),
  })

  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false })

      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setState((previous) => ({ ...previous, loading: true, error: null }))

    try {
      const data = await loaderRef.current()

      if (!mountedRef.current || requestIdRef.current !== requestId) return

      setState({ data, error: null, loading: false })
    } catch (error) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return
      if (error?.name === 'AbortError') return

      setState({ data: null, error, loading: false })
    }
  }, [enabled])

  useEffect(() => {
    // Fetch-on-deps-change adalah pola-effect yang disengaja untuk
    // pemuatan data tanpa library cache tambahan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback((updater) => {
    setState((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater,
    }))
  }, [])

  return { ...state, reload, setData }
}