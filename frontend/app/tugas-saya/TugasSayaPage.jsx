'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CalendarClock,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ListChecks,
  MapPin,
  RefreshCw,
  User,
} from 'lucide-react'

import TaskProgressForm from './TaskProgressForm'
import QuantityTasks from './QuantityTasks'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { Badge, StatusBadge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { ProgressBar } from '../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ErrorNotice, SkeletonRows } from '../../components/ui/states'
import { api, normalizePole, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { writeStoredProjectId } from '../../lib/project-context'
import { formatDate, formatNumber, formatPercent } from '../../lib/format'
import { cn } from '../../lib/utils'

/* Status turunan dari progres (sama dengan backend `cardPayload()`):
   0% Belum mulai, 1–99% Berjalan, 100% Selesai. */
function statusFor(pole) {
  if (pole.statusKey === 'selesai') {
    return { key: 'done', label: pole.statusLabel ?? 'Selesai' }
  }

  if (pole.statusKey === 'jalan') {
    return { key: 'active', label: pole.statusLabel ?? 'Berjalan' }
  }

  return { key: 'idle', label: pole.statusLabel ?? 'Belum mulai' }
}

/* Pindah ke detail titik: simpan dulu proyek pemilik titik supaya
   halaman detail memuat proyek yang benar, lalu navigasi penuh. */
function openPole(pole) {
  if (pole.projectId) writeStoredProjectId(pole.projectId)

  window.location.assign(`/tiang/${pole.id}`)
}

/* Satu baris tugas: ketuk isi kartu untuk buka detail lokasi,
   ketuk "Catat progres" untuk mencatat langsung di sini tanpa
   pindah halaman. */
function TugasRow({ pole, defaultOpen = false, onSaved = null }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const status = statusFor(pole)
  const progress = pole.progressPercent ?? 0

  return (
    <div className="rounded-card border border-neutral-200 bg-paper">
      <button
        type="button"
        onClick={() => openPole(pole)}
        className="block w-full p-3.5 text-left transition-colors hover:bg-canvas/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {pole.poleCode}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-neutral-500">
              {pole.address || 'Alamat belum diisi'}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge size="sm" status={status} />

            {pole.isOverdue && (
              <Badge
                size="sm"
                className="bg-rose-50 text-rose-700 ring-rose-600/20"
              >
                Terlambat
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-2.5">
          <ProgressBar
            value={progress}
            size="xs"
            tone={status.key}
            label="Progress"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {pole.region?.name ?? pole.projectName ?? '—'}
          </span>

          {pole.dueDate && (
            <span className={cn(
              'inline-flex items-center gap-1',
              pole.isOverdue && 'font-medium text-rose-600'
            )}>
              <CalendarClock className="h-3 w-3" />
              Tenggat {formatDate(pole.dueDate)}
            </span>
          )}

          {pole.assignedUsers.length > 1 && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {pole.assignedUsers.map((user) => user.name).join(', ')}
            </span>
          )}
        </div>
      </button>

      <div className="border-t border-neutral-100 px-3.5 pb-3.5 pt-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Catat progres
          <ChevronDown
            className={cn(
              'h-4 w-4 text-neutral-400 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        {open && (
          <TaskProgressForm
            projectId={pole.projectId}
            pole={pole}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  )
}

function TugasSayaContent() {
  const searchParams = useSearchParams()
  const openPoleId = searchParams?.get('lokasi')
  const openProjectId = searchParams?.get('proyek')

  const loader = useCallback(
    async () => await api.myAssignedPoles({ cache: 'no-store' }),
    []
  )

  const {
    data: payload,
    error,
    loading,
    reload,
  } = useResource(loader, [])

  const poles = useMemo(
    () => unwrapList(payload).map(normalizePole),
    [payload]
  )

  const counts = useMemo(() => {
    const result = { total: poles.length, belum: 0, berjalan: 0, selesai: 0, terlambat: 0 }

    for (const pole of poles) {
      if (pole.statusKey === 'selesai') result.selesai += 1
      else if (pole.statusKey === 'jalan') result.berjalan += 1
      else result.belum += 1

      if (pole.isOverdue) result.terlambat += 1
    }

    return result
  }, [poles])

  /* Dikelompokkan per proyek supaya PIC yang pegang beberapa proyek
     tetap mudah menelusuri tugasnya. */
  const groups = useMemo(() => {
    const map = new Map()

    for (const pole of poles) {
      const key = pole.projectId ? String(pole.projectId) : '__none__'

      if (!map.has(key)) {
        map.set(key, { key, name: pole.projectName ?? 'Tanpa Proyek', poles: [] })
      }

      map.get(key).poles.push(pole)
    }

    return [...map.values()]
  }, [poles])

  return (
    <div className="space-y-3">
      <PageHeader
        title="Tugas saya"
        actions={
          <ActionButton onClick={reload} icon={RefreshCw}>
            Muat ulang
          </ActionButton>
        }
      />

      <StatCardGrid>
        <StatCard
          label="Total Tugas"
          value={loading ? '…' : formatNumber(counts.total)}
          hint="Lokasi yang ditugaskan ke Anda"
          Icon={ListChecks}
        />

        <StatCard
          label="Belum Mulai"
          value={loading ? '…' : formatNumber(counts.belum)}
          hint="Progress 0%"
          Icon={CircleDot}
          tone="blue"
        />

        <StatCard
          label="Berjalan"
          value={loading ? '…' : formatNumber(counts.berjalan)}
          hint="Progress 1–99%"
          Icon={CircleDot}
          tone="amber"
        />

        <StatCard
          label="Selesai"
          value={loading ? '…' : formatNumber(counts.selesai)}
          hint="Progress 100%"
          Icon={CircleCheck}
          tone="emerald"
        />

        <StatCard
          label="Terlambat"
          value={loading ? '…' : formatNumber(counts.terlambat)}
          hint="Tenggat lewat & belum selesai"
          Icon={CircleAlert}
          tone="rose"
        />
      </StatCardGrid>

      {error && (
        <ErrorNotice
          error={error}
          onRetry={reload}
          title="Tugas belum dapat dimuat"
        />
      )}

      {loading ? (
        <Card>
          <CardContent>
            <SkeletonRows rows={4} />
          </CardContent>
        </Card>
      ) : poles.length ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100">
                    <MapPin className="h-4 w-4" />
                  </div>

                  <div>
                    <CardTitle>{group.name}</CardTitle>
                    <p className="text-xs text-neutral-500">
                      {formatNumber(group.poles.length)} lokasi ditugaskan ke Anda
                    </p>
                  </div>
                </div>

                <Badge
                  size="sm"
                  className="bg-neutral-100 text-neutral-600 ring-neutral-500/20"
                >
                  {formatPercent(
                    group.poles.length
                      ? group.poles.reduce((sum, pole) => sum + (pole.progressPercent ?? 0), 0) / group.poles.length
                      : 0,
                    0
                  )}
                </Badge>
              </CardHeader>

              <CardContent className="space-y-2.5">
                {group.poles.map((pole) => (
                  <TugasRow
                    key={pole.id}
                    pole={pole}
                    defaultOpen={openPoleId != null && String(pole.id) === openPoleId}
                    onSaved={reload}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Belum ada tugas"
          description="Lokasi yang ditugaskan ke Anda akan muncul di sini. Minta supervisor menugaskan lokasi ke Anda dari halaman detail lokasi."
          action={
            <ActionButton onClick={reload} icon={RefreshCw}>
              Periksa kembali
            </ActionButton>
          }
        />
      )}

      <QuantityTasks initialOpenProjectId={openProjectId} />
    </div>
  )
}

export default function TugasSayaPage() {
  return (
    <AppShell title="Tugas saya">
      <TugasSayaContent />
    </AppShell>
  )
}
