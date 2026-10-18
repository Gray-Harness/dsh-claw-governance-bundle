import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CODES, currentTraceId, diagFile, operation, runWithTrace, setObserveHome } from '../observe.mjs'
import { sanitizeEvent } from '../sanitize.mjs'
import { readDiag } from '../store.mjs'

test('sanitize drops secrets and unknown fields', () => {
  const row = sanitizeEvent({
    plugin: 'dsh-claw-memory',
    operation: 'write_vault',
    outcome: 'failed',
    token: 'ghp_secret',
    prompt: 'full prompt',
    error: { name: 'Error', message: 'bearer abc failed' },
    extra: { dump: true },
  })
  assert.equal(row.plugin, 'dsh-claw-memory')
  assert.equal(row.token, undefined)
  assert.equal(row.prompt, undefined)
  assert.equal(row.extra, undefined)
  assert.equal(row.error.message, '[redacted]')
})

test('sanitize scrubs home paths, token values and credential assignments by default', () => {
  const home = homedir()
  const row = sanitizeEvent({
    plugin: 'dsh-claw-registry',
    slug: 'demo sk-abcdefghijklmnop',
    tool: 'read ' + home + '/proj/.env',
    state: 'password=hunter2 ok',
    decision: { raw: 'object payloads are dropped' },
    durationMs: Number.NaN,
    fileCount: 3,
    reason: 'cannot open /Users/someone/notes.md',
    skipReason: 'C:\\Users\\someone\\x.txt missing',
    remainingArtifacts: [home + '/.dsh/workspace-agents/demo', 42],
    recovery: { attempted: true, outcome: home + '/rollback' },
    error: new Error('EACCES ' + home + '/.dsh/agent-observe/diag.jsonl'),
  })
  const text = JSON.stringify(row)
  assert.equal(text.includes(home), false)
  assert.equal(row.slug, 'demo [redacted]')
  assert.equal(row.tool, 'read ~/proj/.env')
  assert.equal(row.state, 'password=[redacted] ok')
  assert.equal(row.decision, undefined)
  assert.equal(row.durationMs, undefined)
  assert.equal(row.fileCount, 3)
  assert.equal(row.reason, 'cannot open ~/notes.md')
  assert.equal(row.skipReason, '~\\x.txt missing')
  assert.deepEqual(row.remainingArtifacts, ['~/.dsh/workspace-agents/demo'])
  assert.equal(row.recovery.outcome, '~/rollback')
  assert.equal(row.error.message, 'EACCES ~/.dsh/agent-observe/diag.jsonl')
})

test('sanitize redacts prompt secrets in free text and on read-back', async () => {
  assert.equal(sanitizeEvent({ reason: 'prompt said my api_key is 123' }).reason, '[redacted]')
  assert.equal(sanitizeEvent({ error: 'Authorization: Basic Zm9vOmJhcg==' }).error.message, '[redacted]')
  const home = await mkdtemp(join(tmpdir(), 'obs-read-'))
  await mkdir(join(home, 'agent-observe'), { recursive: true })
  await writeFile(diagFile(home), JSON.stringify({ plugin: 'legacy', tool: homedir() + '/x ghp_abcdefghijklmnopqrstuv', cookie: 'c' }) + '\n')
  const [legacy] = readDiag(home, 10).items
  assert.deepEqual(legacy, { plugin: 'legacy', tool: '~/x [redacted]' })
})

test('runWithTrace accepts Request headers, plain headers and { traceId }', async () => {
  setObserveHome(join(tmpdir(), 'obs-hdr'))
  const request = new Request('dsh-app://host/x', { headers: { 'X-DSH-Trace': 'tr_fromheader' } })
  await runWithTrace(request, async () => assert.equal(currentTraceId(), 'tr_fromheader'))
  runWithTrace({ headers: { 'X-Dsh-Trace-Id': 'tr_plainobj' } }, () => assert.equal(currentTraceId(), 'tr_plainobj'))
  runWithTrace({ traceId: 'tr_option' }, () => assert.equal(currentTraceId(), 'tr_option'))
})

test('runWithTrace rejects malformed incoming trace ids', () => {
  setObserveHome(join(tmpdir(), 'obs-bad'))
  for (const bad of ['../../etc', 'x'.repeat(65), 'tr bad', 'Bearer sk-abcdefghijk']) {
    runWithTrace(bad, () => {
      assert.notEqual(currentTraceId(), bad)
      assert.match(currentTraceId(), /^tr_[0-9a-f]{12}$/)
    })
  }
  const op = operation({ plugin: 'dsh-claw-gate', operation: 'x', traceId: 'has space' })
  assert.match(op.traceId, /^tr_[0-9a-f]{12}$/)
})

test('runWithTrace derives one trace per tool call tree and inherits into delegate entry', () => {
  setObserveHome(join(tmpdir(), 'obs-tool'))
  const root = { callId: 'call_root', name: 'memory', arguments: {} }
  const nested = { callId: 'call_root:ptc:1', rootCallId: 'call_root', name: 'delegate_handoff', arguments: {} }
  let rootTrace = ''
  runWithTrace(root, () => {
    rootTrace = currentTraceId()
    assert.match(rootTrace, /^tr_[0-9a-f]{12}$/)
    runWithTrace(undefined, () => assert.equal(currentTraceId(), rootTrace))
    const op = operation({ plugin: 'dsh-claw-delegate', operation: 'create_child' })
    assert.equal(op.traceId, rootTrace)
  })
  runWithTrace(nested, () => assert.equal(currentTraceId(), rootTrace))
  runWithTrace({ callId: 'call_other' }, () => assert.notEqual(currentTraceId(), rootTrace))
  runWithTrace('tr_http', () => {
    runWithTrace(nested, () => assert.equal(currentTraceId(), 'tr_http'))
  })
})

test('operation emits one terminal and keeps a trace', async () => {
  const home = await mkdtemp(join(tmpdir(), 'obs-'))
  setObserveHome(home)
  const op = operation({ plugin: 'dsh-claw-registry', feature: 'agent', operation: 'create_agent' })
  op.start()
  op.stage('reserve_dir')
  const done = op.success({ slug: 'demo' })
  assert.equal(done.outcome, 'succeeded')
  assert.match(done.traceId, /^tr_/)
  assert.equal(op.success({ slug: 'again' }), null)
  const text = await readFile(diagFile(home), 'utf8')
  const rows = text.trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(rows.filter((row) => row.outcome === 'succeeded').length, 1)
  assert.ok(rows.some((row) => row.outcome === 'started'))
})

test('runWithTrace inherits across child operations', () => {
  setObserveHome(join(tmpdir(), 'obs-als'))
  runWithTrace('tr_fixedtrace01', () => {
    assert.equal(currentTraceId(), 'tr_fixedtrace01')
    const parent = operation({ plugin: 'dsh-claw-registry', operation: 'create_agent' })
    parent.run(() => {
      const child = operation({ plugin: 'dsh-claw-identity', operation: 'write_identity' })
      assert.equal(child.traceId, 'tr_fixedtrace01')
      assert.equal(child.parentOperationId, parent.operationId)
      child.degraded(CODES.MEMORY_READ_FALLBACK_EMPTY, { skipReason: 'enoent' })
    })
    parent.success()
  })
})
