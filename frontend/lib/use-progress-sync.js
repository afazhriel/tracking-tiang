'use client'

import { useCallback, useRef, useState } from 'react'

import { api, normalizeWorkProgress, unwrapList } from './api'

/**
 * Penyinkron progress tiang.
 *
 * Endpoint backend yang tersedia:
 *   GET /api/projects/{project}/poles/{pole}/progress
 *   -> { data: [PoleWorkProgress + workItem], pole_progress: number }
 *
 * Hook ini memuat endpoint tersebut secara bertahap (dengan batas
 * konkurensi) sehingga halaman tidak membanjiri server, dan hanya
 * menampilkan nilai yang benar-benar berasal dari API.
 *
 * Catatan performa: backend mem-paginate 100 tiang per halaman, jadi
 * satu `loadMany` = 1 request daftar + maksimal 100 request progress.
 * `maxPoles` menahan sinkronisasi supaya tidak pernah berubah jadi
 * ribuan request tanpa sengaja.
 */
export function useProgressSync(projectId, { concurrency = 8, maxPoles = 300 } = {}) {
  const [store, setStore] = useState({})
  const [running, setRunning] = useState(false)
  const [progressInfo, setProgressInfo] = useState({ done: 0, total: 0 })

  const controllerRef = useRef(null)
  const mountedRef = useRef(true)

  /* Pole yang sedang di-fetch. Tanpa ini, `selectPole` dan effect
     "muat progress tiang terpilih" bisa menembak endpoint yang sama
     untuk tiang yang sama di frame yang sama. */
  const pendingRef = useRef(new Set())

  const loadOne = useCallback(
    async (poleId, { signal } = {}) => {
      if (poleId === null || poleId === undefined) return null

      const payload = await api.getPoleProgress(projectId, poleId, { signal })
      const items = unwrapList(payload).map(normalizeWorkProgress)
      const weighted =
        payload?.pole_progress === null || payload?.pole_progress === undefined
          ? null
          : Number(payload.pole_progress)

      setStore((previous) => ({
        ...previous,
        [poleId]: { weighted, items, error: null },
      }))

      return { weighted, items }
    },
    [projectId]
  )

  const loadMany = useCallback(
    async (poleIds) => {
      const ids = Array.from(
        new Set((poleIds ?? []).filter((id) => id !== null && id !== undefined))
      )

      if (!ids.length) return

      const queue = ids.slice(0, maxPoles)

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      const { signal } = controller
      let cursor = 0

      setRunning(true)
      setProgressInfo({ done: 0, total: queue.length })

      async function worker() {
        while (cursor < queue.length) {
          if (signal.aborted || !mountedRef.current) return

          const poleId = queue[cursor]
          cursor += 1

          /* Lewati tiang yang sedang Jalan atau sudah punya data —
             tidak ada gunanya request ulang. */
          if (pendingRef.current.has(poleId)) continue

          pendingRef.current.add(poleId)

          try {
            await loadOne(poleId, { signal })
          } catch (error) {
            if (error?.name === 'AbortError') return

            setStore((previous) => ({
              ...previous,
              [poleId]: { weighted: null, items: [], error },
            }))
          } finally {
            pendingRef.current.delete(poleId)
          }

          if (!signal.aborted) {
            setProgressInfo((previous) => ({
              ...previous,
              done: previous.done + 1,
            }))
          }
        }
      }

      const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, queue.length)) },
        () => worker()
      )

      try {
        await Promise.all(workers)
      } finally {
        if (!signal.aborted && mountedRef.current) {
          setRunning(false)
          setProgressInfo((previous) => ({ ...previous, done: previous.total }))
        }
      }
    },
    [concurrency, loadOne, maxPoles]
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    pendingRef.current.clear()
    setStore({})
    setProgressInfo({ done: 0, total: 0 })
  }, [cancel])

  return {
    store,
    loadOne,
    loadMany,
    cancel,
    reset,
    running,
    progressInfo,
    isLoaded: useCallback((poleId) => store[poleId] !== undefined, [store]),
    weightedProgress: useCallback(
      (poleId) => store[poleId]?.weighted ?? null,
      [store]
    ),
    workProgress: useCallback(
      (poleId, workItemId) => {
        const entry = store[poleId]

        if (!entry) return null

        return (
          entry.items.find((item) => item.workItemId === workItemId) ?? null
        )
      },
      [store]
    ),
  }
}