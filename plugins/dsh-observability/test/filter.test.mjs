import assert from 'node:assert/strict'
import test from 'node:test'
import { diagFacets, filterDiag, serializeDiag } from '../observe-filter.mjs'

const now = Date.parse('2026-08-18T12:00:00.000Z')

function row(extra) {
  return {
    ts: '2026-08-18T12:00:00.000Z',
    plugin: 'dsh-claw-registry',
    operation: 'create_agent',
    outcome: 'succeeded',
    traceId: 'tr_abc',
    ...extra,
  }
}

test('filterDiag keeps last-selected outcome and trace', () => {
  const rows = [
    row({ outcome: 'started' }),
    row({ outcome: 'failed', code: 'REGISTRY_SAVE_FAILED', plugin: 'dsh-claw-memory', operation: 'write_vault', traceId: 'tr_mem' }),
    row({ ts: '2026-08-10T12:00:00.000Z', outcome: 'failed', code: 'OLD' }),
  ]
  const failed = filterDiag(rows, { range: 'today', outcome: 'failed' }, now)
  assert.equal(failed.length, 1)
  assert.equal(failed[0].code, 'REGISTRY_SAVE_FAILED')
  const traced = filterDiag(rows, { range: 'all', trace: 'tr_mem' }, now)
  assert.equal(traced.length, 1)
  assert.equal(traced[0].plugin, 'dsh-claw-memory')
  const coded = filterDiag(rows, { range: 'all', code: 'REGISTRY_SAVE_FAILED' }, now)
  assert.equal(coded.length, 1)
})

test('diagFacets lists plugins and codes', () => {
  const facets = diagFacets([
    row({ code: 'A' }),
    row({ plugin: 'dsh-claw-gate', code: 'B' }),
    row({ plugin: 'dsh-claw-gate', code: 'A' }),
  ])
  assert.deepEqual(facets.plugins, ['dsh-claw-gate', 'dsh-claw-registry'])
  assert.deepEqual(facets.codes, ['A', 'B'])
})

test('serializeDiag writes markdown without pipes breaking', () => {
  const md = serializeDiag([row({ code: 'X|Y', error: { message: 'boom' } })], 'md')
  assert.match(md, /create_agent/)
  assert.match(md, /X\\\|Y/)
})
