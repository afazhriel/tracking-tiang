/**
 * =========================================================
 * API CLIENT - TRACKING TIANG
 * ------------------------------------------------------------
 * Satu-satunya tempat frontend melakukan request ke backend.
 *
 * - Base URL memakai proxy rewrite Next.js yang SUDAH ADA
 *   (`/api/*` -> http://187.77.112.247/api/*` pada next.config.mjs).
 * - Auth token tetap memakai key yang sudah dipakai login page:
 *   `tracking_tiang_token` (di Circuit via header Authorization: Bearer).
 * - Tidak ada base URL hardcoded di halaman mana pun.
 * =========================================================
 */

export const TOKEN_KEY = 'tracking_tiang_token'
export const USER_KEY = 'tracking_tiang_user'
export const AUTH_CHANGED_EVENT = 'tracking_tiang:auth-changed'

export class ApiError extends Error {
  constructor(message, { status = 0, url = '', cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.cause = cause
  }

  get isNetworkError() {
    return this.status === 0
  }

  get isNotFound() {
    return this.status === 404
  }
}

export function getToken() {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(USER_KEY)

    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearAuth() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
  } catch {
    /* storage tidak tersedia - abaikan */
  }

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/api')) return path

  return `/api/${path.replace(/^\/+/, '')}`
}

/**
 * Request inti. Melempar ApiError agar setiap halaman bisa
 * membedakan kondisi: gagal jaringan vs endpoint belum ada.
 */
export async function apiRequest(
  path,
  { method = 'GET', body, signal, headers = {}, auth = true } = {}
) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  }

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()

    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`
    }
  }

  const url = buildUrl(path)

  let response

  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error

    throw new ApiError(
      'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
      { status: 0, url, cause: error }
    )
  }

  if (response.status === 204) return null

  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || `Permintaan gagal (HTTP ${response.status}).`,
      { status: response.status, url }
    )
  }

  return payload
}

/**
 * Coba beberapa endpoint secara berurutan. Dipakai untuk fitur
 * yang endpoint-nya belum tentu ada (aktivitas, notifikasi).
 * Mengembalikan `null` - BUKAN data palsu - jika tidak ada yang cocok.
 */
async function apiRequestFirstAvailable(paths, options = {}) {
  let lastError = null

  for (const path of paths) {
    try {
      return await apiRequest(path, options)
    } catch (error) {
      if (error?.name === 'AbortError') throw error

      lastError = error

      const recoverable = error instanceof ApiError && [404, 405, 501].includes(error.status)

      if (!recoverable) throw error
    }
  }

  if (lastError instanceof ApiError && [404, 405, 501].includes(lastError.status)) {
    return null
  }

  throw lastError
}

/* =========================================================
 * RESOURCE
 * Hanya endpoint yang SUDAH ADA di routes/api.php backend.
 * ========================================================= */

export const api = {
  /* --- Project --- */
  listProjects: (options) => apiRequest('/api/projects', options),
  getProject: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}`, options),

  /* --- Tiang (Pole) --- */
  listPoles: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/poles`, options),
  getPole: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}`, options),
  getPoleProgress: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/progress`, options),

  /* --- Pekerjaan (Work Item) --- */
  listWorkItems: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items`, options),
  getWorkItem: (projectId, workItemId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items/${workItemId}`, options),

  /* --- Kurva S --- */
  getCurve: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/curve`, options),

  /* --- Belum tersedia di backend. Tetap dipanggil supaya UI
         otomatis hidup begitu endpoint-nya ditambahkan. --- */
  listActivities: (projectId, options) =>
    apiRequestFirstAvailable(
      [
        `/api/projects/${projectId}/activities`,
        `/api/projects/${projectId}/activity-logs`,
        `/api/activities`,
      ],
      options
    ),
  listNotifications: (projectId, options) =>
    apiRequestFirstAvailable(
      [
        `/api/notifications`,
        `/api/notifications/unread`,
        `/api/projects/${projectId}/notifications`,
      ],
      options
    ),
}

/* =========================================================
 * NORMALISER
 * Menyamakan bentuk payload Laravel (paginated / `{data}`) menjadi
 * array polos supaya komponen UI tidak perlu tahu detail API.
 * ========================================================= */

export function unwrapList(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload) return []

  if (Array.isArray(payload.data)) return payload.data

  return []
}

export function unwrapItem(payload) {
  if (!payload) return null
  if (Array.isArray(payload)) return payload[0] ?? null

  if (payload.data !== undefined && typeof payload.data === 'object') {
    return payload.data
  }

  return payload
}

export function normalizePole(pole) {
  const latitude = pole?.latitude === null || pole?.latitude === undefined ? null : Number(pole.latitude)
  const longitude = pole?.longitude === null || pole?.longitude === undefined ? null : Number(pole.longitude)

  const hasCoordinate = Number.isFinite(latitude) && Number.isFinite(longitude)

  return {
    id: pole?.id ?? null,
    projectId: pole?.project_id ?? null,
    poleCode: pole?.pole_code ?? '—',
    address: pole?.address ?? null,
    latitude,
    longitude,
    hasCoordinate,
    status: pole?.status ?? null,
    regionId: pole?.region_id ?? null,
    region: pole?.region
      ? {
          id: pole.region.id,
          name: pole.region.name ?? '—',
          code: pole.region.code ?? null,
        }
      : null,
  }
}

export function normalizeWorkItem(workItem) {
  return {
    id: workItem?.id ?? null,
    projectId: workItem?.project_id ?? null,
    name: workItem?.name ?? '—',
    weight: Number(workItem?.weight_percent ?? 0),
    sequence: workItem?.sequence ?? null,
    plannedDurationDays: workItem?.planned_duration_days ?? null,
    isActive: workItem?.is_active ?? null,
    plannedStartMonth: workItem?.planned_start_month ?? null,
    plannedEndMonth: workItem?.planned_end_month ?? null,
  }
}

export function normalizeWorkProgress(entry) {
  return {
    id: entry?.id ?? null,
    workItemId: entry?.work_item_id ?? null,
    progress: Number(entry?.progress_percent ?? 0),
    startedAt: entry?.started_at ?? null,
    completedAt: entry?.completed_at ?? null,
    notes: entry?.notes ?? null,
    workItem: entry?.work_item
      ? normalizeWorkItem(entry.work_item)
      : null,
  }
}