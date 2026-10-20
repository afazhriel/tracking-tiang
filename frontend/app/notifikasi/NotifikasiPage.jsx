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

function NotificationCard({ notification, onMarkRead, marking }) {
  const meta = getCategoryMeta(notification.category)
  const Icon = meta.Icon

  return (
    <div
      className={cn(
        'flex gap-4 rounded-card border p-4 transition-colors',
        notification.isRead
          ? 'border-neutral-200 bg-paper'
          : 'border-neutral-300 bg-canvas'
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-400">
            {formatRelativeTime(notification.createdAt)}
          </p>

          <div className="flex items-center gap-2">
            {notification.href && (
              <Link
                href={notification.href}
                className="text-[11px] font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                Buka
              </Link>
            )}

            {!notification.isRead && onMarkRead && (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                disabled={marking}
                className="text-[11px] font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline disabled:opacity-50"
              >
                {marking ? 'Menandai...' : 'Tandai dibaca'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NotifikasiContent() {
  const { projectId, error: projectError } = useProject()
  const [category, setCategory] = useState('all')
  const [markingId, setMarkingId] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [actionError, setActionError] = useState(null)

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

  const handleMarkRead = useCallback(
    async (id) => {
      setMarkingId(id)
      setActionError(null)

      try {
        await api.markNotificationRead(id)
        setMarkingId(null)
        reload()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tracking_tiang:notifications-updated'))
        }
      } catch (err) {
        setActionError(err)
        setMarkingId(null)
      }
    },
    [reload]
  )

  const handleMarkAll = useCallback(async () => {
    setMarkingAll(true)
    setActionError(null)

    try {
      await api.markAllNotificationsRead()
      setMarkingAll(false)
      reload()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tracking_tiang:notifications-updated'))
      }
    } catch (err) {
      setActionError(err)
      setMarkingAll(false)
    }
  }, [reload])

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistem"
        title="Notifikasi"
        subtitle="Pemberitahuan progress, aktivitas lapangan, dan informasi sistem."
        actions={
          <>
            <ActionButton
              onClick={handleMarkAll}
              icon={CheckCheck}
              disabled={markingAll || loading || unreadCount === 0}
            >
              {markingAll ? 'Memproses...' : 'Tandai semua dibaca'}
            </ActionButton>

            <ActionButton onClick={reload} icon={RefreshCw}>
              Muat ulang
            </ActionButton>
          </>
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
          value={loading ? '…' : 'Terhubung'}
          hint="Endpoint /api/notifications aktif"
          Icon={CheckCheck}
          tone="emerald"
        />
      </StatCardGrid>

      {(projectError || error || actionError) && (
        <ErrorNotice
          error={projectError || error || actionError}
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
                  onMarkRead={handleMarkRead}
                  marking={markingId === notification.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BellOff}
              title={
                category === 'unread'
                  ? 'Tidak ada notifikasi belum dibaca'
                  : 'Tidak ada notifikasi'
              }
              description="Belum ada notifikasi pada kategori yang dipilih."
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
            Daftar notifikasi diambil dari{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              GET /api/notifications
            </code>
            . Jumlah belum dibaca dari{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              GET /api/notifications/unread-count
            </code>
            .
          </p>
          <p>
            Menandai satu notifikasi:{' '}
            <code className="text-[11px] text-neutral-600">
              POST /api/notifications/{'{id}'}/read
            </code>
            . Menandai semua:{' '}
            <code className="text-[11px] text-neutral-600">
              POST /api/notifications/read-all
            </code>
            .
          </p>
          <p>
            Field yang dibaca otomatis:{' '}
            <code className="text-[11px] text-neutral-600">
              title, description, category, created_at, read_at
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