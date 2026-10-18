import { homedir } from 'node:os'

const ALLOWED = new Set([
  'ts', 'level', 'plugin', 'feature', 'operation', 'stage', 'outcome', 'code',
  'traceId', 'operationId', 'parentOperationId',
  'agentId', 'sessionId', 'childSessionId', 'durationMs',
  'recovery', 'error', 'state', 'remainingArtifacts',
  'decision', 'matchedLayer', 'reason', 'policyHash', 'tool',
  'skipReason', 'fileCount', 'bytes', 'slug',
])

const SECRET = /(api[_-]?key|token|secret|password|authorization|bearer|cookie|sk-[a-z0-9]|ghp_|github_pat)/i
const TOKEN_VALUE = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g
const CREDENTIAL_ASSIGN = /\b(api[_-]?key|access[_-]?key|token|secret|password|passwd|credential|authorization|cookie)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi
const AUTH_SCHEME = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const USER_HOME = /(?:\/Users|\/home)\/[^/\s"'`]+|[A-Za-z]:\\Users\\[^\\\s"'`]+/g
const MAX_TEXT = 240

const HOMES = [homedir(), process.env.HOME, process.env.USERPROFILE]
  .filter((dir, index, all) => typeof dir === 'string' && dir.length > 1 && all.indexOf(dir) === index)
  .sort((a, b) => b.length - a.length)

function cap(text) {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 3) + '…' : text
}

export function scrubPaths(value) {
  let text = String(value == null ? '' : value)
  for (const dir of HOMES) text = text.split(dir).join('~')
  return text.replace(USER_HOME, '~')
}

export function scrubText(value) {
  const text = scrubPaths(value)
    .replace(TOKEN_VALUE, '[redacted]')
    .replace(CREDENTIAL_ASSIGN, '$1$2[redacted]')
    .replace(AUTH_SCHEME, '$1 [redacted]')
  return cap(text)
}

export function redactText(value) {
  const text = scrubPaths(value)
  if (!text) return ''
  if (SECRET.test(text)) return '[redacted]'
  return cap(text)
}

export function serializeError(error) {
  if (!error) return undefined
  if (typeof error === 'string') return { type: 'Error', message: redactText(error) }
  return {
    type: scrubText(error.name || error.constructor && error.constructor.name || 'Error'),
    message: redactText(error.message || error),
  }
}

function scalar(value) {
  if (typeof value === 'string') return scrubText(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  return undefined
}

export function sanitizeEvent(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const key of ALLOWED) {
    if (value[key] == null || value[key] === '') continue
    if (key === 'error') {
      const err = serializeError(value.error)
      if (err) out.error = err
      continue
    }
    if (key === 'recovery') {
      if (typeof value.recovery !== 'object') continue
      out.recovery = {
        attempted: value.recovery.attempted === true,
        outcome: value.recovery.outcome === 'failed' ? 'failed' : (value.recovery.outcome === 'succeeded' ? 'succeeded' : scrubText(value.recovery.outcome || '')),
      }
      continue
    }
    if (key === 'remainingArtifacts') {
      if (!Array.isArray(value.remainingArtifacts)) continue
      out.remainingArtifacts = value.remainingArtifacts.filter((item) => typeof item === 'string').slice(0, 12).map(scrubText)
      continue
    }
    if (key === 'reason' || key === 'skipReason') {
      out[key] = redactText(value[key])
      continue
    }
    const clean = scalar(value[key])
    if (clean !== undefined && clean !== '') out[key] = clean
  }
  return out
}
