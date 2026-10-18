import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { sanitizeEvent, serializeError } from './sanitize.mjs'
import { writeDiag } from './store.mjs'

const als = new AsyncLocalStorage()
const recent = new Map()
const RATE_MS = 8000
const TRACE_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/

export function newId(prefix) {
  return prefix + randomUUID().replace(/-/g, '').slice(0, 12)
}

export function currentContext() {
  return als.getStore() || null
}

export function currentTraceId() {
  const ctx = als.getStore()
  return ctx && ctx.traceId ? ctx.traceId : ''
}

function cleanTrace(raw) {
  const text = raw == null ? '' : String(raw).trim()
  return TRACE_RE.test(text) ? text : ''
}

function headerTrace(input) {
  if (typeof input === 'string') return cleanTrace(input)
  if (!input || typeof input !== 'object') return ''
  if (typeof input.traceId === 'string') return cleanTrace(input.traceId)
  const headers = input.headers
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return cleanTrace(headers.get('x-dsh-trace') || headers.get('x-dsh-trace-id'))
  }
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase()
    if (lower === 'x-dsh-trace' || lower === 'x-dsh-trace-id') return cleanTrace(headers[key])
  }
  return ''
}

function toolCallTrace(input) {
  const callId = input && typeof input === 'object' && (input.rootCallId || input.callId)
  if (typeof callId !== 'string' || !callId) return ''
  return 'tr_' + createHash('sha256').update(callId).digest('hex').slice(0, 12)
}

/**
 * input: trace id string | Request (x-dsh-trace header) | { traceId } | tool execution.
 * Nested tool calls share rootCallId, so they land on the same trace.
 */
export function runWithTrace(input, fn) {
  const existing = als.getStore()
  const incoming = headerTrace(input)
  const traceId = incoming || (existing && existing.traceId) || toolCallTrace(input) || newId('tr_')
  if (existing && existing.traceId === traceId) return fn()
  return als.run({
    traceId,
    operationId: existing && existing.operationId || null,
    parentOperationId: existing && existing.parentOperationId || null,
  }, fn)
}

export function policyHash(policy) {
  if (!policy || typeof policy !== 'object') return ''
  const slim = {
    preset: policy.preset,
    files: policy.files,
    shell: policy.shell,
    mcp: policy.mcp,
    approval: policy.approval,
    skills: policy.skills && policy.skills.deny,
  }
  return 'sha256:' + createHash('sha256').update(JSON.stringify(slim)).digest('hex').slice(0, 16)
}

function rateKey(event) {
  return [event.plugin, event.code, event.stage, event.outcome].join(':')
}

function shouldEmit(event) {
  if (event.outcome === 'succeeded' || event.outcome === 'started') return true
  const key = rateKey(event)
  const now = Date.now()
  const prev = recent.get(key)
  if (prev && now - prev < RATE_MS) return false
  recent.set(key, now)
  if (recent.size > 128) {
    const first = recent.keys().next().value
    recent.delete(first)
  }
  return true
}

function emit(raw) {
  const event = sanitizeEvent(raw)
  if (!event.ts) event.ts = new Date().toISOString()
  if (!shouldEmit(event)) return event
  writeDiag(event)
  return event
}

function levelOf(outcome) {
  if (outcome === 'failed') return 'error'
  if (outcome === 'degraded' || outcome === 'rejected') return 'warn'
  return 'info'
}

export function operation(meta) {
  const spec = meta && typeof meta === 'object' ? meta : {}
  const parent = als.getStore()
  const traceId = cleanTrace(spec.traceId) || (parent && parent.traceId) || newId('tr_')
  const parentOperationId = spec.parentOperationId || (parent && parent.operationId) || null
  const operationId = newId('op_')
  const started = Date.now()
  let stage = 'start'
  let finished = false
  let recovery = null
  const base = {
    plugin: spec.plugin || 'unknown',
    feature: spec.feature || '',
    operation: spec.operation || 'operation',
    traceId,
    operationId,
    parentOperationId,
    agentId: spec.agentId || '',
    sessionId: spec.sessionId || '',
    childSessionId: spec.childSessionId || '',
  }

  function frame(extra) {
    return {
      ...base,
      stage,
      durationMs: Date.now() - started,
      recovery,
      ...extra,
    }
  }

  function enter(fn) {
    return als.run({
      traceId,
      operationId,
      parentOperationId,
    }, fn)
  }

  function finish(outcome, code, extra) {
    if (finished) return null
    finished = true
    const event = frame({
      level: levelOf(outcome),
      outcome,
      code: code || undefined,
      ...(extra || {}),
    })
    if (extra && extra.recovery) event.recovery = extra.recovery
    else if (recovery) event.recovery = recovery
    return emit(event)
  }

  return {
    traceId,
    operationId,
    parentOperationId,
    start() {
      emit(frame({ level: 'info', outcome: 'started' }))
      return this
    },
    stage(name) {
      if (name) stage = String(name)
      return this
    },
    decide(decision, fields) {
      emit(frame({
        level: 'info',
        outcome: 'started',
        decision,
        ...(fields || {}),
      }))
      return this
    },
    recovery(info) {
      recovery = info && typeof info === 'object' ? info : null
      return this
    },
    success(extra) { return finish('succeeded', extra && extra.code, extra) },
    reject(code, extra) { return finish('rejected', code, extra) },
    fail(code, error, extra) {
      return finish('failed', code, { ...(extra || {}), error: serializeError(error) })
    },
    degraded(code, extra) { return finish('degraded', code, extra) },
    run(fn) { return enter(() => fn(this)) },
    get finished() { return finished },
  }
}

export { setObserveHome, getObserveHome, diagFile } from './store.mjs'
export { CODES, OUTCOMES } from './codes.mjs'
