'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Layers,
  MapPin,
  RefreshCw,
  Upload,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import MapPanel from '../../components/tiang/MapPanel'
import { Badge, StatusBadge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import {
  FilterBar,
  SearchInput,
  SelectField,
} from '../../components/ui/form-controls'
import { Pagination } from '../../components/ui/pagination'
import { ProgressBar } from '../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ErrorNotice, SkeletonRows, Spinner } from '../../components/ui/states'
import { api, normalizePole, unwrapList } from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'
import { useProgressSync } from '../../lib/use-progress-sync'
import { useResource } from '../../lib/use-api'
import {
  STATUS_FILTER_OPTIONS,
  PROGRESS_FILTER_OPTIONS,
  matchProgressBucket,
  resolveStatus,
} from '../../lib/status'
import {
  formatCoordinate,
  formatNumber,
  formatPercent,
} from '../../lib/format'
import { cn } from '../../lib/utils'
import { CreatePoleButton, CreatePoleModal } from '../../components/tiang/CreatePoleModal'
import { ImportPolesModal } from '../../components/tiang/ImportPolesModal'

/* Sama dengan `paginate(100)` di `PoleController@index`. */
const PER_PAGE = 100

function PoleListItem({ pole, isSelected, progress, loading, onSelect }) {
  const status = resolveStatus(pole.status, progress)

  return (
    <button
      type="button"
      onClick={() => onSelect(pole)}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'w-full rounded-card border p-4 text-left transition-colors',
        isSelected
          ? 'border-neutral-900 bg-canvas'
          : 'border-neutral-200 bg-paper hover:border-neutral-300 hover:bg-canvas/70'
      )}
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

        <StatusBadge
          size="sm"
          status={status}
        />
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {pole.region?.name ?? 'Tanpa wilayah'}
        </span>

        {pole.hasCoordinate ? (
          <span className="tabular-nums">
            {formatCoordinate(pole.latitude, 5)}, {formatCoordinate(pole.longitude, 5)}
          </span>
        ) : (
          <span>Koordinat belum ada</span>
        )}
      </div>

      <div className="mt-3">
        {loading ? (
          <span className="flex items-center gap-2 text-[11px] text-neutral-400">
            <Spinner className="h-3 w-3" />
            Memuat progress...
          </span>
        ) : (
          <ProgressBar
            value={progress}
            size="xs"
            tone={status.key}
            label="Progress"
          />
        )}
      </div>
    </button>
  )
}

