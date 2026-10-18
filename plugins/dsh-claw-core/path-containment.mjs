import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'

export const CLAW_DIR = 'DSclaw'

export function defaultDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function clawAgentsRoot(dshHome) {
  return join(dshHome || defaultDshHome(), CLAW_DIR)
}

function pathApi(platform = process.platform) {
  return platform === 'win32' ? win32 : { join, resolve, relative, isAbsolute, sep }
}

function isWinAbs(path) {
  const text = String(path || '')
  return /^[A-Za-z]:[\\/]/.test(text) || text.startsWith('\\\\')
}

/** True when a relative path segment escapes its root (OpenClaw / perm-path style). */
export function relativeEscapes(rel, platform = process.platform) {
  if (rel == null || rel === '') return false
  const p = pathApi(platform)
  return rel.startsWith('..') || p.isAbsolute(rel)
}

/**
 * Best-effort realpath: walk parents until an existing path resolves,
 * then rejoin missing tails (same pattern as identity-files / registry-claw).
 */
export function canonicalizePath(p) {
  if (p == null || p === '') return ''
  let abs = resolve(String(p))
  const tail = []
  while (true) {
    try {
      const real = realpathSync(abs)
      return tail.length === 0 ? real : join(real, ...tail)
    } catch {
      const parent = dirname(abs)
      if (parent === abs) return abs
      tail.unshift(basename(abs))
      abs = parent
    }
  }
}

/** Same containment check as OpenClaw `isPathInside` / perm-path. */
export function isPathInside(parent, child, platform = process.platform) {
  if (!parent || !child) return false
  if (platform === 'win32') {
    const rootForCompare = win32.resolve(parent)
    const targetForCompare = win32.resolve(child)
    const rel = win32.relative(rootForCompare, targetForCompare)
    return rel === '' || !relativeEscapes(rel, 'win32')
  }
  if (isWinAbs(child) && !isWinAbs(parent)) return false
  const resolvedRoot = resolve(parent)
  const resolvedTarget = resolve(child)
  const rel = relative(resolvedRoot, resolvedTarget)
  return rel === '' || !relativeEscapes(rel, platform)
}

/**
 * True when `target` escapes outside `root` (not inside, and not equal).
 * Two-arg form for classifier / containment gates.
 */
export function escapesHome(root, target, platform = process.platform) {
  if (!root || target == null || target === '') return true
  return !isPathInside(root, target, platform)
}
