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
 */
export function useProgressSync(projectId, { concurrency = 8 } = {}) {
  const [store, setStore] = useState({})
  const [running, setRunning] = useState(false)
  const [progressInfo, setProgressInfo] = useState({ done: 0, total: 0 })

  const controllerRef = useRef(null)
  const mountedRef = useRef(true)

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
      const ids = Array.from(new Set((poleIds ?? []).filter((id) => id !== null && id !== undefined)))

      if (!ids.length) return

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      const { signal } = controller
      let cursor = 0

      setRunning(true)
      setProgressInfo({ done: 0, total: ids.length })

      async function worker() {
        while (cursor < ids.length) {
          if (signal.aborted || !mountedRef.current) return

          const poleId = ids[cursor]
          cursor += 1

          try {
            await loadOne(poleId, { signal })
          } catch (error) {
            if (error?.name === 'AbortError') return

            setStore((previous) => ({
              ...previous,
              [poleId]: { weighted: null, items: [], error },
            }))
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
        { length: Math.max(1, Math.min(concurrency, ids.length)) },
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
    [concurrency, loadOne]
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
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