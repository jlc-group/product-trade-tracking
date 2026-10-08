import { readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

// Stable PM2 entrypoint; secrets and the current pointer survive every release.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
Object.assign(process.env, parseEnv(readFileSync(resolve(root, '.env'), 'utf8')))
const current = JSON.parse(readFileSync(resolve(root, 'current.json'), 'utf8'))
if (!/^[0-9a-f]{40}$/.test(current.revision)) throw new Error('Invalid release revision')
const release = resolve(root, 'releases', current.release)
if (!release.startsWith(resolve(root, 'releases') + sep)) throw new Error('Invalid release path')
process.env.NODE_ENV = 'production'
process.env.RELEASE_SHA = current.revision
process.env.WEB_DIST = resolve(release, 'apps/web/dist')
process.chdir(resolve(release, 'apps/api'))
await import(pathToFileURL(resolve(release, 'apps/api/dist/main.js')).href)
