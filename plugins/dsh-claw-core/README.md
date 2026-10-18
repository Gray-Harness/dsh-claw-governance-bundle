# dsh-claw-core

Shared core library for `dsh-claw-*` / suite components.

**这不是 DSH 插件行** — no `cordis.patch.yml`, no `host.js`. Publishable npm package consumed by claw governance plugins.

**Not a plugin row** — library only. Components depend on the exact same suite version; do not sibling-import this as `../dsh-claw-core` in publish manifests.

## Exports

| Subpath | Role |
|---|---|
| `dsh-claw-core/live-agents` | `agents.list()` iteration helpers |
| `dsh-claw-core/session-classifier` | three-state Claw session kind |
| `dsh-claw-core/path-containment` | `$DSH_HOME/DSclaw` path safety |
| `dsh-claw-core/errors` | stable error codes |
| `dsh-claw-core/version` | `CORE_VERSION` / `SUPPORTED_DSH` / `SUPPORTED_DSH_PEER` |

Peer: `@deepseek-ai/dsh@^0.2.0-rc.1` (contract tag `0.2.0-rc.2`).
