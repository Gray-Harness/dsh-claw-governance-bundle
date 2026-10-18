export const TIME_RANGES = ['today', 'yesterday', 'week', 'month', 'all']
export const OUTCOME_IDS = ['all', 'failed', 'rejected', 'degraded', 'succeeded', 'started']

export function emptyDiagQuery() {
  return { range: 'today', outcome: 'all', plugin: 'all', code: 'all', trace: '' }
}

export function normalizeDiagQuery(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const range = TIME_RANGES.indexOf(value.range) >= 0 ? value.range : 'today'
  const outcome = OUTCOME_IDS.indexOf(value.outcome) >= 0 ? value.outcome : 'all'
  const plugin = typeof value.plugin === 'string' && value.plugin ? value.plugin : 'all'
  const code = typeof value.code === 'string' && value.code ? value.code : 'all'
  const trace = typeof value.trace === 'string' ? value.trace.trim() : ''
  return { range, outcome, plugin, code, trace }
}

export function startOfDay(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function rangeBounds(range, now = Date.now()) {
  const today = startOfDay(now)
  if (range === 'all') return { from: 0, to: Number.POSITIVE_INFINITY }
  if (range === 'yesterday') return { from: today - 86400000, to: today }
  if (range === 'week') return { from: today - 6 * 86400000, to: Number.POSITIVE_INFINITY }
  if (range === 'month') return { from: today - 29 * 86400000, to: Number.POSITIVE_INFINITY }
  return { from: today, to: Number.POSITIVE_INFINITY }
}

export function eventTime(row) {
  const ts = row && row.ts
  const at = Date.parse(ts)
  return Number.isFinite(at) ? at : 0
}

export function filterDiag(rows, query, now = Date.now()) {
  const list = Array.isArray(rows) ? rows : []
  const q = normalizeDiagQuery(query)
  const bounds = rangeBounds(q.range, now)
  const needle = q.trace.toLowerCase()
  const out = []
  for (let i = 0; i < list.length; i++) {
    const row = list[i]
    if (!row) continue
    const at = eventTime(row)
    if (at && (at < bounds.from || at >= bounds.to)) continue
    if (q.outcome !== 'all' && row.outcome !== q.outcome) continue
    if (q.plugin !== 'all' && row.plugin !== q.plugin) continue
    if (q.code !== 'all' && row.code !== q.code) continue
    if (needle) {
      const hay = [row.traceId, row.operationId, row.parentOperationId, row.code, row.operation]
        .filter(Boolean).join(' ').toLowerCase()
      if (hay.indexOf(needle) < 0) continue
    }
    out.push(row)
  }
  return out
}

export function diagFacets(rows) {
  const list = Array.isArray(rows) ? rows : []
  const plugins = []
  const pluginSeen = new Set()
  const codes = []
  const codeSeen = new Set()
  for (let i = 0; i < list.length; i++) {
    const row = list[i]
    if (!row) continue
    if (row.plugin && !pluginSeen.has(row.plugin)) {
      pluginSeen.add(row.plugin)
      plugins.push(row.plugin)
    }
    if (row.code && !codeSeen.has(row.code)) {
      codeSeen.add(row.code)
      codes.push(row.code)
    }
  }
  plugins.sort()
  codes.sort()
  return { plugins, codes }
}

export function serializeDiag(rows, format) {
  const list = Array.isArray(rows) ? rows : []
  if (format === 'md' || format === 'markdown') {
    const lines = [
      '# Claw suite diagnostics',
      '',
      '| Time | Outcome | Plugin | Operation | Code | Trace | Error |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    const cell = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
    for (let i = 0; i < list.length; i++) {
      const row = list[i] || {}
      lines.push([
        '',
        cell(row.ts),
        cell(row.outcome),
        cell(row.plugin),
        cell(row.operation),
        cell(row.code),
        cell(row.traceId),
        cell(row.error && row.error.message),
        '',
      ].join(' | ').trim())
    }
    return lines.join('\n') + '\n'
  }
  return list.map((row) => JSON.stringify(row)).join('\n') + (list.length ? '\n' : '')
}
