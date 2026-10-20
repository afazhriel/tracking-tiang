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
