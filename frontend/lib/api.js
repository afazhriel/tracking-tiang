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
    this.fieldErrors = null
  }

  get isNetworkError() {
    return this.status === 0
  }

  get isNotFound() {
    return this.status === 404
  }

  get isUnprocessable() {
    return this.status === 422
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

function buildUrl(path, query) {
  const base = (() => {
    if (/^https?:\/\//i.test(path)) return path
    if (path.startsWith('/api')) return path

    return `/api/${path.replace(/^\/+/, '')}`
  })()

  const entries = Object.entries(query ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )

  if (!entries.length) return base

  const search = new URLSearchParams()

  for (const [key, value] of entries) search.set(key, String(value))

  return `${base}${base.includes('?') ? '&' : '?'}${search.toString()}`
}

/**
 * Cache request GET yang sedang berjalan.
 *
 * Without this, several pages call the same endpoint at once
 * (ProjectProvider + page loader, or a page rendered twice during
 * Strict Mode). One in-flight promise per URL is enough and it does
 * not cache results, so data is never stale.
 */
const inflight = new Map()

/**
 * Request inti. Melempar ApiError agar setiap halaman bisa
 * membedakan kondisi: gagal jaringan vs endpoint belum ada.
 */
export async function apiRequest(
  path,
  { method = 'GET', body, signal, headers = {}, auth = true, query } = {}
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

  const url = buildUrl(path, query)

  const isShared = method === 'GET' && !signal && !body
  const existing = isShared ? inflight.get(url) : null

  if (existing) return existing

  const run = async () => {
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
      const error = new ApiError(
        payload?.message || `Permintaan gagal (HTTP ${response.status}).`,
        { status: response.status, url }
      )

      /* Laravel mengirim 422 dengan `errors` per-field saat validasi
         gagal. Simpan apa adanya supaya form bisa menandai field
         yang salah, bukan hanya menampilkan pesan generik. */
      if (payload?.errors && typeof payload.errors === 'object') {
        error.fieldErrors = payload.errors
      }

      throw error
    }

    return payload
  }

  if (!isShared) return run()

  const promise = run().finally(() => {
    inflight.delete(url)
  })

  inflight.set(url, promise)

  return promise
}

/**
 * Cache probe negatif.
 *
 * Aktivitas dan notifikasi BELUM punya route di backend
 * `routes/api.php`. Daftar path di bawah ini adalah kandidat yang
 * masuk akal, bukan kontrak API — tidak ada response yang diasumsikan
 * di sini. Kalau semuanya 404, hasilnya `null` dan halaman
 * menampilkan empty state jujur.
 *
 * Angka kandidat yang gagal disimpan per sesi supaya halaman tidak
 * menembak endpoint yang sama setiap kali di-remount.
 */
const unavailablePaths = new Set()

async function apiRequestFirstAvailable(paths, options = {}) {
  let lastError = null

  for (const path of paths) {
    if (unavailablePaths.has(path)) continue

    try {
      return await apiRequest(path, options)
    } catch (error) {
      if (error?.name === 'AbortError') throw error

      lastError = error

      const recoverable =
        error instanceof ApiError && [404, 405, 501].includes(error.status)

      if (!recoverable) throw error

      unavailablePaths.add(path)
    }
  }

  /* Semua kandidat sudah 404 → endpoint memang belum ada.
     `null` = "tidak tersedia", bukan error. */
  if (
    lastError === null ||
    (lastError instanceof ApiError && [404, 405, 501].includes(lastError.status))
  ) {
    return null
  }

  throw lastError
}

/* =========================================================
 * RESOURCE
 * Hanya endpoint yang SUDAH ADA di backend `routes/api.php`.
 *
 * Selain POST, item pekerjaan kini juga punya PUT/PATCH/DELETE:
 *   POST/PUT/PATCH/DELETE /projects/{project}/work-items[/{workItem}]
 * ========================================================= */

export const api = {
  /* --- Wilayah Indonesia --- */
  listProvinces: (options) =>
    apiRequest('/api/regions/provinces', options),
  listRegencies: (provinceId, options) =>
    apiRequest(`/api/regions/provinces/${provinceId}/regencies`, options),
  listDistricts: (regencyId, options) =>
    apiRequest(`/api/regions/regencies/${regencyId}/districts`, options),
  listVillages: (districtId, options) =>
    apiRequest(`/api/regions/districts/${districtId}/villages`, options),
  /* --- Project --- */
  listProjects: (options) => apiRequest('/api/projects', options),
  getProject: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}`, options),
  createProject: (payload, options) =>
    apiRequest('/api/projects', { ...options, method: 'POST', body: payload }),

  /* --- Tiang (Pole) ---
     `PoleController@index` memakai `paginate(100)`. `per_page`
     diteruskan sebagai query string karena Laravel membacanya
     otomatis — ini yang membuat 1.500 titik bisa dijelajahi
     halaman demi halaman, bukan dimuat sekaligus. */
  listPoles: (projectId, { perPage, page, ...options } = {}) =>
    apiRequest(`/api/projects/${projectId}/poles`, {
      ...options,
      query: { per_page: perPage, page },
    }),
  getPole: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}`, options),
  createPole: (projectId, payload, options) =>
    apiRequest(`/api/projects/${projectId}/poles`, {
      ...options,
      method: 'POST',
      body: payload,
    }),

  /* --- Progress ---
     `ProgressController@store` memakai `updateOrCreate`, jadi
     mengirim ulang work item yang sama memperbarui nilai yang ada
     dan menambah satu baris `pole_progress_histories`. */
  getPoleActivities: (projectId, poleId, options) =>
    apiRequestFirstAvailable(
      [
        `/api/projects/${projectId}/activities?pole_id=${poleId}`,
        `/api/projects/${projectId}/poles/${poleId}/activities`,
      ],
      options
    ),
  getPoleProgress: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/progress`, options),
  savePoleProgress: (projectId, poleId, payload, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/progress`, {
      ...options,
      method: 'POST',
      body: payload,
    }),

  /* --- Pekerjaan (Work Item) --- */
  listWorkItems: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items`, options),
  getWorkItem: (projectId, workItemId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items/${workItemId}`, options),
  createWorkItem: (projectId, payload, options) =>
    apiRequest(`/api/projects/${projectId}/work-items`, {
      ...options,
      method: 'POST',
      body: payload,
    }),
  updateWorkItem: (projectId, workItemId, payload, options) =>
    apiRequest(`/api/projects/${projectId}/work-items/${workItemId}`, {
      ...options,
      method: 'PUT',
      body: payload,
    }),
  deleteWorkItem: (projectId, workItemId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items/${workItemId}`, {
      ...options,
      method: 'DELETE',
    }),

  /* --- Kurva S --- */
  getCurve: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/curve`, options),

  /* --- Auth ---
     Kedua endpoint ini sudah diverifikasi ada di server:
     `GET /api/me` membalas 401 `Unauthenticated.` dan
     `POST /api/logout` membalas 405 "Supported methods: POST",
     artinya keduanya terdaftar sebagai route Sanctum. Bentuk
     response `me` belum diaudit — dipakai lewat `unwrapItem`. */
  getMe: (options) => apiRequest('/api/me', options),
  logout: (options) =>
    apiRequest('/api/logout', { ...options, method: 'POST' }),

  /* --- Belum ada di `routes/api.php` ---
     Kandidat endpoint, bukan kontrak. `apiRequestFirstAvailable`
     mengembalikan null kalau semuanya tidak tersedia, jadi UI
     menampilkan empty state, bukan data buatan. */
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
    provinceId: pole?.province_id ?? null,
    regencyId: pole?.regency_id ?? null,
    districtId: pole?.district_id ?? null,
    villageId: pole?.village_id ?? null,
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
  const hasAggregate =
    workItem?.actual_progress !== undefined &&
    workItem?.actual_progress !== null

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
    /* Progres aktual agregat hanya ada di `WorkItemController@index`.
       `null` berarti belum tersedia -> UI boleh jatuh ke perhitungan
       sisi klien, bukan menganggap progresnya 0%. */
    actualProgress: hasAggregate ? Number(workItem.actual_progress) : null,
    polesWithProgress:
      workItem?.poles_with_progress !== undefined
        ? Number(workItem.poles_with_progress)
        : null,
    weightedContribution:
      workItem?.weighted_contribution !== undefined &&
      workItem?.weighted_contribution !== null
        ? Number(workItem.weighted_contribution)
        : null,
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

