/**
 * Connection Fetch helpers for claw suite host routes.
 * Paths live under /api/dsh-claw/...; mutating routes are POST-only.
 */

const DEFAULT_MAX_BYTES = 64 * 1024
const ABS_PATH_RE = /(?:^|[\s"'`(=])(\/(?:Users|home|var|tmp|private|Volumes)\/[^\s"'`)]+)/g
const WIN_PATH_RE = /(?:^|[\s"'`(=])([A-Za-z]:\\[^\s"'`)]+)/g
const STACK_LINE_RE = /^\s*at\s+.+$/gm

/** Stable API path prefixes for 0.3.0 claw routes. */
export const CLAW_API = Object.freeze({
  registry: '/api/dsh-claw/registry',
  policy: '/api/dsh-claw/policy',
  permissions: '/api/dsh-claw/permissions',
  gate: '/api/dsh-claw/gate',
  identity: '/api/dsh-claw/identity',
  memory: '/api/dsh-claw/memory',
  observability: '/api/dsh-claw/observability',
  delegate: '/api/dsh-claw/delegate',
})

export function clawApi(prefix, suffix) {
  const base = CLAW_API[prefix] || prefix
  const tail = String(suffix || '').replace(/^\/+/, '')
  return tail ? `${base}/${tail}` : base
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export function publicErrorMessage(error) {
  let message = 'bad request'
  if (error instanceof Error && error.message) message = error.message
  else if (typeof error === 'string' && error) message = error
  message = String(message).replace(STACK_LINE_RE, '').trim()
  message = message.replace(ABS_PATH_RE, ' [path]').replace(WIN_PATH_RE, ' [path]')
  if (message.length > 240) message = `${message.slice(0, 237)}...`
  return message || 'bad request'
}

export function statusOf(error) {
  if (error instanceof RangeError) return 413
  const status = error && typeof error.status === 'number' ? error.status : 0
  if (status >= 400 && status < 600) return status
  return 400
}

/** Create an Error with HTTP status (+ optional stable code) for registerJsonRoute handlers. */
export function httpError(status, message, code) {
  const err = new Error(message || 'bad request')
  err.status = status >= 400 && status < 600 ? status : 400
  if (code) err.code = code
  return err
}

export async function readJson(request, maxBytes = DEFAULT_MAX_BYTES) {
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > maxBytes) {
    const err = new RangeError('request body too large')
    err.code = 'BODY_TOO_LARGE'
    err.status = 413
    throw err
  }
  if (bytes.byteLength === 0) return {}
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    const err = new Error('invalid json body')
    err.code = 'INVALID_JSON'
    err.status = 400
    throw err
  }
}

/**
 * Register a JSON Connection Fetch route and dispose via ctx.effect.
 * @param {object} ctx host context with connection.fetch.register + effect
 * @param {{ path: string, methods?: string[], maxBytes?: number, handle: (input: object, request: Request) => Promise<object|Response>|object|Response }} spec
 */
export function registerJsonRoute(ctx, spec) {
  if (!spec || typeof spec.path !== 'string' || !spec.path.startsWith('/api/dsh-claw/')) {
    throw new Error('registerJsonRoute requires path under /api/dsh-claw/')
  }
  if (typeof spec.handle !== 'function') throw new Error('registerJsonRoute requires handle')
  const fetchApi = ctx && ctx.connection && ctx.connection.fetch
  if (!fetchApi || typeof fetchApi.register !== 'function') {
    throw new Error('connection.fetch.register unavailable')
  }
  if (typeof ctx.effect !== 'function') throw new Error('ctx.effect unavailable')

  const methods = spec.methods && spec.methods.length ? [...spec.methods] : ['POST']
  const maxBytes = typeof spec.maxBytes === 'number' ? spec.maxBytes : DEFAULT_MAX_BYTES

  const dispose = fetchApi.register({
    path: spec.path,
    methods,
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const method = String(request && request.method || 'GET').toUpperCase()
        if (!methods.includes(method)) {
          return jsonResponse(405, { ok: false, error: 'method not allowed', code: 'METHOD_NOT_ALLOWED' })
        }
        const input = await readJson(request, maxBytes)
        const result = await spec.handle(input, request)
        if (result instanceof Response) return result
        const body = result && typeof result === 'object' && !Array.isArray(result) ? result : {}
        return jsonResponse(200, { ok: true, ...body })
      } catch (error) {
        const status = statusOf(error)
        const code = error && error.code ? String(error.code) : undefined
        return jsonResponse(status, {
          ok: false,
          error: publicErrorMessage(error),
          ...(code ? { code } : {}),
        })
      }
    },
  })

  ctx.effect(() => () => {
    if (typeof dispose === 'function') dispose()
  })
  return dispose
}
