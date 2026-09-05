import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
if (execFileSync('git', ['status', '--porcelain']).toString().trim()) throw new Error('Commit changes before packaging a release.')
await mkdir('dist', { recursive: true })
const name = `atlas-${version}-source.tar.gz`
// git archive fixes timestamps and file ordering to the committed tree.
execFileSync('git', ['archive', '--format=tar.gz', `--prefix=atlas-${version}/`, `--output=dist/${name}`, 'HEAD'])
const hash = createHash('sha256').update(await readFile(`dist/${name}`)).digest('hex')
await writeFile('dist/SHA256SUMS', `${hash}  ${name}\n`)
console.log(`dist/${name}\n${hash}`)
