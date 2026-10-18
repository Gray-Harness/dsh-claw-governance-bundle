import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { diagFile, readDiag } from '../store.mjs'

async function seed(lines) {
  const home = await mkdtemp(join(tmpdir(), 'dob-store-'))
  await mkdir(join(home, 'agent-observe'), { recursive: true })
  await writeFile(diagFile(home), lines.join('\n') + (lines.length ? '\n' : ''))
  return home
}

function row(seq) {
  return JSON.stringify({ plugin: 'dsh-claw-gate', outcome: 'started', operation: 'op_' + seq, durationMs: seq, reason: 'x'.repeat(120) })
}

function readAll(home, limit) {
  const seen = []
  let cursor
  let pages = 0
  for (;;) {
    const page = readDiag(home, limit, cursor)
    pages++
    assert.ok(page.items.length <= limit)
    assert.equal(page.truncated, page.hasMore)
    for (const item of page.items) seen.push(item.durationMs)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return { seen, pages }
}

test('readDiag pages newest-first across chunk boundaries without gaps or duplicates', async () => {
  const total = 5000
  const home = await seed(Array.from({ length: total }, (_, i) => row(i)))
  const { seen, pages } = readAll(home, 777)
  assert.equal(pages, Math.ceil(total / 777))
  assert.deepEqual(seen, Array.from({ length: total }, (_, i) => total - 1 - i))
})

test('readDiag clamps limit and reports a resumable cursor', async () => {
  const home = await seed(Array.from({ length: 2100 }, (_, i) => row(i)))
  const first = readDiag(home, 99999)
  assert.equal(first.items.length, 2000)
  assert.equal(first.hasMore, true)
  assert.match(first.nextCursor, /^\d+$/)
  const second = readDiag(home, 99999, first.nextCursor)
  assert.equal(second.items.length, 100)
  assert.equal(second.items[0].durationMs, 99)
  assert.equal(second.hasMore, false)
  assert.equal(second.nextCursor, null)
  assert.equal(readDiag(home).items.length, 500)
})

test('readDiag skips bad, partial and overlong lines', async () => {
  const home = await seed([row(0), 'not json', '[1,2]', 'y'.repeat(300000), row(1), ''])
  await appendFile(diagFile(home), '{"plugin":"half')
  const { seen } = readAll(home, 10)
  assert.deepEqual(seen, [1, 0])
})

test('readDiag rejects malformed cursors and clamps past-the-end ones', async () => {
  const home = await seed([row(0), row(1)])
  for (const bad of ['abc', '-1', '1.5', {}, true]) {
    assert.throws(() => readDiag(home, 10, bad), (err) => err.status === 400 && err.code === 'DIAG_CURSOR_INVALID')
  }
  assert.deepEqual(readDiag(home, 10, 10 ** 12).items.map((item) => item.durationMs), [1, 0])
  assert.deepEqual(readDiag(home, 10, 0), { items: [], truncated: false, hasMore: false, nextCursor: null })
})

test('readDiag on a missing file is empty', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dob-none-'))
  assert.deepEqual(readDiag(home, 10), { items: [], truncated: false, hasMore: false, nextCursor: null })
})

test('readDiag bounds each request on a huge file instead of loading it', async (t) => {
  const home = await seed([])
  t.after(() => rm(home, { recursive: true, force: true }))
  const file = diagFile(home)
  const size = 300 * 1048576
  await truncate(file, size)
  await appendFile(file, '\n' + row(7) + '\n')
  const started = Date.now()
  const page = readDiag(home, 10)
  assert.deepEqual(page.items.map((item) => item.durationMs), [7])
  assert.equal(page.hasMore, true)
  const next = Number(page.nextCursor)
  assert.ok(next > size - 9 * 1048576, 'scan stops after a bounded window')
  assert.ok(Date.now() - started < 5000)
})
