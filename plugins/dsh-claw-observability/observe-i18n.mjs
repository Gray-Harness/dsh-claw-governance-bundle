export const NS = 'dsh-claw-observability'

export const COPY = {
  zh: {
    nav: '运行诊断',
    empty: '还没有记录',
    emptyFilter: '没有符合筛选的记录',
    refresh: '刷新',
    exportJson: '导出 JSONL',
    exportMd: '导出 Markdown',
    exported: '已导出',
    fail: '读取失败',
    filterTime: '时间',
    filterOutcome: '结果',
    filterPlugin: '插件',
    filterCode: '错误码',
    rangeToday: '今天',
    rangeYesterday: '昨天',
    rangeWeek: '近 7 天',
    rangeMonth: '近 30 天',
    rangeAll: '全部时间',
    outcomeAll: '全部结果',
    outcomeFailed: '失败',
    outcomeRejected: '拒绝',
    outcomeDegraded: '降级',
    outcomeSucceeded: '成功',
    outcomeStarted: '开始',
    pluginAll: '全部插件',
    codeAll: '全部错误码',
    tracePlaceholder: 'traceId / 操作 / 错误码',
    clearTrace: '清除',
    count: '{shown} / {total} 条',
    truncated: '只显示最近一段日志，筛选只作用于已加载的记录',
    loadMore: '加载更早的记录',
    plugin_dsh_agent_registry: '登记',
    plugin_dsh_agent_identity: '人设',
    plugin_dsh_agent_policy: '策略',
    plugin_dsh_agent_gate: '闸',
    plugin_dsh_agent_delegate: '委派',
    plugin_dsh_agent_memory: '记忆',
    plugin_dsh_session_permissions: '会话权限',
    plugin_dsh_observability: '诊断',
  },
  en: {
    nav: 'Diagnostics',
    empty: 'No records yet',
    emptyFilter: 'No records match these filters',
    refresh: 'Refresh',
    exportJson: 'Export JSONL',
    exportMd: 'Export Markdown',
    exported: 'Exported',
    fail: 'Could not read the log',
    filterTime: 'Time',
    filterOutcome: 'Result',
    filterPlugin: 'Plugin',
    filterCode: 'Code',
    rangeToday: 'Today',
    rangeYesterday: 'Yesterday',
    rangeWeek: 'Last 7 days',
    rangeMonth: 'Last 30 days',
    rangeAll: 'All time',
    outcomeAll: 'All results',
    outcomeFailed: 'Failed',
    outcomeRejected: 'Rejected',
    outcomeDegraded: 'Degraded',
    outcomeSucceeded: 'Succeeded',
    outcomeStarted: 'Started',
    pluginAll: 'All plugins',
    codeAll: 'All codes',
    tracePlaceholder: 'traceId / operation / code',
    clearTrace: 'Clear',
    count: '{shown} / {total}',
    truncated: 'Showing the most recent slice of the log; filters apply to loaded records only',
    loadMore: 'Load older records',
    plugin_dsh_agent_registry: 'Registry',
    plugin_dsh_agent_identity: 'Identity',
    plugin_dsh_agent_policy: 'Policy',
    plugin_dsh_agent_gate: 'Gate',
    plugin_dsh_agent_delegate: 'Delegate',
    plugin_dsh_agent_memory: 'Memory',
    plugin_dsh_session_permissions: 'Session permissions',
    plugin_dsh_observability: 'Diagnostics',
  },
}

export function interpolate(template, params) {
  if (params == null) return template
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ))
}

export function activeLocaleId(ctx) {
  try {
    const locale = ctx && ctx.locale
    const snap = locale && (locale.getLocale ? locale.getLocale() : locale.getSnapshot && locale.getSnapshot())
    if (snap && typeof snap.active === 'string' && snap.active) return snap.active
  } catch { /* inject miss */ }
  const tag = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'zh'
  return tag
}

export function isZh(ctx) {
  return String(activeLocaleId(ctx)).toLowerCase().indexOf('zh') === 0
}

export function translate(lang, key, params) {
  const table = COPY[lang] || COPY.en
  return interpolate(table[key] ?? COPY.en[key] ?? key, params)
}

export function tWith(ctx, key, params) {
  try {
    const locale = ctx && ctx.locale
    if (locale && typeof locale.bind === 'function') {
      const translated = locale.bind(NS)(key, params)
      if (translated && translated !== key) return interpolate(translated, params)
    }
  } catch { /* fall through */ }
  return translate(isZh(ctx) ? 'zh' : 'en', key, params)
}

export function pluginLabel(t, plugin) {
  if (!plugin) return ''
  const key = 'plugin_' + String(plugin).replace(/-/g, '_')
  const label = t(key)
  return label === key ? plugin : label
}
