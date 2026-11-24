// Prints the release notes for a version: its section of CHANGELOG.md, plus how to verify the
// installers. Used by the release workflow; `node scripts/release-notes.mjs 0.6.0`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/AlexandreColl/PixelArtEditor'

/** The body of `## [version]` in the changelog, without its heading, or null if it is missing. */
export function changelogSection(changelog, version) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(l => l.startsWith(`## [${version}]`))
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => l.startsWith('## ['))
  const body = (end < 0 ? rest : rest.slice(0, end))
    // The link definitions at the end of the file are not part of the last section
    .filter(l => !/^\[[^\]]+\]: /.test(l))
    .join('\n')
    .trim()
  return body || null
}

export function releaseNotes(changelog, version) {
  const section = changelogSection(changelog, version)
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`)
  return `${section}

---

**Verificar la descarga.** Cada instalador lleva una atestación de procedencia firmada por GitHub Actions, que demuestra que se compiló a partir de este repositorio. Con [GitHub CLI](https://cli.github.com/):

\`\`\`sh
gh attestation verify <instalador> --repo AlexandreColl/PixelArtEditor
\`\`\`

[Todos los cambios](${REPO}/blob/main/CHANGELOG.md)
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('..', import.meta.url)
  let version = (process.argv[2] ?? '').replace(/^v/, '')
  // Run by hand from a branch: use the version being released
  if (!/^\d+\.\d+\.\d+/.test(version)) version = JSON.parse(readFileSync(new URL('package.json', root))).version
  process.stdout.write(releaseNotes(readFileSync(new URL('CHANGELOG.md', root), 'utf8'), version))
}
