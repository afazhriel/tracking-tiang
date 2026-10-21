import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

test('Capacitor xcode tooling still generates valid project identifiers with patched uuid', () => {
  const cliRequire = createRequire(new URL('../node_modules/@capacitor/cli/package.json', import.meta.url))
  const xcode = cliRequire('xcode')
  const project = xcode.project('fixture.pbxproj')
  project.hash = { project: { objects: { PBXGroup: {} } } }
  const identifiers = new Set()
  for (let i = 0; i < 1000; i++) {
    const id = project.generateUuid()
    assert.match(id, /^[A-F0-9]{24}$/)
    identifiers.add(id)
    project.hash.project.objects.PBXGroup[id] = { isa: 'PBXGroup' }
  }
  assert.equal(identifiers.size, 1000)
})
