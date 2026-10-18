import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isClawHomePath, isDsClawPath, isIdentityFile, isWritableIdentityFile, renderIdentityPrompt, safeJoin } from '../identity-files.mjs'

test('only DSclaw paths are identity roots', () => {
  const home = '/Users/qin/.dsh'
  assert.equal(isDsClawPath('/Users/qin/.dsh/DSclaw/test1', home), true)
  assert.equal(isDsClawPath('/Users/qin/DSH', home), false)
  assert.equal(isDsClawPath('/tmp/DSclaw/x/../../outside', '/tmp'), false)
  assert.equal(isDsClawPath('/Users/qin/.dsh/DSclaw/test1/../../workspace-agents', home), false)
  assert.equal(isIdentityFile('SOUL.md'), true)
  assert.equal(isIdentityFile('TOOLS.md'), true)
  assert.equal(isIdentityFile('IDENTITY.md'), true)
  assert.equal(isIdentityFile('HEARTBEAT.md'), true)
  assert.equal(isIdentityFile('MEMORY.md'), true)
  assert.equal(isIdentityFile('BOOTSTRAP.md'), true)
  assert.equal(isIdentityFile('secret.txt'), false)
  assert.equal(isWritableIdentityFile('SOUL.md'), true)
  assert.equal(isWritableIdentityFile('MEMORY.md'), false)
  assert.equal(isWritableIdentityFile('USER.md'), false)
})

test('isClawHomePath uses join containment, not a slash prefix', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-claw-'))
  const inside = join(home, 'DSclaw', 'a')
  const desktop = join(home, 'Desktop')
  await mkdir(inside, { recursive: true })
  await mkdir(desktop, { recursive: true })
  assert.equal(isClawHomePath(home, inside), true)
  assert.equal(isClawHomePath(home, desktop), false)
  assert.equal(isClawHomePath(home, join(home, 'DSclaw')), false)
})

test('safeJoin refuses path escape', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-join-'))
  const root = join(home, 'DSclaw', 'test1')
  await mkdir(root, { recursive: true })
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    assert.equal(safeJoin(root, 'SOUL.md'), join(root, 'SOUL.md'))
    assert.equal(safeJoin(join(home, 'Desktop'), 'SOUL.md'), '')
    assert.equal(safeJoin(root, '../x'), '')
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})

test('renderIdentityPrompt skips empty files', () => {
  const text = renderIdentityPrompt({
    'SOUL.md': 'You are test1.\n',
    'AGENTS.md': '',
    'TOOLS.md': 'use bash carefully',
  })
  assert.match(text, /SOUL\.md/)
  assert.match(text, /You are test1/)
  assert.match(text, /TOOLS\.md/)
  assert.doesNotMatch(text, /AGENTS\.md/)
  assert.doesNotMatch(text, /MEMORY\.md/)
})

test('USER MEMORY and HEARTBEAT stay off the identity prompt', () => {
  const text = renderIdentityPrompt({
    'SOUL.md': 'soul',
    'USER.md': 'Speak Chinese.\n',
    'MEMORY.md': 'secret diary',
    'HEARTBEAT.md': 'every: 30m\n\nreply HEARTBEAT_OK',
    'TOOLS.md': 'use bash carefully',
  })
  assert.match(text, /TOOLS\.md/)
  assert.doesNotMatch(text, /USER\.md/)
  assert.doesNotMatch(text, /Speak Chinese/)
  assert.doesNotMatch(text, /MEMORY\.md/)
  assert.doesNotMatch(text, /secret diary/)
  assert.doesNotMatch(text, /HEARTBEAT/)
  assert.doesNotMatch(text, /HEARTBEAT_OK/)
})

test('BOOTSTRAP.md is injected until deleted', () => {
  const pending = renderIdentityPrompt({
    'SOUL.md': 'soul',
    'BOOTSTRAP.md': 'Ask what to call you.\n',
  })
  assert.match(pending, /BOOTSTRAP\.md/)
  assert.match(pending, /Ask what to call you/)
  assert.match(pending, /first-run is not done/)
  assert.match(pending, /folder name/)
  const done = renderIdentityPrompt({
    'SOUL.md': 'soul',
    'BOOTSTRAP.md': '',
  })
  assert.doesNotMatch(done, /BOOTSTRAP/)
  assert.doesNotMatch(done, /first-run/)
})
