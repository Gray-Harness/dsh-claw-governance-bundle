import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHeartbeat, parseInterval, shouldTick } from '../identity-heartbeat.mjs'

test('heartbeat is off when the file is empty or interval is 0', () => {
  assert.equal(parseHeartbeat('').enabled, false)
  assert.equal(parseHeartbeat('every: 0\n\ncheck mail').enabled, false)
  assert.equal(parseHeartbeat('# Heartbeat\n\n').enabled, false)
})

test('every line sets the interval; missing every defaults to 30m', () => {
  assert.equal(parseInterval('15m'), 15 * 60 * 1000)
  assert.equal(parseInterval('2h'), 2 * 3600000)
  const parsed = parseHeartbeat('every: 15m\n\nCheck inbox.\n')
  assert.equal(parsed.enabled, true)
  assert.equal(parsed.intervalMs, 15 * 60 * 1000)
  assert.equal(parsed.instructions, 'Check inbox.')
  assert.equal(parseHeartbeat('Check inbox.').intervalMs, 30 * 60 * 1000)
})

test('first sighting does not tick; later due stamps do', () => {
  assert.equal(shouldTick(null, 1000, 5000), false)
  assert.equal(shouldTick(1000, 1000, 1999), false)
  assert.equal(shouldTick(1000, 1000, 2000), true)
})