function PoleSelectionCard({ pole, progressEntry, loading, onReload }) {
  if (!pole) {
    return (
      <Card>
        <CardContent className="py-6">
          <EmptyState
            icon={MapPin}
            compact
            title="Belum ada tiang dipilih"
            description="Klik salah satu tiang pada daftar atau marker di peta untuk melihat ringkasan detail."
          />
        </CardContent>
      </Card>
    )
  }

  const progress = progressEntry?.weighted ?? null
  const status = resolveStatus(pole.status, progress)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{pole.poleCode}</CardTitle>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {pole.address || 'Alamat belum diisi'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={status} />

          <button
            type="button"
            onClick={onReload}
            aria-label="Muat ulang progress"
            title="Muat ulang progress"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-canvas"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-neutral-400">Latitude</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {formatCoordinate(pole.latitude)}
            </p>
          </div>

          <div className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-neutral-400">Longitude</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {formatCoordinate(pole.longitude)}
            </p>
          </div>

          <div className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-neutral-400">Wilayah</p>
            <p className="mt-0.5 text-sm font-medium">
              {pole.region?.name ?? 'â€”'}
            </p>
          </div>

          <div className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-neutral-400">Progress (bobot)</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {loading ? 'â€¦' : formatPercent(progress)}
            </p>
          </div>
        </div>

        {progressEntry?.items?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              Progress per pekerjaan
            </p>

            {progressEntry.items.map((item) => (
              <div key={item.id ?? item.workItemId}>
                <ProgressBar
                  value={item.progress}
                  size="xs"
                  label={item.workItem?.name ?? `Item #${item.workItemId}`}
                  showLabel
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-xs text-neutral-500">
            {loading
              ? 'Memuat data progress...'
              : 'Belum ada data progress untuk tiang ini.'}
          </p>
        )}

        <Link
          href={`/tiang/${pole.id}`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Lihat Detail
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  )
}

function TiangContent() {
  const { project, projectId, error: projectError } = useProject()

  const currentUser = useCurrentUser()
  const isAdmin = currentUser?.role === 'admin'

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [progressFilter, setProgressFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  /* `per_page` mengikuti default backend (100). Mengirimnya eksplisit
     membuat batas ini terlihat di satu tempat, dan mencegah server
     diam-diam mengembalikan seluruh 1.500 titik sekaligus. */
  const polesLoader = useCallback(
    async () =>
      projectId
        ? await api.listPoles(projectId, {
            page,
            perPage: PER_PAGE,
            cache: 'no-store',
          })
        : null,
    [projectId, page]
  )

  const {
    data: polesPayload,
    error: polesError,
    loading: polesLoading,
    reload: reloadPoles,
  } = useResource(polesLoader, [projectId, page], { enabled: Boolean(projectId) })

  const poles = useMemo(
    () => unwrapList(polesPayload).map(normalizePole),
    [polesPayload]
  )

  const meta = polesPayload?.meta ?? null

  /* Filter wilayah dibangun dari project detail, bukan dari tiang yang
     kebetulan ada di halaman ini â€” supaya pilihan filter tidak berubah
     saat pindah halaman. */
  const regions = useMemo(() => {
    return (project?.regions ?? []).map((region) => ({
      value: String(region.id),
      label: region.code ? `${region.code} Â· ${region.name}` : region.name,
    }))
  }, [project?.regions])

  const {
    store,
    loadOne,
    running,
    progressInfo,
    weightedProgress,
    isLoaded,
  } = useProgressSync(projectId)

  const selectPole = useCallback(
    (pole) => {
      setSelectedId(pole.id)

      if (!isLoaded(pole.id)) {
        loadOne(pole.id).catch(() => {})
      }
    },
    [isLoaded, loadOne]
  )

  /* Filter yang berubah tidak pernah meninggalkan halaman di luar
     jangkauan â€” hasilnya akan kosong dan terlihat seperti bug. */
  function resetToFirstPage() {
    setPage(1)
  }

  /* Selected pole diturunkan (tidak disimpan lewat effect) supaya
     selalu konsisten dengan daftar yang sedang tampil. */
  const selectedPole = useMemo(
    () => poles.find((pole) => pole.id === selectedId) ?? poles[0] ?? null,
    [poles, selectedId]
  )

  const effectiveSelectedId = selectedPole?.id ?? null

  /* Progress untuk tiang terpilih dimuat otomatis (bukan data palsu). */
  useEffect(() => {
    if (effectiveSelectedId === null) return
    if (isLoaded(effectiveSelectedId)) return

    loadOne(effectiveSelectedId).catch(() => {})
  }, [effectiveSelectedId, isLoaded, loadOne])

  const progressByPole = useMemo(() => {
    const result = {}

    for (const pole of poles) {
      result[pole.id] = weightedProgress(pole.id)
    }

    return result
  }, [poles, weightedProgress])

  const filteredPoles = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return poles.filter((pole) => {
      if (keyword) {
        const haystack = `${pole.poleCode} ${pole.address ?? ''}`.toLowerCase()

        if (!haystack.includes(keyword)) return false
      }

      if (regionFilter !== 'all' && String(pole.regionId) !== regionFilter) return false

      const progress = weightedProgress(pole.id)
      const status = resolveStatus(pole.status, progress)

      if (statusFilter !== 'all' && status.key !== statusFilter) return false
      if (!matchProgressBucket(progress, progressFilter)) return false

      return true
    })
  }, [poles, progressFilter, regionFilter, search, statusFilter, weightedProgress])

  const counts = useMemo(() => {
    const result = { total: 0, active: 0, done: 0, issue: 0 }

    for (const pole of poles) {
      const progress = weightedProgress(pole.id)
      const status = resolveStatus(pole.status, progress)

      result.total += 1
      if (status.key === 'active') result.active += 1
      if (status.key === 'done') result.done += 1
      if (status.key === 'issue') result.issue += 1
    }

    return result
  }, [poles, weightedProgress])

  const totalRegistered = meta?.total ?? null
  const scopeHint =
    totalRegistered && totalRegistered > poles.length
      ? `dari ${formatNumber(totalRegistered)} titik terdaftar`
      : null

  const coordinatesCount = useMemo(
    () => poles.filter((pole) => pole.hasCoordinate).length,
    [poles]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring Tiang"
        subtitle="Pantau lokasi, identitas, dan progres setiap titik tiang."
actions={
          <>
            {isAdmin && (
              <>
                <CreatePoleButton
                  onClick={() => setCreateOpen(true)}
                  disabled={polesLoading || !projectId}
                />

                <ActionButton
                  onClick={() => setImportOpen(true)}
                  icon={Upload}
                >
                  Import CSV
                </ActionButton>
              </>
            )}

            <ActionButton
              href="/kurva-s"
              icon={Layers}
            >
              Kurva S
            </ActionButton>
            <ActionButton
              onClick={() => {
                reloadPoles()

                if (effectiveSelectedId !== null) loadOne(effectiveSelectedId).catch(() => {})
              }}
              icon={RefreshCw}
            >
              Muat ulang
            </ActionButton>
          </>
        }
      />

      <StatCardGrid>
        <StatCard
          label="Total Tiang"
          value={polesLoading ? 'â€¦' : formatNumber(totalRegistered ?? counts.total)}
          hint={scopeHint ?? 'Tiap yang terdaftar pada project'}
          Icon={MapPin}
        />

        <StatCard
          label="Tiang Aktif"
          value={polesLoading ? 'â€¦' : formatNumber(counts.active)}
          hint={scopeHint ?? 'Sedang dikerjakan'}
          Icon={CircleDot}
          tone="blue"
        />

        <StatCard
          label="Tiang Selesai"
          value={polesLoading ? 'â€¦' : formatNumber(counts.done)}
          hint={scopeHint ?? 'Progress 100%'}
          Icon={CircleCheck}
          tone="emerald"
        />

        <StatCard
          label="Tiang Bermasalah"
          value={polesLoading ? 'â€¦' : formatNumber(counts.issue)}
          hint={scopeHint ?? 'Perlu perhatian lapangan'}
          Icon={CircleAlert}
          tone="rose"
        />
      </StatCardGrid>

      {(projectError || polesError) && (
        <ErrorNotice
          error={projectError || polesError}
          onRetry={reloadPoles}
          title="Data tiang belum dapat dimuat"
        />
      )}

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            resetToFirstPage()
          }}
          placeholder="Cari kode tiang atau alamat..."
        />

        <SelectField
          id="filter-status"
          label="Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            resetToFirstPage()
          }}
          options={STATUS_FILTER_OPTIONS.filter((option) => option.value !== 'all')}
        />

        <SelectField
          id="filter-region"
          label="Wilayah"
          value={regionFilter}
          onChange={(value) => {
            setRegionFilter(value)
            resetToFirstPage()
          }}
          options={regions}
        />

        <SelectField
          id="filter-progress"
          label="Progress"
          value={progressFilter}
          onChange={(value) => {
            setProgressFilter(value)
            resetToFirstPage()
          }}
          options={PROGRESS_FILTER_OPTIONS.filter((option) => option.value !== 'all')}
        />
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                  <MapPin className="h-4 w-4" />
                </div>

                <div>
                  <CardTitle>Daftar Tiang</CardTitle>
                  <p className="text-xs text-neutral-500">
                    {filteredPoles.length === poles.length
                      ? `${formatNumber(poles.length)} titik pada halaman ini`
                      : `${formatNumber(filteredPoles.length)} dari ${formatNumber(poles.length)} titik cocok`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge size="sm" className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
                  {formatNumber(coordinatesCount)} berkoordinat
                </Badge>

                {running && (
                  <Badge size="sm" className="bg-blue-50 text-blue-700 ring-blue-600/20">
                    <Spinner className="h-3 w-3" />
                    {progressInfo.done}/{progressInfo.total}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {polesLoading ? (
                <SkeletonRows rows={5} />
              ) : polesError ? (
                <EmptyState
                  icon={CircleAlert}
                  compact
                  title="Daftar tiang gagal dimuat"
                  description="Endpoint /api/projects/{id}/poles tidak dapat diakses. Coba muat ulang."
                  action={
                    <ActionButton onClick={reloadPoles} icon={RefreshCw}>
                      Coba lagi
                    </ActionButton>
                  }
                />
              ) : filteredPoles.length ? (
                filteredPoles.map((pole) => (
                  <PoleListItem
                    key={pole.id}
                    pole={pole}
                    isSelected={effectiveSelectedId === pole.id}
                    progress={weightedProgress(pole.id)}
                    loading={store[pole.id] === undefined && effectiveSelectedId === pole.id}
                    onSelect={selectPole}
                  />
                ))
              ) : (
                <EmptyState
                  icon={MapPin}
                  compact
                  title={poles.length ? 'Tidak ada tiang yang cocok' : 'Belum ada data tiang'}
                  description={
                    poles.length
                      ? 'Ubah kata kunci atau filter yang digunakan.'
                      : 'Data tiang akan muncul otomatis setelah endpoint /api/projects/{id}/poles dapat diakses.'
                  }
                />
              )}
            </CardContent>
          </Card>

          {meta && (
            <Pagination
              meta={meta}
              onChange={setPage}
            />
          )}
        </div>

        <div className="order-1 space-y-4 lg:order-2 lg:col-span-7">
          <MapPanel
            className="h-[360px] sm:h-[440px] lg:h-[540px]"
            poles={filteredPoles}
            selectedId={effectiveSelectedId}
            progressByPole={progressByPole}
            onSelect={selectPole}
          />

          <PoleSelectionCard
            pole={selectedPole}
            progressEntry={store[effectiveSelectedId]}
            loading={store[effectiveSelectedId] === undefined && effectiveSelectedId !== null}
            onReload={() => {
              if (effectiveSelectedId !== null) loadOne(effectiveSelectedId).catch(() => {})
            }}
          />
        </div>
      </div>

      <CreatePoleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
        regions={project?.regions ?? []}
        onCreated={async (created) => {
          setPage(1)

          if (created?.id !== undefined) {
            setSelectedId(created.id)
          }

          await reloadPoles()
        }}
      />

      <ImportPolesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        regions={project?.regions ?? []}
      />
    </div>
  )
}

export default function TiangPage() {
  return (
    <AppShell title="Tiang">
      <TiangContent />
    </AppShell>
  )
}


