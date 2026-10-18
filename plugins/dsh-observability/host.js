import { getObserveHome, readDiag, setObserveHome } from './store.mjs'
import { registerJsonRoute } from 'dsh-claw-core/http'

export const name = 'dsh-claw-observability'
export const inject = ['connection']

const _internal = {
  setDshHome(dir) { setObserveHome(dir) },
  getDshHome() { return getObserveHome() },
}
export { _internal }

export function apply(ctx) {
  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/observability/query',
    handle: async (body) => {
      const input = body || {}
      const result = readDiag(getObserveHome(), input.limit, input.cursor)
      return {
        items: result.items,
        truncated: result.truncated,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      }
    },
  })
}
