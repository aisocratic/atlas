// Verify an occupied port is rejected before setup or an unrelated HTTP server is used.
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
const occupied = createServer()
await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve))
try {
  const port = occupied.address().port
  const child = spawn(process.execPath, ['scripts/verify-package.mjs'], {
    env: { ...process.env, ATLAS_PACKAGE_PORT: String(port), ATLAS_TEST_DATABASE_URL: 'postgres://roadmap@127.0.0.1:1/roadmap_test' },
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  assert.equal(code, 1)
  assert.match(output, new RegExp(`port ${port} is occupied`))
  assert.doesNotMatch(output, /ECONNREFUSED/)
  console.log('Occupied package port rejected before database access.')
} finally { occupied.close() }
