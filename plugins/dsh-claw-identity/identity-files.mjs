// Pure helpers for Claw identity files. No network.

import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { canonicalizePath, isPathInside, relativeEscapes } from 'dsh-claw-core/path-containment'

export const IDENTITY_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md', 'MEMORY.md', 'BOOTSTRAP.md']
export const WRITABLE_IDENTITY_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md']
export const VAULT_FILES = ['USER.md', 'MEMORY.md']
export const PROMPT_FILES = ['SOUL.md', 'IDENTITY.md', 'AGENTS.md', 'TOOLS.md']
export const BOOTSTRAP_FILE = 'BOOTSTRAP.md'
export const FILE_CAP = 32768
export const CLAW_DIR = 'DSclaw'

export function defaultDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function isClawHomePath(dshHome, path) {
  if (!dshHome || typeof path !== 'string' || path === '') return false
  const clawRoot = canonicalizePath(join(String(dshHome), CLAW_DIR))
  const target = canonicalizePath(path)
  const rel = relative(clawRoot, target)
  return rel !== '' && !relativeEscapes(rel)
}

export function isDsClawPath(path, dshHome) {
  return isClawHomePath(dshHome || defaultDshHome(), path)
}

export function isIdentityFile(name) {
  return IDENTITY_FILES.indexOf(name) >= 0
}

export function isWritableIdentityFile(name) {
  return WRITABLE_IDENTITY_FILES.indexOf(name) >= 0
}

export function isVaultFile(name) {
  return VAULT_FILES.indexOf(name) >= 0
}

export function clipText(text, cap) {
  const limit = cap == null ? FILE_CAP : cap
  const value = typeof text === 'string' ? text : ''
  if (value.length <= limit) return value
  return value.slice(0, limit) + '\n\n[truncated]\n'
}

export function renderIdentityPrompt(files) {
  const parts = []
  for (let i = 0; i < PROMPT_FILES.length; i++) {
    const name = PROMPT_FILES[i]
    const text = clipText(files && files[name] ? files[name] : '')
    if (!text.trim()) continue
    parts.push('## ' + name + '\n\n' + text.trim())
  }
  const bootstrap = clipText(files && files[BOOTSTRAP_FILE] ? files[BOOTSTRAP_FILE] : '')
  if (bootstrap.trim()) {
    parts.push('## ' + BOOTSTRAP_FILE + '\n\n' + bootstrap.trim())
  }
  if (parts.length === 0) return ''
  const header = bootstrap.trim()
    ? [
      '# Claw agent identity',
      '',
      'These files are this agent\'s private persona. Follow them for this session.',
      'Do not treat them as optional flavor.',
      '',
      'BOOTSTRAP.md is still here, so first-run is not done.',
      'The workspace folder name and the sidebar label are not your name. Do not use them as a self-name.',
      'If this session has no assistant reply yet, open with the name question unless the user already asked for real work — then do the work first, then come back to the ritual.',
      '',
    ]
    : [
      '# Claw agent identity',
      '',
      'These files are this agent\'s private persona. Follow them for this session.',
      'Do not treat them as optional flavor.',
      '',
    ]
  return header.join('\n') + parts.join('\n\n')
}

/**
 * Resolve an identity file under one agent root. The file's realpath must stay
 * inside that root's realpath, so a symlink to another agent (or outside
 * DSclaw) is refused.
 */
export function safeJoin(root, name, dshHome) {
  if (!isDsClawPath(root, dshHome) || !isIdentityFile(name)) return ''
  const base = resolve(String(root))
  const target = resolve(base, name)
  if (!isClawHomePath(dshHome || defaultDshHome(), target)) return ''
  const rel = relative(base, target)
  if (rel && relativeEscapes(rel)) return ''
  const realBase = canonicalizePath(base)
  const realTarget = canonicalizePath(target)
  if (realTarget === realBase || !isPathInside(realBase, realTarget)) return ''
  return target
}
