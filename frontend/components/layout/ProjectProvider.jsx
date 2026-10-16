'use client'

import { useCallback, useEffect, useMemo } from 'react'

import { api, normalizeProject, unwrapItem, unwrapList } from '../../lib/api'
import {
  ProjectContext,
  readStoredProjectId,
  writeStoredProjectId,
} from '../../lib/project-context'
import { useResource } from '../../lib/use-api'

/**
 * Menentukan project aktif mengikuti endpoint yang sudah ada
 * (GET /api/projects) - tidak ada data project hardcoded.
 */
async function loadProject() {
  const projects = unwrapList(await api.listProjects()).map(normalizeProject)

  if (!projects.length) {
    return { project: null, projectId: null, projects: [] }
  }

  const storedId = readStoredProjectId()
  const active =
    projects.find((item) => String(item.id) === storedId) ?? projects[0]

  let detail = null

  try {
    detail = unwrapItem(await api.getProject(active.id))
  } catch {
    /* detail opsional - daftar project sudah cukup untuk navigasi */
  }

  const normalizedDetail = detail ? normalizeProject(detail) : null

  return {
    /* `show` selalu memuat `regions` + `workItems`; kalau gagal,
       tetap pakai data ringkas dari `index` supaya halaman tidak
       ikut kosong. */
    project: normalizedDetail ?? active,
    projectId: active.id,
    projects,
  }
}

export default function ProjectProvider({ children }) {
  const { data, error, loading, reload } = useResource(loadProject, [])

  /* Memilih project lain berarti semua angka, peta, dan progress di
     bawahnya berubah. Pakai `location.reload()` supaya cache GET dan
     state progress ikut bersih — efeknya sama seperti logout, jadi
     tidak ada data project lama yang tertinggal di layar. */
  const selectProject = useCallback((nextId) => {
    if (nextId === null || nextId === undefined) return

    const current = readStoredProjectId()

    if (String(current) === String(nextId)) return

    writeStoredProjectId(nextId)
    window.location.reload()
  }, [])

  useEffect(() => {
    if (data?.projectId !== null && data?.projectId !== undefined) {
      writeStoredProjectId(data.projectId)
    }
  }, [data?.projectId])

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
      selectProject,
      regions: resolved.project?.regions ?? [],
      workItems: resolved.project?.workItems ?? [],
      polesCount: resolved.project?.polesCount ?? null,
    }
  }, [data, error, loading, reload, selectProject])

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}
