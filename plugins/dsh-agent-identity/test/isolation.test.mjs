import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isDsClawPath, renderIdentityPrompt, safeJoin } from '../identity-files.mjs'
import { apply, _internal } from '../host.js'

async function clawRoot(home, slug) {
  const root = join(home, 'DSclaw', slug)
  await mkdir(root, { recursive: true })
  return root
}

function mountHost(home) {
  const routes = []
  const sections = []
  _internal.setDshHome(home)
  apply({
    systemPrompt: { section(entry) { sections.push(entry); return () => {} } },
    connection: { fetch: { register(entry) { routes.push(entry); return () => {} } } },
    effect() {},
  })
  const call = async (suffix, body) => {
    const route = routes.find((row) => row.path === '/api/dsh-claw/identity/' + suffix)
    const res = await route.fetch(new Request('dsh-app://host' + route.path, { method: 'POST', body: JSON.stringify(body) }))
    return { status: res.status, body: await res.json() }
  }
  const prompt = (agent) => sections[0].text({ agent })
  return { call, prompt }
}

function agentAt(id, cwd) {
  return { id, session: { header: { cwd } } }
}

test('two Claw agents do not share identity prompt text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-iso-'))
  const a = await clawRoot(home, 'alpha')
  const b = await clawRoot(home, 'beta')
  await writeFile(join(a, 'SOUL.md'), 'You are Alpha.\n')
  await writeFile(join(b, 'SOUL.md'), 'You are Beta.\n')
  const promptA = renderIdentityPrompt({ 'SOUL.md': 'You are Alpha.\n' })
  const promptB = renderIdentityPrompt({ 'SOUL.md': 'You are Beta.\n' })
  assert.match(promptA, /Alpha/)
  assert.doesNotMatch(promptA, /Beta/)
  assert.match(promptB, /Beta/)
  assert.doesNotMatch(promptB, /Alpha/)
  assert.equal(safeJoin(a, 'SOUL.md', home), a + '/SOUL.md')
  assert.notEqual(safeJoin(a, 'SOUL.md', home), safeJoin(b, 'SOUL.md', home))
})

test('a symlink into DSclaw still counts as an identity root', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-link-'))
  const real = await clawRoot(home, 'alpha')
  const alias = join(home, 'alias-alpha')
  await symlink(real, alias)
  assert.equal(isDsClawPath(real, home), true)
  assert.equal(isDsClawPath(alias, home), true)
  assert.equal(isDsClawPath(home, home), false)
})

test('symlink out of DSclaw is not an identity root', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-escape-'))
  const outside = await mkdtemp(join(tmpdir(), 'id-out-'))
  const real = await clawRoot(home, 'alpha')
  const link = join(real, 'escape')
  await symlink(outside, link)
  assert.equal(isDsClawPath(link, home), false)
})

test('identity file symlinked to another agent is refused by safeJoin', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-xagent-'))
  const a = await clawRoot(home, 'alpha')
  const b = await clawRoot(home, 'beta')
  await writeFile(join(b, 'SOUL.md'), 'You are Beta.\n')
  await symlink(join(b, 'SOUL.md'), join(a, 'SOUL.md'))
  assert.equal(safeJoin(a, 'SOUL.md', home), '')
  assert.equal(safeJoin(b, 'SOUL.md', home), join(b, 'SOUL.md'))
})

test('read route: agent A cannot read B or outside files through symlinks', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-route-read-'))
  const outside = await mkdtemp(join(tmpdir(), 'id-route-out-'))
  const a = await clawRoot(home, 'alpha')
  const b = await clawRoot(home, 'beta')
  await writeFile(join(a, 'IDENTITY.md'), 'Alpha identity\n')
  await writeFile(join(b, 'SOUL.md'), 'Beta secret soul\n')
  await writeFile(join(outside, 'secret.md'), 'outside secret\n')
  await symlink(join(b, 'SOUL.md'), join(a, 'SOUL.md'))
  await symlink(join(outside, 'secret.md'), join(a, 'AGENTS.md'))
  const { call } = mountHost(home)

  const res = await call('read', { root: a })
  assert.equal(res.status, 200)
  assert.equal(res.body.files['IDENTITY.md'], 'Alpha identity\n')
  assert.equal(res.body.files['SOUL.md'], undefined)
  assert.equal(res.body.files['AGENTS.md'], undefined)
  assert.doesNotMatch(JSON.stringify(res.body), /Beta secret|outside secret/)

  const fromB = await call('read', { root: b })
  assert.equal(fromB.body.files['SOUL.md'], 'Beta secret soul\n')
  assert.equal(fromB.body.files['IDENTITY.md'], '')

  assert.equal((await call('read', { root: outside })).status, 400)
  assert.equal((await call('read', { root: join(a, '..', '..') })).status, 400)
})

test('write route: symlinked identity files never write through to B or outside', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-route-write-'))
  const outside = await mkdtemp(join(tmpdir(), 'id-route-wout-'))
  const a = await clawRoot(home, 'alpha')
  const b = await clawRoot(home, 'beta')
  await writeFile(join(b, 'SOUL.md'), 'Beta soul\n')
  await writeFile(join(outside, 'target.md'), 'outside\n')
  await symlink(join(b, 'SOUL.md'), join(a, 'SOUL.md'))
  await symlink(join(outside, 'target.md'), join(a, 'TOOLS.md'))
  await symlink(join(b, 'missing.md'), join(a, 'AGENTS.md'))
  const { call } = mountHost(home)

  const res = await call('write', {
    root: a,
    files: { 'SOUL.md': 'hijack', 'TOOLS.md': 'hijack', 'AGENTS.md': 'Alpha agents\n', 'IDENTITY.md': 'Alpha id\n' },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.written.sort(), ['AGENTS.md', 'IDENTITY.md'])
  assert.equal(await readFile(join(b, 'SOUL.md'), 'utf8'), 'Beta soul\n')
  assert.equal(await readFile(join(outside, 'target.md'), 'utf8'), 'outside\n')
  assert.deepEqual((await readdir(b)).sort(), ['SOUL.md'])
  assert.equal((await lstat(join(a, 'AGENTS.md'))).isSymbolicLink(), false)
  assert.equal(await readFile(join(a, 'AGENTS.md'), 'utf8'), 'Alpha agents\n')
  assert.deepEqual((await readdir(a)).filter((name) => name.endsWith('.tmp')), [])
})

test('prompt section re-injects identity for every new agent scope (resume/clear/compact)', async () => {
  const home = await mkdtemp(join(tmpdir(), 'id-reinject-'))
  const a = await clawRoot(home, 'alpha')
  const b = await clawRoot(home, 'beta')
  await writeFile(join(a, 'SOUL.md'), 'You are Alpha v1.\n')
  await writeFile(join(b, 'SOUL.md'), 'You are Beta.\n')
  const { prompt } = mountHost(home)

  const created = prompt(agentAt('agent-1', a))
  assert.match(created, /Alpha v1/)
  assert.doesNotMatch(created, /Beta/)

  await writeFile(join(a, 'SOUL.md'), 'You are Alpha v2.\n')
  for (const id of ['agent-1-resumed', 'agent-1-cleared', 'agent-1-compacted']) {
    const text = prompt(agentAt(id, a))
    assert.match(text, /Alpha v2/, id)
    assert.doesNotMatch(text, /Beta/, id)
  }
  assert.match(prompt(agentAt('agent-2', b)), /You are Beta/)
  assert.equal(prompt(agentAt('ws', join(home, 'workspace'))), '')
})
