import { cp, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import nextEnv from '@next/env'
nextEnv.loadEnvConfig(process.cwd(), false)
await access('.next/standalone/server.js')
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
try { await access('public'); await cp('public', '.next/standalone/public', { recursive: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', HOSTNAME: process.env.ATLAS_HOST ?? '127.0.0.1' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 1))
