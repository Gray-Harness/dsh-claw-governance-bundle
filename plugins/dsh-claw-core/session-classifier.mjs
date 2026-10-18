import {
  canonicalizePath,
  clawAgentsRoot,
  defaultDshHome,
  isPathInside,
} from './path-containment.mjs'

/**
 * @typedef {'claw' | 'ordinary' | 'claw-uncertain'} ClawSessionKind
 */

const DSCLAW_SEGMENT = /(^|\/)DSclaw(\/|$)/i

export function isClawPresetId(id) {
  if (typeof id !== 'string' || id === '') return false
  if (id === 'wa-template') return true
  return id.startsWith('wa-')
}

export function looksLikeDsClawPath(path) {
  return DSCLAW_SEGMENT.test(String(path || '').replace(/\\/g, '/'))
}

function bindingRows(bindings) {
  if (!bindings) return null
  if (bindings instanceof Map) return [...bindings.values()]
  if (Array.isArray(bindings)) return bindings
  if (typeof bindings === 'object') return Object.values(bindings)
  return null
}

function normalizePathKey(path) {
  return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function pathsEqual(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  return normalizePathKey(a).toLowerCase() === normalizePathKey(b).toLowerCase()
}

/**
 * Classify a session as claw / ordinary / claw-uncertain.
 *
 * Priority evidence (plan §M0-C):
 * 1. canonical cwd under `$DSH_HOME/DSclaw`
 * 2. registry binding workspaceId / canonicalRoot exact match
 * 3. agentPreset is `wa-*` or legacy `wa-template`
 *
 * Registry missing alone must not mark an unmarked ordinary session uncertain.
 *
 * @param {object} [input]
 * @returns {ClawSessionKind}
 */
export function classifySession(input = {}) {
  const dshHome = input.dshHome || defaultDshHome()
  const clawRoot = canonicalizePath(clawAgentsRoot(dshHome))
  const rawCwd = input.cwd != null && input.cwd !== '' ? String(input.cwd) : ''
  const hasProvidedCanonical =
    input.canonicalCwd != null && String(input.canonicalCwd) !== ''
  const providedCanonical = hasProvidedCanonical ? String(input.canonicalCwd) : ''

  let pathHit = false
  let pathMiss = false
  let pathUncertain = false

  if (hasProvidedCanonical || rawCwd) {
    const candidate = canonicalizePath(hasProvidedCanonical ? providedCanonical : rawCwd)
    const inside =
      isPathInside(clawRoot, candidate)
      && normalizePathKey(candidate) !== normalizePathKey(clawRoot)

    if (inside) {
      pathHit = true
    } else if (looksLikeDsClawPath(rawCwd || providedCanonical)) {
      // Raw path claims DSclaw but canonical result is outside / unresolvable → uncertain
      pathUncertain = true
    } else if (rawCwd || hasProvidedCanonical) {
      pathMiss = true
    }

    // Symlink-ish escape: provided raw looks like DSclaw, explicit canonical outside
    if (
      hasProvidedCanonical
      && rawCwd
      && looksLikeDsClawPath(rawCwd)
      && !isPathInside(clawRoot, canonicalizePath(providedCanonical))
    ) {
      pathUncertain = true
      pathHit = false
      pathMiss = false
    }
  }

  const rows = bindingRows(input.bindings)
  let bindingHit = false
  let bindingMiss = false
  if (rows) {
    const workspaceId = input.workspaceId != null ? String(input.workspaceId) : ''
    const cwdKeys = [providedCanonical, rawCwd].filter(Boolean).map(canonicalizePath)
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const rowRoot = row.canonicalRoot != null ? String(row.canonicalRoot) : ''
      const rowWs = row.workspaceId != null ? String(row.workspaceId) : ''
      if (workspaceId && rowWs && workspaceId === rowWs) {
        bindingHit = true
        break
      }
      if (rowRoot) {
        const canonRoot = canonicalizePath(rowRoot)
        if (cwdKeys.some((c) => pathsEqual(c, canonRoot) || pathsEqual(rawCwd, rowRoot) || pathsEqual(providedCanonical, rowRoot))) {
          bindingHit = true
          break
        }
      }
    }
    if (!bindingHit && (workspaceId || cwdKeys.length > 0 || rawCwd)) {
      // Bindings registry present but no match — negative only when we also have identity to check
      bindingMiss = true
    }
  }

  const preset = input.agentPreset
  const presetHit = isClawPresetId(preset)
  const presetMiss = typeof preset === 'string' && preset !== '' && !presetHit

  // Conflicts: claw path vs non-claw preset with binding miss, or path uncertain
  const positives = []
  const negatives = []
  if (pathHit) positives.push('path')
  if (bindingHit) positives.push('binding')
  if (presetHit) positives.push('preset')
  if (pathMiss) negatives.push('path')
  if (bindingMiss && rows && rows.length > 0) negatives.push('binding')
  if (presetMiss) negatives.push('preset')

  if (pathUncertain) return 'claw-uncertain'

  // Evidence conflict: at least one clear claw signal and a contradictory clear exclude
  // that cannot be explained by priority OR alone.
  // Example: path under DSclaw but binding canonicalRoot for same workspaceId is outside,
  // and preset is explicitly non-claw.
  if (pathHit && presetMiss && bindingMiss && rows && rows.length > 0) {
    // Path says claw, registry+preset say ordinary → conflict
    return 'claw-uncertain'
  }
  if (pathMiss && presetHit && bindingHit) {
    // Outside path but both binding and preset claim claw — treat as claw (binding/preset win)
    return 'claw'
  }
  if (pathMiss && presetHit && !bindingHit && rows === null) {
    // Preset alone is enough for claw when registry absent
    return 'claw'
  }
  if (pathMiss && presetHit && bindingMiss) {
    // Path ordinary, preset claw, registry present with no match → conflict
    return 'claw-uncertain'
  }

  if (positives.length > 0) return 'claw'
  if (pathMiss || (!rawCwd && !hasProvidedCanonical && !presetHit && rows === null)) return 'ordinary'
  if (!pathHit && !bindingHit && !presetHit) return 'ordinary'
  return 'ordinary'
}
