'use client'

import { createContext, useContext, useMemo } from 'react'

import { api, unwrapItem, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'

const ProjectContext = createContext(null)

const ACTIVE_PROJECT_KEY = 'tracking_tiang_project_id'

function readStoredProjectId() {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_KEY)
  } catch {
    return null
  }
}

/**
 * Menentukan project aktif mengikuti endpoint yang sudah ada
 * (GET /api/projects) - tidak ada data project hardcoded.
 */
async function loadProject() {
  const projects = unwrapList(await api.listProjects())

  if (!projects.length) {
    return { project: null, projectId: null, projects: [] }
  }

  const storedId = readStoredProjectId()
  const active = projects.find((item) => String(item?.id) === storedId) ?? projects[0]

  let detail = null

  try {
    detail = unwrapItem(await api.getProject(active.id))
  } catch {
    /* detail opsional - daftar project sudah cukup untuk navigasi */
  }

  return {
    project: detail ?? active,
    projectId: active.id,
    projects,
  }
}

export function ProjectProvider({ children }) {
  const { data, error, loading, reload } = useResource(loadProject, [])

  const value = useMemo(() => {
    const resolved = data ?? {
      project: null,
      projectId: null,
      projects: [],
    }

    return {
      ...resolved,
      loading,
      error,
      reload,
      regions: resolved.project?.regions ?? [],
      workItems: resolved.project?.work_items ?? [],
      polesCount: resolved.project?.poles_count ?? null,
    }
  }, [data, error, loading, reload])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const context = useContext(ProjectContext)

  if (!context) {
    throw new Error('useProject harus dipakai di dalam ProjectProvider')
  }

  return context
}