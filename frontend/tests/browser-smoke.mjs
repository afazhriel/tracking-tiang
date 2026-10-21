/* global document -- callbacks evaluated inside Chromium */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const baseURL = 'http://localhost:3186'
const fixture = JSON.parse(await readFile(process.env.BROWSER_FIXTURE_FILE, 'utf8'))
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const contexts = []

async function context(options = {}) {
  const value = await browser.newContext({ baseURL, ...options })
  contexts.push(value)
  await value.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
  return value
}

async function login(value, email) {
  const page = await value.newPage()
  let payload
  await page.route('**/api/login', async (route) => {
    const response = await route.fetch()
    payload = await response.json()
    await route.fulfill({ response })
  })
  await page.goto('/login')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill('browser-fixture-password')
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/dashboard')
  assert.equal(payload.token_type, 'Cookie')
  assert.equal(payload.token, undefined)
  const cookies = await value.cookies()
  const cookie = cookies.find((c) => c.name === '__Host-tracking_tiang_session')
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Strict')
  assert.ok((await page.evaluate(() => localStorage.getItem('tracking_tiang_token'))).startsWith('cookie:'))
  assert.ok(!(await page.evaluate(() => document.cookie)).includes('__Host-tracking_tiang_session'))
  return page
}

try {
  const owner = await context()
  const page = await login(owner, 'browser-owner@example.test')
  assert.equal((await owner.request.get('/api/me')).status(), 200)
  assert.equal((await owner.request.get(fixture.photo_url)).status(), 200)
  const saved = await owner.request.post(`/api/projects/${fixture.project_id}/poles/${fixture.pole_id}/progress`, {
    headers: { 'X-Tracking-Client': 'browser', Origin: baseURL },
    multipart: {
      work_item_id: String(fixture.work_item_id), progress_percent: '50',
      'photos[]': { name: 'browser.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') },
    },
  })
  assert.equal(saved.status(), 200)
  const savedPhoto = (await saved.json()).photos[0].url
  assert.equal((await owner.request.get(savedPhoto)).status(), 200)
  await page.goto(`/tiang/${fixture.pole_id}`)
  await page.waitForFunction(() => [...document.images].some((img) => img.src.includes('/api/photos/') && img.complete && img.naturalWidth > 0))
  await page.goto('/profil')
  await page.waitForFunction(() => [...document.images].some((img) => img.src.includes('/api/user/avatar/') && img.complete && img.naturalWidth > 0))
  assert.equal((await owner.request.post('/api/logout', { headers: { 'X-Tracking-Client': 'browser', Origin: 'https://attacker.example' } })).status(), 419)
  console.log('PASS browser login, HttpOnly cookie, progress upload, rendered private photos/avatar, CSRF rejection')

  const anonymous = await context()
  assert.equal((await anonymous.request.get(fixture.photo_url)).status(), 401)
  assert.equal((await anonymous.request.get(`/api/user/avatar/${fixture.owner_id}`)).status(), 401)
  const outsider = await context()
  await login(outsider, 'browser-other@example.test')
  assert.equal((await outsider.request.get(fixture.photo_url)).status(), 403)
  assert.equal((await outsider.request.get(`/api/user/avatar/${fixture.owner_id}`)).status(), 403)
  console.log('PASS anonymous and unrelated PIC cannot read media')

  const admin = await context()
  await login(admin, 'browser-admin@example.test')
  assert.equal((await admin.request.delete(`/api/users/${fixture.owner_id}/poles/${fixture.pole_id}`, { headers: { 'X-Tracking-Client': 'browser', Origin: baseURL } })).status(), 200)
  assert.equal((await owner.request.get(fixture.photo_url)).status(), 403)
  console.log('PASS revoking assignment immediately blocks the next media request')

  const legacy = await context()
  const native = await legacy.request.post('/api/login', { data: { email: 'browser-owner@example.test', password: 'browser-fixture-password' } })
  const nativePayload = await native.json()
  assert.equal(nativePayload.token_type, 'Bearer')
  await legacy.addInitScript(({ token, user }) => {
    if (!localStorage.getItem('tracking_tiang_token')) {
      localStorage.setItem('tracking_tiang_token', token)
      localStorage.setItem('tracking_tiang_user', JSON.stringify(user))
    }
  }, nativePayload)
  const legacyPage = await legacy.newPage()
  await legacyPage.goto('/dashboard')
  await legacyPage.waitForFunction(() => localStorage.getItem('tracking_tiang_token')?.startsWith('cookie:'))
  assert.equal((await legacy.request.get('/api/me')).status(), 200)
  console.log('PASS legacy bearer upgrades without forcing another login')

  const mobile = await context({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })
  const mobilePage = await login(mobile, 'browser-owner@example.test')
  await mobilePage.goto('/profil')
  await mobilePage.waitForFunction(() => [...document.images].some((img) => img.src.includes('/api/user/avatar/') && img.complete && img.naturalWidth > 0))
  console.log('PASS mobile viewport login and private avatar')

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Profil Browser PIC', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Keluar', exact: true }).click()
  await page.waitForURL('**/login')
  assert.equal((await owner.request.get('/api/me')).status(), 401)
  assert.equal((await owner.cookies()).some((c) => c.name === '__Host-tracking_tiang_session'), false)
  console.log('PASS menu logout revokes the server session and clears the cookie')
} finally {
  await Promise.all(contexts.map((value) => value.close()))
  await browser.close()
}
