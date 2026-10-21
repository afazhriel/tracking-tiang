import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiUpstreamOrigin } from '../lib/upstream.mjs'

test('default upstream uses the existing HTTPS domain and normalizes explicit origins', () => {
  assert.equal(apiUpstreamOrigin({ NODE_ENV: 'production' }), 'https://pjl.ituiot.com')
  assert.equal(apiUpstreamOrigin({ API_UPSTREAM_ORIGIN: 'https://api.example.test/' }), 'https://api.example.test')
  assert.equal(apiUpstreamOrigin({ API_PROXY_ORIGIN: 'https://legacy.example.test' }), 'https://legacy.example.test')
  assert.equal(apiUpstreamOrigin({ API_UPSTREAM_ORIGIN: 'https://new.example.test', API_PROXY_ORIGIN: 'https://old.example.test' }), 'https://new.example.test')
})

test('production rejects public plaintext upstreams while allowing isolated loopback tests', () => {
  for (const host of ['187.77.112.247', 'example.test', 'localhost.evil.test', '10.0.0.1']) {
    assert.throws(() => apiUpstreamOrigin({ NODE_ENV: 'production', API_UPSTREAM_ORIGIN: `http://${host}` }))
  }
  assert.equal(apiUpstreamOrigin({ NODE_ENV: 'production', API_UPSTREAM_ORIGIN: 'http://127.0.0.1:9' }), 'http://127.0.0.1:9')
})

test('invalid or credential-bearing upstreams fail without echoing their values', () => {
  for (const value of ['garbage', 'ftp://example.test', 'https://user:private@example.test', 'https://example.test/api', 'https://example.test?token=private', 'https://example.test/#fragment']) {
    assert.throws(() => apiUpstreamOrigin({ API_UPSTREAM_ORIGIN: value }), (error) => !error.message.includes('private'))
  }
})
