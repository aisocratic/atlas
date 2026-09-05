// Smoke the installed production package against a disposable local database schema.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createSocketServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
const url = new URL(process.env.ATLAS_TEST_DATABASE_URL ?? '')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && /test|roadmap/.test(url.pathname), 'Use an explicitly local test database')
const suffix = randomBytes(6).toString('hex'), schema = `atlas_package_${suffix}`, demo = `atlas_demo_package_${suffix}`
const port = Number(process.env.ATLAS_PACKAGE_PORT ?? 4295), origin = `http://127.0.0.1:${port}`
assert(Number.isInteger(port) && port >= 1 && port <= 65535, 'Invalid package test port')
async function assertPortFree() {
  const probe = createSocketServer()
  await new Promise((resolve, reject) => {
    probe.once('error', error => reject(new Error(`Package test port ${port} is occupied; refusing to use an unrelated server.`, { cause: error })))
    probe.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
}
// Check before any migrations or child processes. A stale server must never pass readiness.
await assertPortFree()
const fixture = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><title>Atlas package fixture</title><h1>Packaging test</h1></html>') })
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: url.href, ATLAS_SCHEMA: schema, ATLAS_DEMO: 'false', ATLAS_DEMO_SCHEMA: demo, ATLAS_AUTH: 'password', ATLAS_PASSWORD: randomBytes(20).toString('hex'), ATLAS_SESSION_SECRET: randomBytes(32).toString('hex'), ATLAS_APP_URL: origin, ATLAS_SITE_URL: `http://127.0.0.1:${fixture.address().port}`, ATLAS_HOST: '127.0.0.1', PORT: String(port) }
function run(args, overrides = {}) { return new Promise((resolve, reject) => { const child = spawn('pnpm', args, { env: { ...env, ...overrides }, stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`))) }) }
let server, serverClosed, serverError
async function stopServer() {
  if (!server?.pid) return
  function signalGroup(signal) {
    try { process.kill(-server.pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  // pnpm launches a shell and Node: terminate the entire isolated process group.
  signalGroup('SIGTERM')
  const exited = await Promise.race([serverClosed.then(() => true), delay(5000, undefined, { ref: false }).then(() => false)])
  if (!exited) { signalGroup('SIGKILL'); await serverClosed }
  // A wrapper exiting is insufficient evidence: descendants must release the socket.
  for (let i = 0; i < 50; i++) {
    try { await assertPortFree(); return } catch { await delay(100) }
  }
  signalGroup('SIGKILL')
  await assertPortFree()
}
const pool = new pg.Pool({ connectionString: url.href })
try {
  await run(['run', 'setup']); await run(['run', 'setup'])
  await run(['collect', 'seo-audit'])
  assert(Number((await pool.query(`select count(*) from "${schema}".seo_audits`)).rows[0].count) > 0)
  await run(['seed'], { ATLAS_DEMO: 'true' })
  server = spawn('pnpm', ['start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...env, PORT: String(port + 1), ATLAS_DEMO: 'true' }, stdio: 'inherit', detached: true })
  serverClosed = new Promise(resolve => { server.once('error', error => { serverError = error; resolve() }); server.once('close', resolve) })
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (serverError) throw serverError
    assert(server.exitCode === null && server.signalCode === null, 'Production server exited before readiness')
    try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).status === 200) { ready = true; break } } catch {}
    await delay(500)
  }
  assert(server.exitCode === null && server.signalCode === null, 'Production server exited during readiness')
  assert(ready, 'Production server starts')
  assert.equal((await fetch(`${origin}/api/datasets/seo-audit`)).status, 401)
  const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.ATLAS_PASSWORD }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const response = await fetch(`${origin}/api/datasets/seo-audit`, { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  assert.match(await response.text(), /synthetic/)
  const html = await (await fetch(`${origin}/login`)).text()
  const assets = [...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match => match[1])
  assert(assets.length > 0)
  for (const asset of assets) assert.equal((await fetch(new URL(asset.replaceAll('&amp;', '&'), origin))).status, 200, asset)
  console.log('Package verified: idempotent migrations, real SEO fixture collection, demo seed, production auth, datasets and static assets.')
} finally {
  try { await stopServer() } finally {
    fixture.close()
    await pool.query(`drop schema if exists "${schema}" cascade`)
    await pool.query(`drop schema if exists "${demo}" cascade`)
    await pool.end()
  }
}
console.log(`Package server fully stopped; port ${port} is free.`)
