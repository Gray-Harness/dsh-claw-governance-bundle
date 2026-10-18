export const DEFAULT_INTERVAL_MS = 30 * 60 * 1000

export function parseInterval(value) {
  const text = String(value || '').trim().toLowerCase()
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n < 0) return null
  const unit = match[2] || 'm'
  const mul = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000
  return Math.floor(n * mul)
}

export function parseHeartbeat(text) {
  const raw = String(text || '')
  const every = raw.match(/^\s*(?:every|interval)\s*:\s*([^\n]+)/im)
  const parsed = every ? parseInterval(every[1]) : DEFAULT_INTERVAL_MS
  const intervalMs = parsed == null ? DEFAULT_INTERVAL_MS : parsed
  const body = raw.replace(/^\s*(?:every|interval)\s*:\s*[^\n]+\n?/im, '').replace(/^#+\s*Heartbeat\s*$/im, '').trim()
  return {
    enabled: Boolean(body) && intervalMs > 0,
    intervalMs,
    instructions: body,
  }
}

export function shouldTick(lastMs, intervalMs, nowMs) {
  if (!intervalMs || intervalMs <= 0) return false
  if (lastMs == null || !Number.isFinite(lastMs)) return false
  return nowMs - lastMs >= intervalMs
}

export function parseStamp(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const asNum = Number(text)
  if (Number.isFinite(asNum) && asNum > 0) return asNum
  const asDate = Date.parse(text)
  return Number.isFinite(asDate) ? asDate : null
}

export function heartbeatFollowup(instructions) {
  return [
    '[heartbeat]',
    'This is a scheduled idle check, not a new user message.',
    'Follow HEARTBEAT.md. If nothing needs action, reply HEARTBEAT_OK and do not invent work.',
    '',
    String(instructions || '').trim(),
  ].join('\n')
}

export function heartbeatMessage(instructions) {
  return {
    id: (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
    role: 'user',
    content: [{ type: 'text', text: heartbeatFollowup(instructions) }],
    source: { kind: 'user' },
  }
}
