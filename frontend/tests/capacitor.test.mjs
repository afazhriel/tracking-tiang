import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('remote WebView keeps its app identity and production origin while requiring HTTPS', async () => {
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'))
  assert.equal(config.appId, 'com.trackingtiang.app')
  assert.equal(config.server.url, 'https://pjl.ituiot.com')
  assert.equal(config.server.cleartext, false)
})
