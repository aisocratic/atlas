// Smoke the installed production package against a disposable local database schema.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import pg from 'pg'
const url = new URL(process.env.ATLAS_TEST_DATABASE_URL ?? '')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && /test|roadmap/.test(url.pathname), 'Use an explicitly local test database')
const suffix = randomBytes(6).toString('hex'), schema = `atlas_package_${suffix}`, demo = `atlas_demo_package_${suffix}`
const port = Number(process.env.ATLAS_PACKAGE_PORT ?? 4295), origin = `http://127.0.0.1:${port}`
const fixture = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><title>Atlas package fixture</title><h1>Packaging test</h1></html>') })
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: url.href, ATLAS_SCHEMA: schema, ATLAS_DEMO: 'false', ATLAS_DEMO_SCHEMA: demo, ATLAS_AUTH: 'password', ATLAS_PASSWORD: randomBytes(20).toString('hex'), ATLAS_SESSION_SECRET: randomBytes(32).toString('hex'), ATLAS_APP_URL: origin, ATLAS_SITE_URL: `http://127.0.0.1:${fixture.address().port}`, ATLAS_HOST: '127.0.0.1', PORT: String(port) }
function run(args, overrides = {}) { return new Promise((resolve, reject) => { const child = spawn('pnpm', args, { env: { ...env, ...overrides }, stdio: 'inherit' }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`))) }) }
let server
const pool = new pg.Pool({ connectionString: url.href })
try {
  await run(['run', 'setup']); await run(['run', 'setup'])
  await run(['collect', 'seo-audit'])
  assert(Number((await pool.query(`select count(*) from "${schema}".seo_audits`)).rows[0].count) > 0)
  await run(['seed'], { ATLAS_DEMO: 'true' })
  server = spawn('pnpm', ['start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...env, PORT: String(port + 1), ATLAS_DEMO: 'true' }, stdio: 'inherit' })
  let ready = false
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${origin}/login`)).status === 200) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 500)) }
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
  server?.kill('SIGTERM')
  fixture.close()
  await pool.query(`drop schema if exists "${schema}" cascade`)
  await pool.query(`drop schema if exists "${demo}" cascade`)
  await pool.end()
}
