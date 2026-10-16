'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  Gauge,
  Info,
  RefreshCw,
  Settings,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
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
import { SegmentedTabs } from '../../components/ui/form-controls'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ErrorNotice, SkeletonRows } from '../../components/ui/states'
import { api, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { formatRelativeTime } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * BACKEND BELUM memiliki endpoint notifikasi.
 * Loader mencoba endpoint yang wajar; bila 404 semua, halaman
 * menampilkan empty state (bukan data buatan).
 */
function normalizeNotification(item, index) {
  const readAt = item?.read_at ?? item?.readAt ?? null

  return {
    id: item?.id ?? `notification-${index}`,
    title: item?.title ?? item?.subject ?? 'Notifikasi',
    description:
      item?.description ?? item?.message ?? item?.body ?? null,
    category: String(
      item?.category ?? item?.type ?? item?.kind ?? 'sistem'
    ).toLowerCase(),
    createdAt:
      item?.created_at ?? item?.createdAt ?? item?.timestamp ?? null,
    readAt,
    isRead: Boolean(readAt) || item?.is_read === true || item?.read === true,
    href: item?.href ?? item?.url ?? null,
  }
}

const CATEGORY_META = {
  progress: { label: 'Progress', Icon: Gauge, className: 'bg-blue-50 text-blue-600' },
  aktivitas: { label: 'Aktivitas', Icon: Activity, className: 'bg-neutral-100 text-neutral-600' },
  activity: { label: 'Aktivitas', Icon: Activity, className: 'bg-neutral-100 text-neutral-600' },
  sistem: { label: 'Sistem', Icon: Settings, className: 'bg-amber-50 text-amber-600' },
  system: { label: 'Sistem', Icon: Settings, className: 'bg-amber-50 text-amber-600' },
  warning: { label: 'Peringatan', Icon: CircleAlert, className: 'bg-rose-50 text-rose-600' },
}

function getCategoryMeta(category) {
  return (
    CATEGORY_META[category] || {
      label: 'Umum',
      Icon: Bell,
      className: 'bg-neutral-100 text-neutral-600',
    }
  )
}

function NotificationCard({ notification }) {
  const meta = getCategoryMeta(notification.category)
  const Icon = meta.Icon

  const Wrapper = notification.href ? Link : 'div'
  const wrapperProps = notification.href ? { href: notification.href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        'flex gap-4 rounded-card border p-4 transition-colors',
        notification.isRead
          ? 'border-neutral-200 bg-paper'
          : 'border-neutral-300 bg-canvas',
        notification.href && 'hover:border-neutral-400'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          meta.className
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm',
              notification.isRead
                ? 'font-medium text-neutral-700'
                : 'font-semibold text-neutral-900'
            )}
          >
            {notification.title}
          </p>

          <div className="flex items-center gap-2">
            <Badge
              size="sm"
              className="bg-neutral-100 text-neutral-500 ring-neutral-500/20"
            >
              {meta.label}
            </Badge>

            <Badge
              size="sm"
              className={
                notification.isRead
                  ? 'bg-neutral-100 text-neutral-500 ring-neutral-500/20'
                  : 'bg-neutral-900 text-white ring-neutral-900/20'
              }
            >
              {notification.isRead ? 'Dibaca' : 'Belum dibaca'}
            </Badge>
          </div>
        </div>

        {notification.description && (
          <p className="mt-1.5 text-xs leading-5 text-neutral-500">
            {notification.description}
          </p>
        )}

        <p className="mt-2 text-[11px] text-neutral-400">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </Wrapper>
  )
}

