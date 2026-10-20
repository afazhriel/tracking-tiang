'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Media query sebagai state React.
 *
 * Memakai `useSyncExternalStore`, bukan `useState` + `useEffect`:
 * - `matchMedia` memang sumber data di luar React, jadi ini bentuk
 *   yang benar (dan lolos aturan `react-hooks/set-state-in-effect`).
 * - Tidak ada `setState` sinkron di dalam effect → tidak ada cascading
 *   render.
 * - Server dan render pertama memakai `getServerSnapshot` (`false`),
 *   jadi HTML awal identik dan tidak ada hydration mismatch.
 *
 * Dipakai hanya untuk keputusan render yang tidak bisa dinyatakan
 * dengan CSS. Tata letak tetap milik CSS.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => {}
      }

      const media = window.matchMedia(query)

      media.addEventListener('change', onChange)

      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false

    return window.matchMedia(query).matches
  }, [query])

  /* Render server & render pertama klien harus sama-sama `false`. */
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Breakpoint Tailwind `md` (768px): batas tampilan mobile ↔ desktop. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}
