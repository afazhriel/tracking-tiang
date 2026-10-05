/**
 * Formatter tunggal untuk seluruh halaman.
 * Semua fungsi aman dipanggil dengan nilai null/undefined
 * dan akan mengembalikan placeholder, bukan angka palsu.
 */

export const EMPTY_VALUE = '—'

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

export function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const number = Number(value)

  if (!Number.isFinite(number)) return EMPTY_VALUE

  return number.toLocaleString('id-ID', options)
}

export function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const number = Number(value)

  if (!Number.isFinite(number)) return EMPTY_VALUE

  return number.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const number = Number(value)

  if (!Number.isFinite(number)) return EMPTY_VALUE

  return `${formatDecimal(number, digits)}%`
}

export function formatSignedPercent(value, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const number = Number(value)

  if (!Number.isFinite(number)) return EMPTY_VALUE

  const prefix = number > 0 ? '+' : ''

  return `${prefix}${formatDecimal(number, digits)}%`
}

function toDate(value) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateShort(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1
  ).padStart(2, '0')}/${date.getFullYear()}`
}

export function formatChartDate(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  return `${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatTime(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  return `${formatDate(date)} · ${formatTime(date)}`
}

export function formatRelativeTime(value) {
  const date = toDate(value)

  if (!date) return EMPTY_VALUE

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60000)

  if (Math.abs(diffMinutes) < 1) return 'Baru saja'
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)} menit lalu`

  const diffHours = Math.round(diffMinutes / 60)

  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)} jam lalu`

  const diffDays = Math.round(diffHours / 24)

  if (Math.abs(diffDays) < 30) return `${Math.abs(diffDays)} hari lalu`

  return formatDate(date)
}

export function formatPeriod(startDate, endDate) {
  const start = toDate(startDate)
  const end = toDate(endDate)

  if (!start || !end) return EMPTY_VALUE

  return `${formatDate(start)} — ${formatDate(end)}`
}

export function formatDays(value) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const days = Number(value)

  if (!Number.isFinite(days)) return EMPTY_VALUE

  return `${formatNumber(days)} hari`
}

export function formatCoordinate(value, digits = 7) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE
  }

  const number = Number(value)

  if (!Number.isFinite(number)) return EMPTY_VALUE

  return number.toFixed(digits)
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function clampPercent(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 0

  return Math.min(100, Math.max(0, number))
}