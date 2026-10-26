/* Browser regression against isolated PostgreSQL fixture; never production. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { chromium } = await import(process.env.CI_PLAYWRIGHT_MODULE || 'playwright-core')
const fixture = JSON.parse(await readFile(process.env.BROWSER_FIXTURE_FILE, 'utf8'))
const baseURL = 'http://localhost:3186'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
})
const contexts = []

async function session(email, options = {}) {
  const context = await browser.newContext({ baseURL, ...options })
  contexts.push(context)
  await context.route('**/*', route =>
    new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort()
  )
  const page = await context.newPage()
  await page.goto('/login')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill('browser-fixture-password')
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/dashboard')
  await page.goto('/tim')
  await page.getByRole('heading', { name: 'Tim Proyek' }).waitFor()
  return { context, page }
}

async function addMember(page, userId, email) {
  await page.getByLabel('Email lengkap (opsional)').fill(email)
  await page.getByRole('button', { name: 'Cari anggota' }).click()
  await page.getByLabel('Kandidat anggota').selectOption(String(userId))
  await page.getByRole('button', { name: 'Tambah anggota' }).click()
  await page.getByText(email, { exact: false }).waitFor()
}

async function getTeam(context, id) {
  const response = await context.request.get(`/api/teams/${id}`)
  assert.equal(response.status(), 200)
  return response.json()
}

async function removeMember(page, name, remaining) {
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: `Keluarkan ${name}` }).click()
  await page.getByRole('heading', { name: `Anggota · ${remaining}` }).waitFor()
}

try {
  const owner = await session('browser-owner@example.test')
  await owner.page.getByRole('button', { name: 'Buat tim' }).click()
  await owner.page.getByLabel('Nama tim').fill('Tim CI E2E')
  await owner.page.getByRole('button', { name: 'Simpan tim' }).click()
  await owner.page.getByText('Tim CI E2E').waitFor()
  await owner.page.getByRole('button', { name: 'Buka tim' }).click()
  await owner.page.getByRole('heading', { name: 'Anggota · 0' }).waitFor()

  const teamsResponse = await owner.context.request.get(`/api/teams?project_id=${fixture.project_id}`)
  assert.equal(teamsResponse.status(), 200)
  const teams = await teamsResponse.json()
  assert.equal(teams.length, 1)
  const teamId = teams[0].id

  await addMember(owner.page, fixture.team_member_id, 'browser-team-member@example.test')
  assert.equal((await getTeam(owner.context, teamId)).users.length, 1)

  const member = await session('browser-team-member@example.test')
  assert.equal((await member.context.request.get(`/api/projects/${fixture.project_id}`)).status(), 200)
  assert.equal((await member.context.request.get(`/api/projects/${fixture.foreign_project_id}`)).status(), 403)

  await owner.page.getByLabel('Cari kode tiang proyek').fill('BROWSER-1')
  await owner.page.getByRole('button', { name: 'Cari tiang' }).click()
  await owner.page.getByLabel('Tiang untuk ditugaskan').selectOption(String(fixture.pole_id))
  await owner.page.getByRole('button', { name: 'Tugaskan tim' }).click()
  await owner.page.getByRole('link', { name: 'Buka tiang' }).waitFor()
  assert.equal((await member.context.request.get(`/api/projects/${fixture.project_id}/poles/${fixture.pole_id}`)).status(), 200)
  console.log('PASS owner UI creates team, adds PIC by exact email and assigns scoped pole')

  const supervisor = await session('browser-supervisor@example.test')
  await supervisor.page.getByText('Tim CI E2E').waitFor()
  assert.equal(await supervisor.page.getByRole('button', { name: 'Buat tim' }).count(), 0)
  await supervisor.page.getByRole('button', { name: 'Buka tim' }).click()
  assert.equal(await supervisor.page.getByRole('button', { name: 'Tambah anggota' }).count(), 0)
  assert.equal((await supervisor.context.request.put(`/api/teams/${teamId}`, {
    headers: { 'X-Tracking-Client': 'browser', Origin: baseURL },
    data: { name: 'Not allowed' },
  })).status(), 403)

  const outsider = await session('browser-other@example.test')
  assert.equal((await outsider.context.request.get(`/api/teams/${teamId}`)).status(), 403)
  assert.equal((await outsider.context.request.get(`/api/teams?project_id=${fixture.project_id}`)).status(), 403)
  assert.equal(await outsider.page.getByText('Tim CI E2E').count(), 0)
  console.log('PASS Supervisor read-only, unrelated project isolated')

  await addMember(owner.page, fixture.supervisor_id, 'browser-supervisor@example.test')
  const members = (await getTeam(owner.context, teamId)).users
  const supervisorName = members.find(u => u.id === fixture.supervisor_id)?.name
  const picName = members.find(u => u.id === fixture.team_member_id)?.name
  assert.ok(supervisorName && picName)
  await removeMember(owner.page, supervisorName, 1)
  assert.equal((await supervisor.context.request.get(`/api/projects/${fixture.project_id}`)).status(), 200,
    'Removing a team member must not revoke direct project access')
  await removeMember(owner.page, picName, 0)
  assert.equal((await member.context.request.get(`/api/projects/${fixture.project_id}`)).status(), 403,
    'Removing last team grant must revoke derived project access')
  console.log('PASS removing team members retains direct membership but revokes derived access')

  await addMember(owner.page, fixture.team_member_id, 'browser-team-member@example.test')
  owner.page.once('dialog', dialog => dialog.accept())
  await owner.page.getByRole('button', { name: 'Nonaktifkan tim' }).click()
  await owner.page.getByRole('button', { name: 'Aktifkan tim' }).waitFor()
  assert.equal((await member.context.request.get(`/api/projects/${fixture.project_id}`)).status(), 403)
  owner.page.once('dialog', dialog => dialog.accept())
  await owner.page.getByRole('button', { name: 'Aktifkan tim' }).click()
  await owner.page.getByRole('button', { name: 'Nonaktifkan tim' }).waitFor()
  assert.equal((await member.context.request.get(`/api/projects/${fixture.project_id}`)).status(), 200)
  console.log('PASS team deactivation/reactivation safely controls derived grants')

  const admin = await session('browser-admin@example.test')
  assert.equal(await admin.page.getByRole('button', { name: 'Buat tim' }).count(), 1)
  assert.equal((await admin.context.request.get(`/api/teams/${teamId}`)).status(), 200)

  const mobile = await session('browser-team-member@example.test', {
    viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
  })
  await mobile.page.getByText('Tim CI E2E').waitFor()
  assert.equal(await mobile.page.getByRole('button', { name: 'Buat tim' }).count(), 0)
  assert.equal((await mobile.context.request.get(`/api/projects/${fixture.foreign_project_id}`)).status(), 403)
  console.log('PASS Admin access, PIC project-specific mobile view')
} finally {
  await Promise.all(contexts.map(value => value.close()))
  await browser.close()
}
