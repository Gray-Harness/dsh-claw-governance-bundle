/**
 * Iterate live agents via the rc.2 host contract (`agents.list` only).
 * Do not call `agents.values` — that API does not exist on Desktop rc.2.
 *
 * Accepts either a host `ctx` (`ctx.agents.list`) or an agents bag with `.list()`.
 * Throws if `list()` throws (caller decides degrade vs fail-closed).
 */

function agentsBag(input) {
  if (!input || typeof input !== 'object') return null
  if (typeof input.list === 'function') return input
  const nested = input.agents
  if (nested && typeof nested.list === 'function') return nested
  return null
}

export function forEachLiveAgent(ctxOrAgents, visit) {
  const agents = agentsBag(ctxOrAgents)
  if (!agents) return
  for (const agent of agents.list()) visit(agent)
}

export function listLiveAgents(ctxOrAgents) {
  const out = []
  forEachLiveAgent(ctxOrAgents, (a) => out.push(a))
  return out
}
