import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { dateKey, dailyFile, loadMemoryBundle, memoryDir, renderMemoryPrompt, yesterdayKey } from '../identity-memory.mjs'

test('memory prompt injects MEMORY.md plus today and yesterday notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'idm-'))
  const now = new Date('2026-08-18T12:00:00')
  await writeFile(join(root, 'MEMORY.md'), 'Prefer TypeScript.\n')
  await mkdir(join(root, 'memory'), { recursive: true })
  await writeFile(join(root, 'memory', dateKey(now) + '.md'), 'Today: shipped search.\n')
  await writeFile(join(root, 'memory', yesterdayKey(now) + '.md'), 'Yesterday: fixed plus.\n')
  const bundle = loadMemoryBundle(root, now)
  const text = renderMemoryPrompt(bundle)
  assert.match(text, /Prefer TypeScript/)
  assert.match(text, /Today: shipped search/)
  assert.match(text, /Yesterday: fixed plus/)
  assert.match(text, /memory\/2026-08-18\.md/)
  assert.match(text, /memory\/2026-08-17\.md/)
})

test('memory paths use join, not slash concatenation', () => {
  const root = join(tmpdir(), 'idm-win', 'agent')
  assert.equal(memoryDir(root), join(root, 'memory'))
  assert.equal(dailyFile(root, '2026-08-19'), join(root, 'memory', '2026-08-19.md'))
})

test('empty memory still tells the agent where to write', () => {
  const text = renderMemoryPrompt({ memory: '', todayText: '', yesterdayText: '' })
  assert.match(text, /MEMORY\.md/)
  assert.match(text, /memory\/YYYY-MM-DD\.md/)
})
