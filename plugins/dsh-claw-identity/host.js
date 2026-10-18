import { readFileSync } from 'node:fs'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { httpError, registerJsonRoute } from 'dsh-claw-core/http'
import {
  BOOTSTRAP_FILE,
  IDENTITY_FILES,
  PROMPT_FILES,
  WRITABLE_IDENTITY_FILES,
  defaultDshHome,
  isDsClawPath,
  isVaultFile,
  isWritableIdentityFile,
  renderIdentityPrompt,
  safeJoin,
} from './identity-files.mjs'
import { ensureMemoryDir } from './identity-memory.mjs'

export const name = 'dsh-claw-identity'
export const inject = ['systemPrompt', 'connection']

let dshHome = defaultDshHome()
const _internal = {
  setDshHome(dir) { dshHome = dir },
  getDshHome() { return dshHome },
}
export { _internal }

async function readOptionalFile(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

// rename replaces a symlink at `path` instead of writing through it.
async function atomicWrite(path, text) {
  const tmp = path + '.' + process.pid + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(tmp, text)
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

async function readIdentityFiles(root) {
  const files = {}
  for (let i = 0; i < IDENTITY_FILES.length; i++) {
    const name = IDENTITY_FILES[i]
    const path = safeJoin(root, name, dshHome)
    if (!path) continue
    files[name] = await readOptionalFile(path)
  }
  return files
}

function cwdOf(agent) {
  const session = agent && agent.session
  const header = session && session.header
  return header && header.cwd ? String(header.cwd) : ''
}

function loadPrompt(root) {
  const files = {}
  const names = PROMPT_FILES.concat([BOOTSTRAP_FILE])
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const path = safeJoin(root, name, dshHome)
    if (!path) continue
    try {
      files[name] = readFileSync(path, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') files[name] = ''
    }
  }
  return renderIdentityPrompt(files)
}

export function apply(ctx) {
  const stopSection = ctx.systemPrompt.section({
    name: 'dsh-claw-identity',
    order: 15,
    text: (assemble) => {
      const cwd = cwdOf(assemble && assemble.agent)
      if (!isDsClawPath(cwd, dshHome)) return ''
      return loadPrompt(cwd)
    },
  })

  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/identity/read',
    handle: async (body) => {
      const root = body && body.root
      if (!isDsClawPath(root, dshHome)) {
        throw httpError(400, 'invalid identity root')
      }
      const files = await readIdentityFiles(root)
      return { files }
    },
  })

  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/identity/write',
    handle: async (body) => {
      const root = body && body.root
      const incoming = body && body.files
      if (!isDsClawPath(root, dshHome) || incoming == null || typeof incoming !== 'object') {
        throw httpError(400, 'invalid identity write')
      }
      const names = Object.keys(incoming)
      if (names.some((name) => isVaultFile(name))) {
        throw httpError(400, 'USER.md and MEMORY.md are owned by memory')
      }
      const written = []
      for (let i = 0; i < WRITABLE_IDENTITY_FILES.length; i++) {
        const name = WRITABLE_IDENTITY_FILES[i]
        if (!Object.prototype.hasOwnProperty.call(incoming, name)) continue
        if (!isWritableIdentityFile(name)) continue
        const path = safeJoin(root, name, dshHome)
        if (!path) continue
        const text = typeof incoming[name] === 'string' ? incoming[name] : ''
        await atomicWrite(path, text)
        written.push(name)
      }
      ensureMemoryDir(root)
      return { written }
    },
  })

  ctx.effect(() => () => {
    if (typeof stopSection === 'function') stopSection()
  })
}
