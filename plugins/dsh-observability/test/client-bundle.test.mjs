import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')

test('generated client keeps the factory contract', () => {
  assert.match(src, /Do not edit by hand/)
  assert.match(src, /id: 'dsh-claw-observability'/)
  assert.match(src, /inject = \['slots', 'locale'\]/)
  assert.match(src, /return module\.exports/)
  assert.match(src, /settings\.section/)
  assert.match(src, /nav: '运行诊断'/)
  assert.match(src, /tracePlaceholder/)
  assert.match(src, /function filterDiag/)
  assert.match(src, /data-dob-pick/)
  assert.match(src, /\/api\/dsh-claw\/observability\/query/)
  assert.match(src, /\{ limit: DIAG_PAGE, cursor \}/)
  assert.match(src, /data\.nextCursor/)
  assert.match(src, /loadMore: '加载更早的记录'/)
  assert.doesNotMatch(src, /X-DSH-Observability/)
  assert.doesNotMatch(src, /\/dsh-claw-observability\//)
})
