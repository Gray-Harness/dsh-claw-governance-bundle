import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { clipText } from './identity-files.mjs'

export const MEMORY_BUDGET = 6000
export const DAILY_BUDGET = 3000

export function dateKey(now = new Date()) {
  const stamp = now instanceof Date ? now : new Date(now)
  const y = stamp.getFullYear()
  const m = String(stamp.getMonth() + 1).padStart(2, '0')
  const d = String(stamp.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

export function yesterdayKey(now = new Date()) {
  const stamp = now instanceof Date ? now : new Date(now)
  return dateKey(new Date(stamp.getTime() - 86400000))
}

export function memoryDir(root) {
  return join(String(root || '').replace(/[/\\]+$/, ''), 'memory')
}

export function dailyFile(root, key) {
  return join(memoryDir(root), key + '.md')
}

function readOptional(path, io) {
  try {
    return String((io && io.readFileSync ? io.readFileSync : readFileSync)(path, 'utf8') || '')
  } catch {
    return ''
  }
}

export function ensureMemoryDir(root, io) {
  const dir = memoryDir(root)
  try {
    (io && io.mkdirSync ? io.mkdirSync : mkdirSync)(dir, { recursive: true })
  } catch { /* exists */ }
  return dir
}

export function loadMemoryBundle(root, now = new Date(), io) {
  const today = dateKey(now)
  const yesterday = yesterdayKey(now)
  return {
    memory: readOptional(join(String(root || '').replace(/[/\\]+$/, ''), 'MEMORY.md'), io),
    today,
    yesterday,
    todayText: readOptional(dailyFile(root, today), io),
    yesterdayText: readOptional(dailyFile(root, yesterday), io),
  }
}

export function renderMemoryPrompt(bundle) {
  const row = bundle || {}
  const parts = []
  const memory = clipText(row.memory, MEMORY_BUDGET).trim()
  if (memory) parts.push('## MEMORY.md\n\n' + memory)
  const yesterday = clipText(row.yesterdayText, DAILY_BUDGET).trim()
  if (yesterday) parts.push('## memory/' + row.yesterday + '.md\n\n' + yesterday)
  const today = clipText(row.todayText, DAILY_BUDGET).trim()
  if (today) parts.push('## memory/' + row.today + '.md\n\n' + today)
  const body = [
    '# Claw memory',
    '',
    'Long-term facts live in MEMORY.md (curated, compact).',
    'Daily working notes live in memory/YYYY-MM-DD.md.',
    'When the user asks you to remember something, write it to the matching file.',
    'Do not keep durable facts only in this chat.',
  ]
  if (parts.length) body.push('', parts.join('\n\n'))
  return body.join('\n')
}

export function appendDailyNote(root, text, now = new Date(), io) {
  const note = String(text || '').trim()
  if (!note) return ''
  ensureMemoryDir(root, io)
  const path = dailyFile(root, dateKey(now))
  const prev = readOptional(path, io)
  const next = (prev && !prev.endsWith('\n') ? prev + '\n' : prev) + note + '\n'
  const tmp = path + '.' + process.pid + '.' + randomUUID() + '.tmp'
  try {
    ;(io && io.writeFileSync ? io.writeFileSync : writeFileSync)(tmp, next)
    ;(io && io.renameSync ? io.renameSync : renameSync)(tmp, path)
  } catch (error) {
    try { (io && io.unlinkSync ? io.unlinkSync : unlinkSync)(tmp) } catch { /* never created */ }
    throw error
  }
  return path
}
