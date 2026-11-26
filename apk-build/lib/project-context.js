'use client'

import { createContext, useContext } from 'react'

/**
 * Context project dipisah dari `ProjectProvider.jsx` supaya file
 * provider hanya mengekspor komponen — hook `useProject()` dikirim
 * ke modul sendiri (aturan `react-refresh/only-export-components`).
 */
export const ProjectContext = createContext(null)

export const ACTIVE_PROJECT_KEY = 'tracking_tiang_project_id'

export function useProject() {
  const context = useContext(ProjectContext)

  if (!context) {
    throw new Error('useProject harus dipakai di dalam ProjectProvider')
  }

  return context
}

export function readStoredProjectId() {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_KEY)
  } catch {
    return null
  }
}

export function writeStoredProjectId(projectId) {
  try {
    if (projectId === null || projectId === undefined) {
      window.localStorage.removeItem(ACTIVE_PROJECT_KEY)

      return
    }

    window.localStorage.setItem(ACTIVE_PROJECT_KEY, String(projectId))
  } catch {
    /* storage tidak tersedia - abaikan */
  }
}
