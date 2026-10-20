'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Camera,
  CircleAlert,
  ClipboardList,
  MapPin,
  RefreshCw,
  User,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { detailHref } from '../../lib/native'
import { useProject } from '../../lib/project-context'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { FilterBar, SelectField } from '../../components/ui/form-controls'
import { ProgressBar } from '../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ErrorNotice, SkeletonRows } from '../../components/ui/states'
import { api, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from '../../lib/format'

/**
 * Normalisasi aktivitas.
 *
 * BACKEND BELUM memiliki endpoint aktivitas. Loader tetap memanggil
 * endpointkonvensionaal sehingga halaman langsung hidup ketika
 * endpoint ditambahkan - tanpa mengubah backend.
 */
function normalizeActivity(item, index) {
  return {
    id: item?.id ?? `activity-${index}`,
    createdAt:
      item?.created_at ?? item?.recorded_at ?? item?.timestamp ?? item?.date ?? null,
    user:
      item?.user?.name ??
      item?.recorded_by?.name ??
      item?.updated_by?.name ??
      item?.user_name ??
      null,
    poleId: item?.pole_id ?? item?.pole?.id ?? null,
    poleCode: item?.pole?.pole_code ?? item?.pole_code ?? null,
    workItem: item?.work_item?.name ?? item?.work_item_name ?? null,
    title: item?.title ?? item?.action ?? item?.type ?? null,
    note: item?.notes ?? item?.note ?? item?.description ?? null,
    progress:
      item?.progress_percent === undefined || item?.progress_percent === null
        ? null
        : Number(item.progress_percent),
    photos: Array.isArray(item?.photos)
      ? item.photos
      : Array.isArray(item?.documentation)
        ? item.documentation
        : [],
  }
}

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'progress', label: 'Progress' },
  { value: 'note', label: 'Catatan' },
  { value: 'photo', label: 'Foto' },
  { value: 'other', label: 'Lainnya' },
]

function detectType(activity) {
  if (activity.photos.length) return 'photo'
  if (activity.progress !== null) return 'progress'
  if (activity.note) return 'note'

  return 'other'
}

const TYPE_META = {
  progress: { label: 'Progress', Icon: ClipboardList, className: 'bg-blue-50 text-blue-600' },
  note: { label: 'Catatan', Icon: Activity, className: 'bg-neutral-100 text-neutral-600' },
  photo: { label: 'Dokumentasi', Icon: Camera, className: 'bg-emerald-50 text-emerald-600' },
  other: { label: 'Lainnya', Icon: CircleAlert, className: 'bg-amber-50 text-amber-600' },
}

function ActivityRow({ activity }) {
  const type = detectType(activity)
  const meta = TYPE_META[type]
  const Icon = meta.Icon

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute left-[1.15rem] top-9 h-[calc(100%-2.25rem)] w-px bg-neutral-200 last:hidden"
      />

      <span
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.className}`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 rounded-card border border-neutral-200 bg-paper p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              {activity.title || meta.label}
            </p>

            <p className="mt-1 text-xs text-neutral-500">
              {activity.workItem ? `${activity.workItem} · ` : ''}
              {formatRelativeTime(activity.createdAt)}
            </p>
          </div>

          <Badge
            size="sm"
            className="bg-neutral-100 text-neutral-500 ring-neutral-500/20"
          >
            {meta.label}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {activity.user ?? 'Tidak diketahui'}
          </span>

          {activity.poleId ? (
            <Link
              href={detailHref('/tiang', activity.poleId)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-neutral-800"
            >
              <MapPin className="h-3.5 w-3.5" />
              {activity.poleCode ?? `Tiang #${activity.poleId}`}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-neutral-400">
              <MapPin className="h-3.5 w-3.5" />
              Tanpa tiang
            </span>
          )}

          {activity.createdAt && (
            <span className="text-neutral-400">
              {formatDateTime(activity.createdAt)}
            </span>
          )}
        </div>

        {activity.note && (
          <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs leading-5 text-neutral-600">
            {activity.note}
          </p>
        )}

        {activity.progress !== null && (
          <div className="mt-3">
            <ProgressBar
              value={activity.progress}
              size="xs"
              label="Progress"
            />
          </div>
        )}

        {activity.photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activity.photos.map((photo, index) => {
              const src = typeof photo === 'string' ? photo : photo?.url ?? photo?.path

              return src ? (
                <img
                  key={index}
                  src={src}
                  alt={`Dokumentasi ${index + 1}`}
                  className="h-20 w-20 rounded-xl border border-neutral-200 object-cover"
                />
              ) : null
            })}
          </div>
        )}
      </div>
    </li>
  )
}