function NotifikasiContent() {
  const { projectId, error: projectError } = useProject()
  const [category, setCategory] = useState('all')

  const notificationsLoader = useCallback(
    async () => (projectId ? await api.listNotifications(projectId) : null),
    [projectId]
  )

  const {
    data,
    error,
    loading,
    reload,
  } = useResource(notificationsLoader, [projectId], { enabled: Boolean(projectId) })

  const notifications = useMemo(
    () => unwrapList(data).map(normalizeNotification),
    [data]
  )

  const unreadCount = notifications.filter((item) => !item.isRead).length

  const counts = useMemo(() => {
    const result = { all: notifications.length, unread: unreadCount }

    for (const item of notifications) {
      const key = CATEGORY_META[item.category]
        ? item.category === 'activity'
          ? 'aktivitas'
          : item.category === 'system'
            ? 'sistem'
            : item.category
        : 'other'

      result[key] = (result[key] ?? 0) + 1
    }

    return result
  }, [notifications, unreadCount])

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'Semua', count: counts.all },
      { value: 'unread', label: 'Belum dibaca', count: counts.unread },
      { value: 'progress', label: 'Progress', count: counts.progress ?? 0 },
      { value: 'aktivitas', label: 'Aktivitas', count: counts.aktivitas ?? 0 },
      { value: 'sistem', label: 'Sistem', count: counts.sistem ?? 0 },
    ],
    [counts]
  )

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      if (category === 'all') return true
      if (category === 'unread') return !item.isRead

      const normalized =
        item.category === 'activity'
          ? 'aktivitas'
          : item.category === 'system'
            ? 'sistem'
            : item.category

      return normalized === category
    })
  }, [category, notifications])

  const endpointMissing = !error && !loading && notifications.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistem"
        title="Notifikasi"
        subtitle="Pemberitahuan progress, aktivitas lapangan, dan informasi sistem."
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
          label="Total Notifikasi"
          value={loading ? '…' : notifications.length}
          hint="Data dari endpoint notifikasi"
          Icon={Bell}
        />

        <StatCard
          label="Belum Dibaca"
          value={loading ? '…' : unreadCount}
          hint="Perlu ditinjau"
          Icon={Info}
          tone="blue"
        />

        <StatCard
          label="Kategori"
          value={loading ? '…' : Object.keys(CATEGORY_META).length}
          hint="Jenis notifikasi yang didukung"
          Icon={Gauge}
          tone="amber"
        />

        <StatCard
          label="Status Integrasi"
          value={loading ? '…' : endpointMissing ? 'Belum tersedia' : 'Terhubung'}
          hint={endpointMissing ? 'Menunggu endpoint backend' : 'Endpoint aktif'}
          Icon={endpointMissing ? BellOff : CheckCheck}
          tone={endpointMissing ? 'rose' : 'emerald'}
        />
      </StatCardGrid>

      {(projectError || error) && (
        <ErrorNotice
          error={projectError || error}
          onRetry={reload}
          title="Data notifikasi belum dapat dimuat"
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <Bell className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Kotak Notifikasi</CardTitle>
              <CardDescription>
                Dikelompokkan berdasarkan kategori
              </CardDescription>
            </div>
          </div>

          <SegmentedTabs
            items={tabs}
            value={category}
            onChange={setCategory}
          />
        </CardHeader>

        <CardContent>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : filtered.length ? (
            <div className="space-y-3">
              {filtered.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BellOff}
              title={
                endpointMissing
                  ? 'Endpoint notifikasi belum tersedia'
                  : category === 'unread'
                    ? 'Tidak ada notifikasi belum dibaca'
                    : 'Tidak ada notifikasi'
              }
              description={
                endpointMissing
                  ? 'Backend Laravel belum menyediakan endpoint notifikasi. Struktur UI ini sudah siap dihubungkan: kartu notifikasi mendukung ikon, judul, deskripsi, timestamp, serta status read/unread.'
                  : 'Belum ada notifikasi pada kategori yang dipilih.'
              }
              hint={endpointMissing ? 'Ready for API integration' : undefined}
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
          <CardTitle>Kontrak Integrasi</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-xs leading-6 text-neutral-500">
          <p>
            Halaman mencoba endpoint berurutan:{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              /api/notifications
            </code>
            , lalu{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              /api/projects/{'{id}'}/notifications
            </code>
            . Bila semuanya 404, halaman menampilkan empty state.
          </p>
          <p>
            Field yang dibaca otomatis:{' '}
            <code className="text-[11px] text-neutral-600">
              title, description/message, category, created_at, read_at
            </code>
            . Kategori yang dikenali:{' '}
            <strong>progress</strong>, <strong>aktivitas</strong>,{' '}
            <strong>sistem</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function NotifikasiPage() {
  return (
    <AppShell title="Notifikasi">
      <NotifikasiContent />
    </AppShell>
  )
}