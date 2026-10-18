import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

export const CORE_VERSION = pkg.version
/** Contract / source baseline tag: dsh-v0.2.0-rc.2 */
export const SUPPORTED_DSH = '0.2.0-rc.2'
/** peerDependency range — prerelease-aware; matches Desktop 0.2.0-rc.1 + Web 0.2.0-rc.2 */
export const SUPPORTED_DSH_PEER = '^0.2.0-rc.1'
