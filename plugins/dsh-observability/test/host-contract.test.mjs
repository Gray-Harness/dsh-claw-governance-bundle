import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, inject, name, _internal } from '../host.js'

function fakeCtx() {
  const routes = []
  const disposed = []
  const effects = []
  return {
    routes,
    disposed,
    connection: {
      fetch: {
        register(entry) {
          routes.push(entry)
          return () => disposed.push(entry.path)
        },
      },
    },
    effect(factory) { effects.push(factory) },
    stop() {
      for (const factory of effects) {
        const dispose = factory()
        if (typeof dispose === 'function') dispose()
      }
    },
  }
}

test('host named exports', () => {
  assert.equal(name, 'dsh-claw-observability')
  assert.deepEqual(inject, ['connection'])
})

test('apply registers the query route and disposes it', () => {
  const ctx = fakeCtx()
  apply(ctx)
  assert.equal(ctx.routes.length, 1)
  assert.equal(ctx.routes[0].path, '/api/dsh-claw/observability/query')
  assert.deepEqual(ctx.routes[0].methods, ['POST'])
  ctx.stop()
  assert.deepEqual(ctx.disposed, ['/api/dsh-claw/observability/query'])
})

test('query returns newest sanitized events via Connection Fetch Request', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dob-'))
  _internal.setDshHome(home)
  await mkdir(join(home, 'agent-observe'), { recursive: true })
  await writeFile(join(home, 'agent-observe', 'diag.jsonl'), [
    JSON.stringify({ plugin: 'dsh-claw-gate', outcome: 'started', ts: '2026-08-18T10:00:00.000Z', token: 'secret' }),
    JSON.stringify({ plugin: 'dsh-claw-registry', outcome: 'failed', code: 'REGISTRY_SAVE_FAILED', ts: '2026-08-18T11:00:00.000Z', traceId: 'tr_1' }),
    '',
  ].join('\n'))
  const ctx = fakeCtx()
  apply(ctx)
  const res = await ctx.routes[0].fetch(new Request('dsh-app://host/api/dsh-claw/observability/query', {
    method: 'POST',
    body: JSON.stringify({ limit: 10 }),
  }))
  assert.equal(res.status, 200)
  const payload = await res.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.items.length, 2)
  assert.equal(payload.items[0].code, 'REGISTRY_SAVE_FAILED')
  assert.equal(payload.items[0].token, undefined)
  assert.equal(payload.items[1].outcome, 'started')
  assert.equal(payload.truncated, false)
  assert.equal(payload.hasMore, false)
  assert.equal(payload.nextCursor, null)

  const bad = await ctx.routes[0].fetch(new Request('dsh-app://host/api/dsh-claw/observability/query', {
    method: 'GET',
  }))
  assert.equal(bad.status, 405)
})

test('query pages with limit + cursor and rejects malformed cursors', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dob-page-'))
  _internal.setDshHome(home)
  await mkdir(join(home, 'agent-observe'), { recursive: true })
  await writeFile(join(home, 'agent-observe', 'diag.jsonl'), Array.from({ length: 5 }, (_, i) => (
    JSON.stringify({ plugin: 'dsh-claw-gate', outcome: 'started', durationMs: i })
  )).join('\n') + '\n')
  const ctx = fakeCtx()
  apply(ctx)
  const query = (body) => ctx.routes[0].fetch(new Request('dsh-app://host/api/dsh-claw/observability/query', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  const first = await (await query({ limit: 2 })).json()
  assert.deepEqual(first.items.map((row) => row.durationMs), [4, 3])
  assert.equal(first.truncated, true)
  assert.equal(first.hasMore, true)
  const second = await (await query({ limit: 2, cursor: first.nextCursor })).json()
  assert.deepEqual(second.items.map((row) => row.durationMs), [2, 1])
  const last = await (await query({ limit: 2, cursor: second.nextCursor })).json()
  assert.deepEqual(last.items.map((row) => row.durationMs), [0])
  assert.equal(last.nextCursor, null)

  const bad = await query({ cursor: '../etc' })
  assert.equal(bad.status, 400)
  const payload = await bad.json()
  assert.equal(payload.code, 'DIAG_CURSOR_INVALID')
})