export function normalizeRegion(region) {
  return {
    id: region?.id ?? null,
    projectId: region?.project_id ?? null,
    name: region?.name ?? '—',
    code: region?.code ?? null,
  }
}

/**
 * `ProjectController@index` mengirim `regions_count`, `poles_count`,
 * `work_items_count`; `show` mengirim relasi `regions` + `workItems`.
 * Kedua bentuk dinormalisasi ke satu bentuk supaya ProjectProvider
 * tidak perlu tahu endpoint mana yang sedang dipakai.
 */
export function normalizeProject(project) {
  return {
    id: project?.id ?? null,
    name: project?.name ?? '—',
    code: project?.code ?? null,
    status: project?.status ?? null,
    startDate: project?.start_date ?? null,
    endDate: project?.end_date ?? null,
    totalTargetPoles: project?.total_target_poles ?? null,
    polesCount: project?.poles_count ?? null,
    regionsCount: project?.regions_count ?? null,
    workItemsCount: project?.work_items_count ?? null,
    regions: Array.isArray(project?.regions) ? project.regions.map(normalizeRegion) : [],
    workItems: Array.isArray(project?.work_items)
      ? project.work_items.map(normalizeWorkItem)
      : Array.isArray(project?.workItems)
        ? project.workItems.map(normalizeWorkItem)
        : [],
  }
}

/**
 * User dari `POST /api/login`.
 *
 * Dipakai hanya untuk mengisi UI profil. `id`/nama/email yang
 * tidak ada di response tidak ditebak — `role` yang tidak dikirim
 * backend akan tampil sebagai "belum ditentukan", bukan "Admin".
 */
export function normalizeUser(user) {
  const name = user?.name ?? user?.nama ?? null

  const derivedInitial =
    String(name ?? '')
      .trim()
      .charAt(0)
      .toUpperCase() || null

  return {
    id: user?.id ?? null,
    name,
    email: user?.email ?? null,
    role: user?.role ?? user?.role_name ?? null,
    roleLabel: user?.role_label ?? user?.role_name ?? user?.role ?? null,
    phone: user?.phone ?? user?.phone_number ?? user?.no_hp ?? null,
    initials: user?.initials ?? derivedInitial,
    raw: user ?? null,
  }
}



