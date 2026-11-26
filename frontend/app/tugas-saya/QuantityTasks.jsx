'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Hash } from 'lucide-react'

import QuantityPanel from '../proyek/QuantityPanel'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { api, normalizeProject, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { formatNumber } from '../../lib/format'
import { cn } from '../../lib/utils'

/* Proyek yang dihitung per jumlah (bukan per lokasi): pencatatannya
   tinggal di sini, satu tempat dengan tugas lokasi. Hak catat
   dibaca dari payload proyek (can_record_progress, dihitung server)
   — Pelihat hanya melihat riwayat. */
export default function QuantityTasks({ initialOpenProjectId = null }) {
  const loader = useCallback(
    async () => await api.listProjects({ cache: 'no-store' }),
    []
  )

  const { data, error, loading, reload } = useResource(loader, [])

  const projects = useMemo(
    () =>
      unwrapList(data)
        .map(normalizeProject)
        .filter((project) => project.progressSource === 'quantity_entries'),
    [data]
  )

  const [openId, setOpenId] = useState(
    initialOpenProjectId ? String(initialOpenProjectId) : null
  )

  /* Sinkronisasi prop ke state saat render (pola "adjusting state
     when a prop changes"), bukan lewat effect. */
  const [prevOpenProjectId, setPrevOpenProjectId] =
    useState(initialOpenProjectId)
  if (prevOpenProjectId !== initialOpenProjectId) {
    setPrevOpenProjectId(initialOpenProjectId)
    setOpenId(initialOpenProjectId ? String(initialOpenProjectId) : null)
  }

  if (loading) return null
  if (error) return null
  if (projects.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
            <Hash className="h-4 w-4" />
          </div>

          <div>
            <CardTitle>Progres jumlah</CardTitle>
            <p className="text-xs text-neutral-500">
              Proyek yang dihitung per jumlah — catat langsung di sini
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5">
        {projects.map((project) => {
          const open = openId === String(project.id)
          const canWrite = project.canRecordProgress === true

          return (
            <div
              key={project.id}
              className="rounded-card border border-neutral-200 bg-paper"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : String(project.id))}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-neutral-900">
                    {project.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    Target {formatNumber(project.targetQuantity ?? 0)}{' '}
                    {project.unitCode ?? 'unit'}
                    {!canWrite && ' · hanya bisa melihat'}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {project.code && (
                    <Badge
                      size="sm"
                      className="bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                    >
                      {project.code}
                    </Badge>
                  )}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-neutral-400 transition-transform',
                      open && 'rotate-180'
                    )}
                  />
                </span>
              </button>

              {open && (
                <div className="border-t border-neutral-100 p-3">
                  {!canWrite && (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
                      Anda hanya bisa melihat progres proyek ini. Pencatatan untuk Pengelola atau Pelaksana proyek.
                    </p>
                  )}
                  <QuantityPanel
                    key={String(project.id)}
                    projectId={project.id}
                    startDate={project.startDate}
                    targetQuantity={project.targetQuantity}
                    unitCode={project.unitCode || 'unit'}
                    canWrite={canWrite}
                  />
                </div>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={reload}
          className="text-xs font-semibold text-neutral-500 underline"
        >
          Muat ulang daftar proyek
        </button>
      </CardContent>
    </Card>
  )
}
