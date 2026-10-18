import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { sanitizeEvent } from './sanitize.mjs'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000
const CHUNK_BYTES = 65536
const LINE_CAP = 262144
const SCAN_CAP = 8 * 1048576
const NEWLINE = 0x0a

let observeHome = process.env.DSH_HOME || join(homedir(), '.dsh')

export function setObserveHome(dir) {
  observeHome = dir
}

export function getObserveHome() {
  return observeHome
}

export function diagFile(home) {
  return join(home || observeHome, 'agent-observe', 'diag.jsonl')
}

export function writeDiag(event) {
  const line = JSON.stringify(event) + '\n'
  try {
    const file = diagFile(observeHome)
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, line)
    return true
  } catch (error) {
    try {
      process.stderr.write('[dsh-claw-observability] ' + line)
    } catch { /* nowhere to write */ }
    return false
  }
}

function parseCursor(cursor) {
  if (cursor == null || cursor === '') return null
  const text = typeof cursor === 'number' ? String(cursor) : cursor
  if (typeof text !== 'string' || !/^\d{1,15}$/.test(text)) {
    const err = new Error('invalid cursor')
    err.status = 400
    err.code = 'DIAG_CURSOR_INVALID'
    throw err
  }
  return Number(text)
}

function parseLine(buf, start, end) {
  if (end - start > LINE_CAP) return null
  const text = buf.toString('utf8', start, end).trim()
  if (!text) return null
  try {
    const row = JSON.parse(text)
    return row && typeof row === 'object' && !Array.isArray(row) ? sanitizeEvent(row) : null
  } catch {
    return null
  }
}

/**
 * Newest-first page of diag rows, read backwards from `cursor` (a byte offset; default end of file)
 * in fixed chunks so memory stays bounded regardless of file size. `nextCursor` resumes older rows.
 */
export function readDiag(home, limit, cursor) {
  const cap = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit)))) : DEFAULT_LIMIT
  const from = parseCursor(cursor)
  let fd
  let size
  try {
    fd = openSync(diagFile(home), 'r')
    size = fstatSync(fd).size
  } catch {
    if (fd !== undefined) closeSync(fd)
    return { items: [], truncated: false, hasMore: false, nextCursor: null }
  }
  const items = []
  let pos = from == null ? size : Math.min(from, size)
  let rest = 0
  try {
    let carry = Buffer.alloc(0)
    let skipping = false
    let scanned = 0
    let full = false
    while (pos > 0 && scanned < SCAN_CAP && !full) {
      const n = Math.min(CHUNK_BYTES, pos)
      const chunk = Buffer.allocUnsafe(n)
      readSync(fd, chunk, 0, n, pos - n)
      pos -= n
      scanned += n
      const data = carry.length ? Buffer.concat([chunk, carry]) : chunk
      let end = data.length
      let nl = end > 0 ? data.lastIndexOf(NEWLINE, end - 1) : -1
      while (nl >= 0) {
        if (skipping) skipping = false
        else {
          const row = parseLine(data, nl + 1, end)
          if (row) items.push(row)
        }
        end = nl
        if (items.length >= cap) {
          full = true
          break
        }
        nl = end > 0 ? data.lastIndexOf(NEWLINE, end - 1) : -1
      }
      carry = Buffer.from(data.subarray(0, end))
      if (carry.length > LINE_CAP) {
        carry = Buffer.alloc(0)
        skipping = true
      }
    }
    if (!full && pos === 0 && !skipping && carry.length) {
      const row = parseLine(carry, 0, carry.length)
      if (row) items.push(row)
      carry = Buffer.alloc(0)
    }
    rest = pos + carry.length
  } finally {
    closeSync(fd)
  }
  const hasMore = rest > 0
  return { items, truncated: hasMore, hasMore, nextCursor: hasMore ? String(rest) : null }
}
