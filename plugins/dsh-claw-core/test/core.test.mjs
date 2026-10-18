import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { forEachLiveAgent, listLiveAgents } from '../live-agents.mjs'
import {
  canonicalizePath,
  clawAgentsRoot,
  defaultDshHome,
  escapesHome,
  isPathInside,
} from '../path-containment.mjs'
import { classifySession, isClawPresetId } from '../session-classifier.mjs'
import { ClawDegradedError, SubagentStaleError, clawError } from '../errors.mjs'
import { CORE_VERSION, SUPPORTED_DSH, SUPPORTED_DSH_PEER } from '../version.mjs'

test('live-agents uses list only (never values)', () => {
  const seen = []
  const agents = {
    list() {
      return [{ id: 'a' }, { id: 'b' }]
    },
    values() {
      throw new Error('agents.values must not be called')
    },
  }
  forEachLiveAgent({ agents }, (a) => seen.push(a.id))
  assert.deepEqual(seen, ['a', 'b'])
  assert.deepEqual(listLiveAgents({ agents }).map((a) => a.id), ['a', 'b'])
  assert.deepEqual(listLiveAgents({}), [])
  assert.deepEqual(listLiveAgents({ agents: {} }), [])
})

test('live-agents accepts agents bag directly', () => {
  const seen = []
  const agents = {
    list() { return [{ id: 'x' }] },
    values() { throw new Error('agents.values must not be called') },
  }
  forEachLiveAgent(agents, (a) => seen.push(a.id))
  assert.deepEqual(seen, ['x'])
  assert.deepEqual(listLiveAgents(agents).map((a) => a.id), ['x'])
})

test('live-agents propagates list() throws', () => {
  assert.throws(
    () => forEachLiveAgent({ agents: { list() { throw new Error('list down') } } }, () => {}),
    /list down/,
  )
})

test('version constants', () => {
  assert.equal(CORE_VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
  assert.equal(SUPPORTED_DSH, '0.2.0-rc.2')
  assert.equal(SUPPORTED_DSH_PEER, '^0.2.0-rc.1')
})

test('errors helpers', () => {
  const e = clawError('ClawDegradedError', 'down', { reason: 'x' })
  assert.equal(e.name, 'ClawDegradedError')
  assert.equal(e.code, 'ClawDegradedError')
  assert.equal(e.details.reason, 'x')
  const d = new ClawDegradedError('deg')
  assert.equal(d.name, 'ClawDegradedError')
  const s = new SubagentStaleError('stale')
  assert.equal(s.name, 'SubagentStaleError')
})

test('path containment: inside / escapes / symlink-ish', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-core-'))
  const claw = join(home, 'DSclaw', 'bot1')
  mkdirSync(claw, { recursive: true })
  writeFileSync(join(claw, 'IDENTITY.md'), 'x')

  const root = canonicalizePath(join(home, 'DSclaw'))
  const insideFile = canonicalizePath(join(claw, 'IDENTITY.md'))
  const desktop = canonicalizePath(join(home, 'Desktop'))
  assert.equal(isPathInside(root, insideFile), true)
  assert.equal(isPathInside(root, desktop), false)
  assert.equal(escapesHome(root, desktop), true)
  assert.equal(escapesHome(root, insideFile), false)

  const outside = join(home, 'outside')
  mkdirSync(outside, { recursive: true })
  const alias = join(home, 'DSclaw', 'alias-link')
  try {
    symlinkSync(outside, alias)
  } catch {
    // Some CI filesystems disallow symlinks; skip symlink assertion.
    return
  }
  const realAlias = canonicalizePath(alias)
  assert.equal(isPathInside(root, realAlias), false)
  assert.equal(escapesHome(root, realAlias), true)
})

test('defaultDshHome / clawAgentsRoot', () => {
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/fake-dsh-home'
  try {
    assert.equal(defaultDshHome(), '/tmp/fake-dsh-home')
    assert.equal(clawAgentsRoot(defaultDshHome()), join('/tmp/fake-dsh-home', 'DSclaw'))
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
  }
})

test('isClawPresetId', () => {
  assert.equal(isClawPresetId('wa-template'), true)
  assert.equal(isClawPresetId('wa-bot1'), true)
  assert.equal(isClawPresetId('standard'), false)
  assert.equal(isClawPresetId(''), false)
})

test('classifier: claw via canonical cwd under DSclaw', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  const bot = join(home, 'DSclaw', 'bot1')
  mkdirSync(bot, { recursive: true })
  assert.equal(
    classifySession({ dshHome: home, cwd: bot, canonicalCwd: bot }),
    'claw',
  )
})

test('classifier: ordinary unmarked session', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  mkdirSync(join(home, 'DSclaw'), { recursive: true })
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: join(home, 'projects', 'app'),
      agentPreset: 'standard',
    }),
    'ordinary',
  )
})

test('classifier: registry missing alone stays ordinary', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  mkdirSync(join(home, 'DSclaw'), { recursive: true })
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: '/Users/qin/Desktop/work',
      agentPreset: 'standard',
      bindings: null,
    }),
    'ordinary',
  )
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: '/Users/qin/Desktop/work',
    }),
    'ordinary',
  )
})

test('classifier: claw via binding workspaceId / canonicalRoot', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  const bot = join(home, 'DSclaw', 'bot1')
  mkdirSync(bot, { recursive: true })
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: '/tmp/elsewhere',
      workspaceId: 'ws-1',
      bindings: {
        a: { workspaceId: 'ws-1', canonicalRoot: bot, agentId: 'wa_1' },
      },
    }),
    'claw',
  )
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: bot,
      bindings: new Map([
        ['a', { workspaceId: 'ws-x', canonicalRoot: bot, agentId: 'wa_1' }],
      ]),
    }),
    'claw',
  )
})

test('classifier: claw via wa-* / wa-template preset', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  mkdirSync(join(home, 'DSclaw'), { recursive: true })
  assert.equal(
    classifySession({ dshHome: home, cwd: '/tmp/proj', agentPreset: 'wa-bot1' }),
    'claw',
  )
  assert.equal(
    classifySession({ dshHome: home, cwd: '/tmp/proj', agentPreset: 'wa-template' }),
    'claw',
  )
})

test('classifier: uncertain when DSclaw-looking path fails canonicalize containment', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  mkdirSync(join(home, 'DSclaw'), { recursive: true })
  const fakeRaw = join(home, 'DSclaw', 'ghost-bot')
  // Path string looks like DSclaw but we force canonical outside via explicit canonicalCwd
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: fakeRaw,
      canonicalCwd: join(home, 'outside-escape'),
    }),
    'claw-uncertain',
  )
})

test('classifier: conflict path claw vs preset+binding ordinary', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  const bot = join(home, 'DSclaw', 'bot1')
  mkdirSync(bot, { recursive: true })
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: bot,
      canonicalCwd: bot,
      agentPreset: 'standard',
      workspaceId: 'ws-other',
      bindings: {
        a: { workspaceId: 'ws-1', canonicalRoot: join(home, 'other'), agentId: 'x' },
      },
    }),
    'claw-uncertain',
  )
})

test('classifier: conflict outside path + claw preset + binding miss', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-claw-cls-'))
  mkdirSync(join(home, 'DSclaw'), { recursive: true })
  assert.equal(
    classifySession({
      dshHome: home,
      cwd: join(home, 'projects', 'app'),
      agentPreset: 'wa-bot1',
      workspaceId: 'ws-missing',
      bindings: {
        a: { workspaceId: 'ws-1', canonicalRoot: join(home, 'DSclaw', 'other'), agentId: 'x' },
      },
    }),
    'claw-uncertain',
  )
})
