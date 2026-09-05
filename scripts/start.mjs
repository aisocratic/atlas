import { cp, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import nextEnv from '@next/env'
nextEnv.loadEnvConfig(process.cwd(), false)
const options = { port: process.env.PORT ?? '3000', hostname: process.env.ATLAS_HOST ?? '127.0.0.1' }
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i += 2) {
  const name = { '--port': 'port', '-p': 'port', '--hostname': 'hostname', '-H': 'hostname' }[args[i]]
  if (!name || !args[i + 1]) throw new Error('Usage: pnpm start [--hostname HOST] [--port PORT]')
  options[name] = args[i + 1]
}
if (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535) throw new Error('Port must be 1–65535')
await access('.next/standalone/server.js')
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
try { await access('public'); await cp('public', '.next/standalone/public', { recursive: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
// Run Next in this process so service-manager signals reach the HTTP server.
process.env.NODE_ENV = 'production'
process.env.HOSTNAME = options.hostname
process.env.PORT = options.port
await import(pathToFileURL(resolve('.next/standalone/server.js')).href)
