// Writes the SHA-256 of each installer that tauri-action built, in `sha256sum` format, for the
// build provenance attestation. The paths come as the JSON array tauri-action outputs.
// Usage: node scripts/checksums.mjs '<json array>' checksums.txt
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [json, out] = process.argv.slice(2)
const lines = JSON.parse(json)
  // The .app bundle is a folder (its .tar.gz is attested), and the updater signatures are not installers
  .filter(p => statSync(p).isFile() && !p.endsWith('.sig'))
  // Named as GitHub shows the release assets, which turns spaces into dots
  .map(p => `${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${basename(p).replaceAll(' ', '.')}`)
if (lines.length === 0) throw new Error('No installers to attest')
writeFileSync(out, lines.join('\n') + '\n')
process.stdout.write(lines.join('\n') + '\n')
