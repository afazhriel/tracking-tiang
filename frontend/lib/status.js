import { clampPercent } from './format'
import { STATUS_TONE_MAP, tone } from './theme'

/**
 * Resolver status untuk data backend.
 * Nilai `status` pada tabel `poles` bersifat bebas (string),
 * jadi pemetaan dibuat toleran dan aman untuk nilai baru.
 *
 * Warna diambil dari `lib/theme.js`, bukan ditulis ulang di sini,
 * supaya palet aplikasi hanya punya satu sumber kebenaran.
 */

const TONES = Object.fromEntries(
  Object.entries(STATUS_TONE_MAP).map(([key, toneName]) => {
    const resolved = tone(toneName)

    return [
      key,
      {
        badge: resolved.soft,
        dot: resolved.hex,
        bar: resolved.bar,
        hex: resolved.hex,
      },
    ]
  })
)

TONES.done.label = 'Selesai'
TONES.active.label = 'Aktif'
TONES.delayed.label = 'Terlambat'
TONES.issue.label = 'Bermasalah'
TONES.idle.label = 'Belum Mulai'
TONES.unknown.label = 'Tidak Diketahui'

const DONE_KEYWORDS = ['selesai', 'done', 'complete', 'completed', 'finish', 'selesai_100']
const ACTIVE_KEYWORDS = ['aktif', 'active', 'jalan', 'running', 'progress', 'proses', 'proses_berjalan']
const DELAY_KEYWORDS = ['delay', 'terlambat', 'late', 'telat', 'keterlambatan']
const ISSUE_KEYWORDS = ['masalah', 'problem', 'rusak', 'issue', 'kendala', 'gagal', 'failed', 'danger']
const IDLE_KEYWORDS = ['belum', 'pending', 'todo', 'planned', 'rencana', 'draft', 'null']

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function resolveStatus(status, progress = null) {
  const value = normalize(status)

  if (value && DONE_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return { key: 'done', ...TONES.done, raw: status }
  }

  if (value && ISSUE_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return { key: 'issue', ...TONES.issue, raw: status }
  }

  if (value && DELAY_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return { key: 'delayed', ...TONES.delayed, raw: status }
  }

  if (value && ACTIVE_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return { key: 'active', ...TONES.active, raw: status }
  }

  if (value && IDLE_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return { key: 'idle', ...TONES.idle, raw: status }
  }

  if (value) {
    return { key: 'unknown', ...TONES.unknown, raw: status, label: status }
  }

  if (progress === null || progress === undefined) {
    return { key: 'unknown', ...TONES.unknown, raw: null, label: 'Belum ada data' }
  }

  const percent = clampPercent(progress)

  if (percent >= 100) return { key: 'done', ...TONES.done, raw: null }
  if (percent > 0) return { key: 'active', ...TONES.active, raw: null }

  return { key: 'idle', ...TONES.idle, raw: null }
}

/**
 * Status turunan dari sebuah nilai progress (dipakai pada
 * work item & ringkasan, yang tidak punya kolom status).
 */
export function statusFromProgress(progress) {
  return resolveStatus(null, progress)
}

export const STATUS_TONES = TONES

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'done', label: 'Selesai' },
  { value: 'active', label: 'Aktif' },
  { value: 'delayed', label: 'Terlambat' },
  { value: 'issue', label: 'Bermasalah' },
  { value: 'idle', label: 'Belum Mulai' },
]

export const PROGRESS_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Progress' },
  { value: '0-25', label: '0% – 25%' },
  { value: '26-50', label: '26% – 50%' },
  { value: '51-75', label: '51% – 75%' },
  { value: '76-100', label: '76% – 100%' },
]

export function matchProgressBucket(progress, bucket) {
  if (bucket === 'all' || progress === null || progress === undefined) {
    return true
  }

  const percent = clampPercent(progress)
  const [min, max] = bucket.split('-').map(Number)

  return percent >= min && percent <= max
}