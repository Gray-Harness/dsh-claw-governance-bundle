import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLAW_API,
  clawApi,
  jsonResponse,
  publicErrorMessage,
  readJson,
  registerJsonRoute,
  statusOf,
} from '../http.mjs'

test('clawApi builds /api/dsh-claw paths', () => {
  assert.equal(clawApi('registry', 'list'), `${CLAW_API.registry}/list`)
  assert.equal(clawApi('observability', 'query'), `${CLAW_API.observability}/query`)
  assert.equal(clawApi('gate', ''), CLAW_API.gate)
})

test('jsonResponse serializes body and cache headers', async () => {
  const res = jsonResponse(201, { ok: true, n: 1 })
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await res.json(), { ok: true, n: 1 })
})

test('readJson parses empty and rejects oversized / invalid bodies', async () => {
  assert.deepEqual(await readJson(new Request('http://dsh.local/x', { method: 'POST', body: '' })), {})
  assert.deepEqual(await readJson(new Request('http://dsh.local/x', {
    method: 'POST',
    body: JSON.stringify({ a: 1 }),
  })), { a: 1 })

  await assert.rejects(
    () => readJson(new Request('http://dsh.local/x', { method: 'POST', body: 'not-json' })),
    (err) => err.code === 'INVALID_JSON' && err.status === 400,
  )
  await assert.rejects(
    () => readJson(new Request('http://dsh.local/x', {
      method: 'POST',
      body: 'x'.repeat(100),
    }), 10),
    (err) => err instanceof RangeError && err.status === 413,
  )
})

test('publicErrorMessage strips stacks and absolute paths', () => {
  const err = new Error('failed at /Users/qin/secret/file.json\n    at Object.apply (/Users/qin/DSH/host.js:1:1)')
  const msg = publicErrorMessage(err)
  assert.equal(msg.includes('/Users/qin'), false)
  assert.equal(msg.includes('at Object'), false)
  assert.match(msg, /\[path\]/)
})

test('statusOf maps RangeError and explicit status', () => {
  assert.equal(statusOf(new RangeError('big')), 413)
  assert.equal(statusOf(Object.assign(new Error('no'), { status: 409 })), 409)
  assert.equal(statusOf(new Error('x')), 400)
})

test('registerJsonRoute wires Connection Fetch and disposes', async () => {
  const registered = []
  const disposed = []
  const effects = []
  const ctx = {
    connection: {
      fetch: {
        register(entry) {
          registered.push(entry)
          return () => disposed.push(entry.path)
        },
      },
    },
    effect(factory) {
      effects.push(factory)
    },
  }

  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/observability/query',
    handle: async (input) => ({ items: [input.limit || 0] }),
  })

  assert.equal(registered.length, 1)
  assert.equal(registered[0].path, '/api/dsh-claw/observability/query')
  assert.deepEqual(registered[0].methods, ['POST'])
  assert.equal(registered[0].requestBody, 'buffered')
  assert.equal(effects.length, 1)

  const ok = await registered[0].fetch(new Request('dsh-app://host/api/dsh-claw/observability/query', {
    method: 'POST',
    body: JSON.stringify({ limit: 3 }),
  }))
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { ok: true, items: [3] })

  const badMethod = await registered[0].fetch(new Request('dsh-app://host/api/dsh-claw/observability/query', {
    method: 'GET',
  }))
  assert.equal(badMethod.status, 405)

  const stop = effects[0]()
  stop()
  assert.deepEqual(disposed, ['/api/dsh-claw/observability/query'])
})

test('registerJsonRoute rejects non-claw paths and missing connection', () => {
  assert.throws(
    () => registerJsonRoute({ effect() {}, connection: { fetch: { register() {} } } }, {
      path: '/dsh-claw-observability/query',
      handle: async () => ({}),
    }),
    /\/api\/dsh-claw\//,
  )
  assert.throws(
    () => registerJsonRoute({ effect() {} }, {
      path: '/api/dsh-claw/x',
      handle: async () => ({}),
    }),
    /unavailable/,
  )
})

test('registerJsonRoute maps handle errors without leaking paths', async () => {
  let fetchFn
  const ctx = {
    connection: {
      fetch: {
        register(entry) {
          fetchFn = entry.fetch
          return () => {}
        },
      },
    },
    effect() {},
  }
  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/gate/audit',
    handle: async () => {
      throw Object.assign(new Error('boom /Users/qin/private/key'), { code: 'AUDIT_FAIL', status: 400 })
    },
  })
  const res = await fetchFn(new Request('http://127.0.0.1/api/dsh-claw/gate/audit', {
    method: 'POST',
    body: '{}',
  }))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.ok, false)
  assert.equal(body.code, 'AUDIT_FAIL')
  assert.equal(body.error.includes('/Users/qin'), false)
})
