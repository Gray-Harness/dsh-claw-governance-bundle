import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply, inject, name, _internal } from '../host.js'

function fakeCtx() {
  const routes = []
  const disposed = []
  const effects = []
  return {
    routes,
    disposed,
    systemPrompt: {
      section() { return () => {} },
    },
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
  assert.equal(name, 'dsh-claw-identity')
  assert.deepEqual(inject, ['systemPrompt', 'connection'])
})

test('host never starts an idle heartbeat ticker', () => {
  const src = readFileSync(new URL('../host.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /setInterval/)
  assert.doesNotMatch(src, /tickHeartbeats/)
  assert.doesNotMatch(src, /agent\.followup/)
})

test('identity write rejects vault files and traversal roots', async () => {
  const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'id-write-'))
  const root = join(home, 'DSclaw', 'alpha')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'SOUL.md'), 'old soul\n')
  await writeFile(join(root, 'MEMORY.md'), 'keep me\n')
  _internal.setDshHome(home)
  const ctx = fakeCtx()
  apply(ctx)
  const write = ctx.routes.find((row) => row.path === '/api/dsh-claw/identity/write')
  assert.ok(write)

  const vault = await write.fetch(new Request('dsh-app://host/api/dsh-claw/identity/write', {
    method: 'POST',
    body: JSON.stringify({ root, files: { 'MEMORY.md': 'x'.repeat(3200) } }),
  }))
  assert.equal(vault.status, 400)
  assert.equal(await readFile(join(root, 'MEMORY.md'), 'utf8'), 'keep me\n')

  const traversal = await write.fetch(new Request('dsh-app://host/api/dsh-claw/identity/write', {
    method: 'POST',
    body: JSON.stringify({ root: join(root, '..', '..', 'outside'), files: { 'SOUL.md': 'nope' } }),
  }))
  assert.equal(traversal.status, 400)
})

test('apply registers prompt section and routes', () => {
  const sections = []
  const ctx = fakeCtx()
  ctx.systemPrompt = {
    section(entry) {
      sections.push(entry)
      return () => {}
    },
  }
  apply(ctx)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'dsh-claw-identity')
  assert.equal(typeof sections[0].text, 'function')
  assert.equal(sections[0].text({}), '')
  assert.deepEqual(ctx.routes.map((row) => row.path), [
    '/api/dsh-claw/identity/read',
    '/api/dsh-claw/identity/write',
  ])
  for (const row of ctx.routes) {
    assert.deepEqual(row.methods, ['POST'])
    assert.equal(row.requestBody, 'buffered')
  }
  ctx.stop()
  assert.deepEqual(ctx.disposed, [
    '/api/dsh-claw/identity/read',
    '/api/dsh-claw/identity/write',
  ])
})