function AktivitasContent() {
  const { projectId, error: projectError } = useProject()

  const [userFilter, setUserFilter] = useState('all')
  const [poleFilter, setPoleFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  /* "Sekarang" diambil sekali saat mount supaya filter periode
     konsisten dan tidak memanggil Date.now() pada setiap render. */
  const [referenceNow] = useState(() => Date.now())

  const activitiesLoader = useCallback(
    async () => (projectId ? await api.listActivities(projectId) : null),
    [projectId]
  )

  const {
    data,
    error,
    loading,
    reload,
  } = useResource(activitiesLoader, [projectId], { enabled: Boolean(projectId) })

  const activities = useMemo(
    () => unwrapList(data).map(normalizeActivity),
    [data]
  )

  const users = useMemo(
    () =>
      Array.from(
        new Set(
          activities
            .map((activity) => activity.user)
            .filter(Boolean)
        )
      ),
    [activities]
  )

  const poles = useMemo(() => {
    const map = new Map()

    for (const activity of activities) {
      if (activity.poleId) {
        map.set(String(activity.poleId), activity.poleCode ?? `#${activity.poleId}`)
      }
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [activities])

  const filtered = useMemo(() => {
    const today = new Date(referenceNow)
    const weekAgo = new Date(referenceNow - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(referenceNow - 30 * 24 * 60 * 60 * 1000)

    return activities.filter((activity) => {
      if (userFilter !== 'all' && activity.user !== userFilter) return false
      if (poleFilter !== 'all' && String(activity.poleId) !== poleFilter) return false
      if (typeFilter !== 'all' && detectType(activity) !== typeFilter) return false

      if (dateFilter !== 'all') {
        if (!activity.createdAt) return false

        const date = new Date(activity.createdAt)

        if (Number.isNaN(date.getTime())) return false

        if (dateFilter === 'today') {
          return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
          )
        }

        if (dateFilter === 'week') return date >= weekAgo
        if (dateFilter === 'month') return date >= monthAgo
      }

      return true
    })
  }, [activities, dateFilter, poleFilter, referenceNow, typeFilter, userFilter])

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)
      ),
    [filtered]
  )

  const endpointMissing = !error && !loading && activities.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Aktivitas"
        subtitle="Riwayat aktivitas dan pembaruan pekerjaan lapangan."
        actions={
          <ActionButton
            onClick={reload}
            icon={RefreshCw}
          >
            Muat ulang
          </ActionButton>
        }
      />

      <StatCardGrid>
        <StatCard
          label="Total Aktivitas"
          value={loading ? '…' : activities.length}
          hint="Data dari endpoint aktivitas"
          Icon={Activity}
        />

        <StatCard
          label="Tergambar"
          value={loading ? '…' : filtered.length}
          hint="Setelah filter diterapkan"
          Icon={ClipboardList}
          tone="blue"
        />

        <StatCard
          label="PIC / User"
          value={loading ? '…' : users.length}
          hint="User pelapor"
          Icon={User}
          tone="amber"
        />

        <StatCard
          label="Tiang Terlibat"
          value={loading ? '…' : poles.length}
          hint="Tiang yang memiliki aktivitas"
          Icon={MapPin}
          tone="emerald"
        />
      </StatCardGrid>

      {(projectError || error) && (
        <ErrorNotice
          error={projectError || error}
          onRetry={reload}
          title="Data aktivitas belum dapat dimuat"
        />
      )}

      <FilterBar>
        <SelectField
          id="activity-date"
          label="Periode"
          value={dateFilter}
          onChange={setDateFilter}
          options={[
            { value: 'today', label: 'Hari Ini' },
            { value: 'week', label: '7 Hari Terakhir' },
            { value: 'month', label: '30 Hari Terakhir' },
          ]}
        />

        <SelectField
          id="activity-user"
          label="User / PIC"
          value={userFilter}
          onChange={setUserFilter}
          options={users.map((user) => ({ value: user, label: user }))}
        />

        <SelectField
          id="activity-pole"
          label="Tiang"
          value={poleFilter}
          onChange={setPoleFilter}
          options={poles}
        />

        <SelectField
          id="activity-type"
          label="Jenis Aktivitas"
          value={typeFilter}
          onChange={setTypeFilter}
          options={ACTIVITY_TYPE_OPTIONS}
        />
      </FilterBar>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <Activity className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Timeline Aktivitas</CardTitle>
              <CardDescription>
                Diurutkan dari yang terbaru
              </CardDescription>
            </div>
          </div>

          <Badge className="bg-neutral-100 text-neutral-500 ring-neutral-500/20">
            {sorted.length} catatan
          </Badge>
        </CardHeader>

        <CardContent>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : sorted.length ? (
            <ul className="space-y-0">
              {sorted.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Activity}
              title={
                endpointMissing
                  ? 'Endpoint aktivitas belum tersedia'
                  : 'Tidak ada aktivitas'
              }
              description={
                endpointMissing
                  ? 'Backend Laravel belum menyediakan endpoint aktivitas lapangan. Struktur filter dan timeline di halaman ini siap digunakan begitu endpoint tersedia — tidak ada data aktivitas yang dibuat di sisi frontend.'
                  : activities.length
                    ? 'Tidak ada aktivitas yang cocok dengan filter yang dipilih.'
                    : 'Belum ada aktivitas lapangan yang tercatat pada project ini.'
              }
              hint={
                endpointMissing ? 'Ready for API integration' : undefined
              }
              action={
                <ActionButton onClick={reload} icon={RefreshCw}>
                  Periksa kembali
                </ActionButton>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catatan Integrasi</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-xs leading-6 text-neutral-500">
          <p>
            Halaman ini memanggil endpoint secara berurutan:{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              /api/projects/{'{id}'}/activities
            </code>
            ,{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              /api/projects/{'{id}'}/activity-logs
            </code>
            , lalu{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              /api/activities
            </code>
            . Jika semuanya 404, halaman menampilkan empty state.
          </p>
          <p>
            Field yang akan dipakai otomatis:{' '}
            <code className="text-[11px] text-neutral-600">
              created_at/recorded_at, user.name, pole.pole_code,
              work_item.name, title/action, notes, progress_percent, photos
            </code>
            .
          </p>
          <p>
            Total aktivitas tercatat:{' '}
            <strong>{activities.length}</strong>
            {activities.length > 0 && ` · terakhir ${formatDate(sorted[0]?.createdAt)}`}
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AktivitasPage() {
  return (
    <AppShell title="Aktivitas">
      <AktivitasContent />
    </AppShell>
  )
}