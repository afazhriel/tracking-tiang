import assert from 'node:assert/strict'
import { test } from 'node:test'
import { productionPolicyErrors } from '../check-production-policy.mjs'

const sha = 'a'.repeat(40)
const branch = { name: 'main', protected: true, commit: { sha } }
const environment = { protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 1 } }] }], deployment_branch_policy: { protected_branches: true } }

test('protected main, exact commit and production approval can proceed', () => {
  assert.deepEqual(productionPolicyErrors(branch, environment, null, sha), [])
})
test('unprotected main and stale commits are rejected', () => {
  assert.ok(productionPolicyErrors({ ...branch, protected: false }, environment, null, sha).length)
  assert.ok(productionPolicyErrors(branch, environment, null, 'b'.repeat(40)).length)
})
test('unconfigured production environment cannot proceed', () => {
  assert.equal(productionPolicyErrors(branch, { protection_rules: [], deployment_branch_policy: null }, null, sha).length, 2)
})
test('custom policies must explicitly permit main as a branch', () => {
  const custom = { ...environment, deployment_branch_policy: { custom_branch_policies: true } }
  assert.deepEqual(productionPolicyErrors(branch, custom, { branch_policies: [{ name: 'main', type: 'branch' }] }, sha), [])
  for (const policy of [{ name: '*', type: 'branch' }, { name: 'main', type: 'tag' }, { name: 'develop', type: 'branch' }]) {
    assert.ok(productionPolicyErrors(branch, custom, { branch_policies: [policy] }, sha).length)
  }
  assert.ok(productionPolicyErrors(branch, custom, { branch_policies: [{ name: 'main' }, { name: '*' }] }, sha).length)
})
test('an empty reviewer rule does not count as approval protection', () => {
  assert.ok(productionPolicyErrors(branch, { ...environment, protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }, null, sha).length)
})
