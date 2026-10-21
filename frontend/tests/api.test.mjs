import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { api, apiRequest, ApiError, TOKEN_KEY } from '../lib/api.js'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
let token

beforeEach(() => {
  token = 'user-a-token'
  globalThis.window = {
    localStorage: { getItem: (key) => key === TOKEN_KEY ? token : null },
  }
  globalThis.fetch = () => { throw new Error('Unexpected network request') }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('concurrent requests for the same user share one GET', async () => {
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return Response.json({ id: 'user-a' })
  }

  const results = await Promise.all([apiRequest('/api/me'), apiRequest('/api/me')])

  assert.equal(requests, 1)
  assert.deepEqual(results, [{ id: 'user-a' }, { id: 'user-a' }])
})

test('switching user during an in-flight GET never shares another user response', async () => {
  let requests = 0
  globalThis.fetch = async (_url, options) => {
    requests += 1
    return Response.json({ user: options.headers.Authorization })
  }

  const first = apiRequest('/api/me')
  token = 'user-b-token'
  const second = apiRequest('/api/me')
  const results = await Promise.all([first, second])

  assert.equal(requests, 2)
  assert.deepEqual(results, [{ user: 'Bearer user-a-token' }, { user: 'Bearer user-b-token' }])
})

test('public and authenticated requests never share a private response', async () => {
  globalThis.fetch = async (_url, options) => Response.json({ private: Boolean(options.headers.Authorization) })

  const results = await Promise.all([
    apiRequest('/api/projects'),
    apiRequest('/api/projects', { auth: false }),
  ])

  assert.deepEqual(results, [{ private: true }, { private: false }])
})

test('Laravel validation errors keep their HTTP status and field messages', async () => {
  globalThis.fetch = async () => Response.json({ message: 'Validasi gagal', errors: { name: ['Wajib diisi'] } }, { status: 422 })

  await assert.rejects(apiRequest('/api/projects', { method: 'POST', body: {} }), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 422)
    assert.deepEqual(error.fieldErrors, { name: ['Wajib diisi'] })
    return true
  })
})

test('notifications use the project selected by the page', async () => {
  let requestedUrl
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return Response.json({ data: [], meta: { project: 7 } })
  }

  await api.listNotifications(7)

  assert.equal(requestedUrl, '/api/projects/7/notifications')
})

test('notifications retain the global endpoint when no project is selected', async () => {
  let requestedUrl
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return Response.json({ data: [] })
  }

  await api.listNotifications(null)

  assert.equal(requestedUrl, '/api/notifications')
})

test('progress photos use multipart without overriding the browser boundary', async () => {
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, ...options }
    return Response.json({ pole_progress: 50, photos: [] })
  }

  await api.savePoleProgress(1, 2, {
    work_item_id: 3,
    progress_percent: 50,
    photos: [new File(['photo'], 'progress.png', { type: 'image/png' })],
  })

  assert.equal(request.url, '/api/projects/1/poles/2/progress')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers['Content-Type'], undefined)
  assert.equal(request.body.get('work_item_id'), '3')
  assert.equal(request.body.get('photos[]').name, 'progress.png')
})

test('pole work items, curve, and notification helpers use the documented API methods', async () => {
  const { readFile } = await import('node:fs/promises')
  const contract = JSON.parse(await readFile(new URL('../../docs/api-routes.json', import.meta.url), 'utf8'))
  const cases = [
    [() => api.listPoleWorkItems(1, 2), 'GET', '/api/projects/1/poles/2/work-items'],
    [() => api.createPoleWorkItem(1, 2, { name: 'Pondasi', weight_percent: 100 }), 'POST', '/api/projects/1/poles/2/work-items'],
    [() => api.updatePoleWorkItem(1, 2, 3, { name: 'Tiang', weight_percent: 100 }), 'PUT', '/api/projects/1/poles/2/work-items/3'],
    [() => api.deletePoleWorkItem(1, 2, 3), 'DELETE', '/api/projects/1/poles/2/work-items/3'],
    [() => api.applyPoleTemplate(1, 2), 'POST', '/api/projects/1/poles/2/work-items/apply-template'],
    [() => api.getPoleCurve(1, 2), 'GET', '/api/projects/1/poles/2/curve'],
    [() => api.getUnreadNotificationCount(), 'GET', '/api/notifications/unread-count'],
    [() => api.markNotificationRead(3), 'POST', '/api/notifications/3/read'],
    [() => api.markAllNotificationsRead({ body: { project_id: 1 } }), 'POST', '/api/notifications/read-all'],
  ]
  for (const [invoke, method, path] of cases) {
    let request
    globalThis.fetch = async (url, options) => {
      request = { url, ...options }
      return Response.json({ data: [] })
    }
    await invoke()
    assert.equal(request.url, path)
    assert.equal(request.method, method)
    assert.equal(request.headers.Authorization, 'Bearer user-a-token')
    assert.ok(contract.some((route) => route.method === method && new RegExp(`^${route.path.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(path)), `${method} ${path} absent from Laravel contract`)
    if (path.endsWith('/read-all')) assert.equal(JSON.parse(request.body).project_id, 1)
  }
})

test('HTTP 200 with an HTML fallback cannot be reported as a successful save', async () => {
  globalThis.fetch = async () => new Response('<html>Fallback</html>', { status: 200 })
  await assert.rejects(api.savePoleProgress(1, 2, { work_item_id: 3, progress_percent: 20 }), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.outcomeUnknown, true)
    return true
  })
})

test('failed writes distinguish an unknown network outcome from a confirmed upload rollback', async () => {
  globalThis.fetch = async () => { throw new Error('Connection interrupted') }
  await assert.rejects(api.savePoleProgress(1, 2, { work_item_id: 3, progress_percent: 20 }), (error) => error.outcomeUnknown === true)
  globalThis.fetch = async () => Response.json({ message: 'Foto gagal disimpan.', saved: false }, { status: 503 })
  await assert.rejects(api.savePoleProgress(1, 2, { work_item_id: 3, progress_percent: 20 }), (error) => error.status === 503 && error.outcomeUnknown === false)
})
