/**
 * =========================================================
 * API CLIENT - TRACKING PROYEK
 * ------------------------------------------------------------
 * Satu-satunya tempat frontend melakukan request ke backend.
 *
 * - Base URL memakai proxy rewrite Next.js yang SUDAH ADA
 *   (`/api/*` -> API_UPSTREAM_ORIGIN pada next.config.mjs).
 * - Auth token tetap memakai key yang sudah dipakai login page:
 *   `tracking_tiang_token` (di Circuit via header Authorization: Bearer).
 * - Tidak ada base URL hardcoded di halaman mana pun.
 * =========================================================
 */

export const TOKEN_KEY = 'tracking_tiang_token'
export const USER_KEY = 'tracking_tiang_user'
export const AUTH_CHANGED_EVENT = 'tracking_tiang:auth-changed'

export class ApiError extends Error {
  constructor(message, { status = 0, url = '', cause = null, outcomeUnknown = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.cause = cause
    this.fieldErrors = null
    this.outcomeUnknown = outcomeUnknown
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

/**
 * Simpan user terbaru ke localStorage + beritahu semua listener.
 *
 * Dipakai setelah edit profil agar kartu identitas, menu user di bar
 * atas, dan halaman profil ikut terupdate di tab yang sama tanpa
 * logout-login. Penyimpanan dilakukan di sini (bukan di halaman)
 * supaya bentuk key dan event tetap satu: `USER_KEY` + event auth.
 */
export function setStoredUser(user) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
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
 * not cache results, so data is never stale. Headers are part of the
 * key so switching accounts cannot reuse another user's response.
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

  /* FormData untuk upload multipart (mis. foto progress). Browser
     yang menyetel Content-Type beserta boundary-nya sendiri, jadi
     jangan di-override. */
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData

  if (body !== undefined && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()

    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`
    }
  }

  const isMutation = !['GET', 'HEAD'].includes(method.toUpperCase())
  const url = buildUrl(path, query)
  const inflightKey = JSON.stringify([url, requestHeaders])

  const isShared = method === 'GET' && !signal && !body
  const existing = isShared ? inflight.get(inflightKey) : null

  if (existing) return existing

  const run = async () => {
    let response

    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        signal,
        body:
          body === undefined
            ? undefined
            : isFormData
              ? body
              : JSON.stringify(body),
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw error

      throw new ApiError(
        'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
        { status: 0, url, cause: error, outcomeUnknown: isMutation }
      )
    }

    if (response.status === 204) return null

    const text = await response.text()
    let payload = null
    let validJson = false

    if (text) {
      try {
        payload = JSON.parse(text)
        validJson = true
      } catch {
        payload = null
      }
    }

    if (!response.ok) {
      const error = new ApiError(
        payload?.message || `Permintaan gagal (HTTP ${response.status}).`,
        { status: response.status, url, outcomeUnknown: isMutation && response.status >= 500 && payload?.saved !== false }
      )

      /* Laravel mengirim 422 dengan `errors` per-field saat validasi
         gagal. Simpan apa adanya supaya form bisa menandai field
         yang salah, bukan hanya menampilkan pesan generik. */
      if (payload?.errors && typeof payload.errors === 'object') {
        error.fieldErrors = payload.errors
      }

      throw error
    }

    if (!validJson) {
      throw new ApiError('Respons server tidak valid. Muat ulang untuk memeriksa status data.', {
        status: response.status, url, outcomeUnknown: isMutation,
      })
    }
    return payload
  }

  if (!isShared) return run()

  const promise = run().finally(() => {
    inflight.delete(inflightKey)
  })

  inflight.set(inflightKey, promise)

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
     halaman demi halaman, bukan dimuat sekaligus.

     `provinceId` + `search` memfilter di server (dipakai grup/filter
     per provinsi di halaman Tiang). */
  listPoles: (projectId, { perPage, page, provinceId, search, ...options } = {}) =>
    apiRequest(`/api/projects/${projectId}/poles`, {
      ...options,
      query: { per_page: perPage, page, province_id: provinceId, search },
    }),
  getPoleSummary: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/summary`, options),
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
     dan menambah satu baris `pole_progress_histories`.

     Kalau `payload.photos` berisi File, request dikirim sebagai
     multipart (FormData) supaya backend bisa menyimpan fotonya
     sekaligus. */
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
  savePoleProgress: (projectId, poleId, payload, options) => {
    const { photos, ...fields } = payload ?? {}
    const files = Array.isArray(photos) ? photos.filter(Boolean) : []

    if (!files.length) {
      return apiRequest(`/api/projects/${projectId}/poles/${poleId}/progress`, {
        ...options,
        method: 'POST',
        body: fields,
      })
    }

    const form = new FormData()

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, value)
      }
    })

    files.forEach((file) => form.append('photos[]', file))

    return apiRequest(`/api/projects/${projectId}/poles/${poleId}/progress`, {
      ...options,
      method: 'POST',
      body: form,
    })
  },

  /* --- Pekerjaan (Work Item) ---
     `listWorkItems` mengembalikan item TEMPLATE project (pole_id null).
     `listWorkItemsAggregate` mengembalikan satu baris per template dengan
     progres agregat dari seluruh tiang (dipakai halaman Pekerjaan). */
  listWorkItems: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items?scope=project`, options),
  listWorkItemsAggregate: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items?scope=aggregate`, options),
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
  normalizeWorkItems: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/work-items/normalize`, {
      ...options,
      method: 'POST',
    }),

  /* --- Item pekerjaan per tiang (independen per tiang) --- */
  listPoleWorkItems: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/work-items`, options),
  createPoleWorkItem: (projectId, poleId, payload, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/work-items`, {
      ...options,
      method: 'POST',
      body: payload,
    }),
  updatePoleWorkItem: (projectId, poleId, workItemId, payload, options) =>
    apiRequest(
      `/api/projects/${projectId}/poles/${poleId}/work-items/${workItemId}`,
      { ...options, method: 'PUT', body: payload }
    ),
  deletePoleWorkItem: (projectId, poleId, workItemId, options) =>
    apiRequest(
      `/api/projects/${projectId}/poles/${poleId}/work-items/${workItemId}`,
      { ...options, method: 'DELETE' }
    ),
  applyPoleTemplate: (projectId, poleId, options) =>
    apiRequest(
      `/api/projects/${projectId}/poles/${poleId}/work-items/apply-template`,
      { ...options, method: 'POST' }
    ),

  /* --- Kurva S --- */
  getCurve: (projectId, options) =>
    apiRequest(`/api/projects/${projectId}/curve`, options),
  getPoleCurve: (projectId, poleId, options) =>
    apiRequest(`/api/projects/${projectId}/poles/${poleId}/curve`, options),

  /* --- Auth ---
     Kedua endpoint ini sudah diverifikasi ada di server:
     `GET /api/me` membalas 401 `Unauthenticated.` dan
     `POST /api/logout` membalas 405 "Supported methods: POST",
     artinya keduanya terdaftar sebagai route Sanctum. Bentuk
     response `me` belum diaudit — dipakai lewat `unwrapItem`. */
  getMe: (options) => apiRequest('/api/me', options),
  logout: (options) =>
    apiRequest('/api/logout', { ...options, method: 'POST' }),

  /* --- Profil sendiri ---
     Kontrak endpoint ini dulu tertulis di `ProfilPage.jsx` sebagai
     `MISSING_ENDPOINTS`; sekarang sudah ada di backend
     (`UserProfileController`). Semua operasi menempel pada user yang
     sedang login — tidak ada user id di URL. */
  getProfile: (options) => apiRequest('/api/user/profile', options),
  updateProfile: (payload, options) =>
    apiRequest('/api/user/profile', {
      ...options,
      method: 'PUT',
      body: payload,
    }),
  updatePassword: (payload, options) =>
    apiRequest('/api/user/password', {
      ...options,
      method: 'PUT',
      body: payload,
    }),
  /* Upload dikirim sebagai multipart: backend menolak payload yang
     bukan gambar berdasarkan isi file, bukan ekstensi nama. */
  updateAvatar: (file, options) => {
    const form = new FormData()
    form.append('avatar', file)

    return apiRequest('/api/user/avatar', {
      ...options,
      method: 'POST',
      body: form,
    })
  },
  removeAvatar: (options) =>
    apiRequest('/api/user/avatar', { ...options, method: 'DELETE' }),
  /* Mencabut SEMUA token (termasuk yang dipakai request ini) —
     lawan dari `logout` yang hanya menutup satu perangkat. */
  logoutAll: (options) =>
    apiRequest('/api/logout-all', { ...options, method: 'POST' }),
  register: (payload, options) =>
    apiRequest('/api/register', {
      ...options,
      method: 'POST',
      body: payload,
      auth: false,
    }),

  /* --- User management (admin-only di backend) ---
     `GET /api/users` membalas `{ data: [...] }`. `PUT /api/users/{id}`
     hanya menerima `name` + `role` (email sengaja tidak bisa diubah).
     Status diubah lewat `PATCH /api/users/{id}/status`. */
  listUsers: ({ role, status, search, ...options } = {}) =>
    apiRequest('/api/users', { ...options, query: { role, status, search } }),
  getUser: (userId, options) =>
    apiRequest(`/api/users/${userId}`, options),
  updateUser: (userId, payload, options) =>
    apiRequest(`/api/users/${userId}`, {
      ...options,
      method: 'PUT',
      body: payload,
    }),
  updateUserStatus: (userId, status, options) =>
    apiRequest(`/api/users/${userId}/status`, {
      ...options,
      method: 'PATCH',
      body: { status },
    }),
  updateUserProvinces: (userId, provinceIds, options) =>
    apiRequest(`/api/users/${userId}/provinces`, {
      ...options,
      method: 'PATCH',
      body: { province_ids: provinceIds },
    }),

  /* --- Team management ---
     `GET /api/teams` membalas array polos (bukan `{ data }`). */
  listTeams: ({ projectId, status, ...options } = {}) =>
    apiRequest('/api/teams', {
      ...options,
      query: { project_id: projectId, status },
    }),
  getTeam: (teamId, options) => apiRequest(`/api/teams/${teamId}`, options),
  createTeam: (payload, options) =>
    apiRequest('/api/teams', { ...options, method: 'POST', body: payload }),
  updateTeam: (teamId, payload, options) =>
    apiRequest(`/api/teams/${teamId}`, {
      ...options,
      method: 'PUT',
      body: payload,
    }),
  addTeamMember: (teamId, userId, options) =>
    apiRequest(`/api/teams/${teamId}/members`, {
      ...options,
      method: 'POST',
      body: { user_id: userId },
    }),
  removeTeamMember: (teamId, userId, options) =>
    apiRequest(`/api/teams/${teamId}/members/${userId}`, {
      ...options,
      method: 'DELETE',
    }),

  /* --- Invitation management (admin-only) ---
     `GET /api/invitations` membalas `{ data: [...] }`. */
  listInvitations: (options) => apiRequest('/api/invitations', options),
  createInvitation: (payload, options) =>
    apiRequest('/api/invitations', {
      ...options,
      method: 'POST',
      body: payload,
    }),
  revokeInvitation: (invitationId, options) =>
    apiRequest(`/api/invitations/${invitationId}`, {
      ...options,
      method: 'DELETE',
    }),
  getInvitation: (token, options) =>
    apiRequest(`/api/invitations/${token}`, { ...options, auth: false }),
  acceptInvitation: (token, payload, options) =>
    apiRequest(`/api/invitations/${token}/accept`, {
      ...options,
      method: 'POST',
      body: payload,
      auth: false,
    }),

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
    apiRequest(projectId ? `/api/projects/${projectId}/notifications` : '/api/notifications', options),
  getUnreadNotificationCount: (options) =>
    apiRequest('/api/notifications/unread-count', options),
  markNotificationRead: (notificationId, options) =>
    apiRequest(`/api/notifications/${notificationId}/read`, {
      ...options,
      method: 'POST',
    }),
  markAllNotificationsRead: (options) =>
    apiRequest('/api/notifications/read-all', {
      ...options,
      method: 'POST',
    }),
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
    province: pole?.province
      ? {
          id: pole.province.id ?? null,
          name: pole.province.name ?? '—',
        }
      : null,
    provinceName: pole?.province?.name ?? null,
  }
}

export function normalizePhoto(photo) {
  return {
    id: photo?.id ?? null,
    url: photo?.url ?? photo?.path ?? null,
    originalName: photo?.original_name ?? null,
    mimeType: photo?.mime_type ?? null,
    size: photo?.size ?? null,
  }
}

export function normalizeWorkItem(workItem) {
  const hasAggregate =
    workItem?.actual_progress !== undefined &&
    workItem?.actual_progress !== null

  return {
    id: workItem?.id ?? null,
    projectId: workItem?.project_id ?? null,
    poleId: workItem?.pole_id ?? null,
    sourceItemId: workItem?.source_item_id ?? null,
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
export const USER_ROLES = [
  { value: 'admin', label: 'Admin', tone: 'brand' },
  { value: 'supervisor', label: 'Supervisor', tone: 'lagoon' },
  { value: 'pic', label: 'PIC Lapangan', tone: 'sage' },
]

export const USER_STATUSES = [
  { value: 'active', label: 'Aktif', tone: 'sage' },
  { value: 'pending', label: 'Menunggu', tone: 'ochre' },
  { value: 'suspended', label: 'Nonaktif', tone: 'clay' },
]

export function userStatusLabel(status) {
  return USER_STATUSES.find((item) => item.value === status)?.label ?? 'Tidak diketahui'
}

export function userStatusTone(status) {
  return USER_STATUSES.find((item) => item.value === status)?.tone ?? 'sand'
}

export function userRoleLabel(role) {
  return (
    USER_ROLES.find((item) => item.value === role)?.label ??
    (role ? String(role) : 'Tanpa role')
  )
}

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
    roleLabel:
      user?.role_label ??
      userRoleLabel(user?.role ?? user?.role_name ?? null),
    status: user?.status ?? null,
    statusLabel: userStatusLabel(user?.status ?? null),
    phone: user?.phone ?? user?.phone_number ?? user?.no_hp ?? null,
    avatar: user?.avatar ?? null,
    avatarUrl: user?.avatar_url ?? null,
    initials: user?.initials ?? derivedInitial,
    teams: Array.isArray(user?.teams) ? user.teams.map(normalizeTeam) : [],
    projects: Array.isArray(user?.projects)
      ? user.projects.map((project) => ({
          id: project?.id ?? null,
          name: project?.name ?? '—',
        }))
      : [],
    /* Provinsi yang ditugaskan (non-admin). Admin tidak dibatasi,
       jadi daftar kosong pada admin TIDAK berarti tanpa akses —
       gunakan `isAdmin` untuk membedakan. */
    provinces: Array.isArray(user?.provinces)
      ? user.provinces.map((province) => ({
          id: province?.id ?? null,
          name: province?.name ?? '—',
        }))
      : [],
    raw: user ?? null,
  }
}

export function normalizeTeam(team) {
  const users = Array.isArray(team?.users) ? team.users : []

  return {
    id: team?.id ?? null,
    name: team?.name ?? '—',
    code: team?.code ?? null,
    projectId: team?.project_id ?? null,
    project: team?.project
      ? { id: team.project.id ?? null, name: team.project.name ?? '—' }
      : null,
    status: team?.status ?? null,
    usersCount: team?.users_count ?? (users.length || null),
    users: users.map(normalizeUser),
    raw: team ?? null,
  }
}

export function normalizeInvitation(invitation) {
  return {
    id: invitation?.id ?? null,
    email: invitation?.email ?? null,
    name: invitation?.name ?? null,
    role: invitation?.role ?? null,
    roleLabel: invitation?.role_label ?? userRoleLabel(invitation?.role),
    status: invitation?.status ?? null,
    team: invitation?.team
      ? { id: invitation.team.id ?? null, name: invitation.team.name ?? '—' }
      : null,
    project: invitation?.project
      ? { id: invitation.project.id ?? null, name: invitation.project.name ?? '—' }
      : null,
    expiresAt: invitation?.expires_at ?? null,
    acceptedAt: invitation?.accepted_at ?? null,
    createdAt: invitation?.created_at ?? null,
    raw: invitation ?? null,
  }
}



