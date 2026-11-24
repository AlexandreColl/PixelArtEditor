import { describe, expect, it } from 'vitest'
import { changelogSection, releaseNotes } from './release-notes.mjs'

const changelog = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-02-01

### Añadido

- Capas

## [0.1.0] - 2026-01-01

- Primera versión

[Unreleased]: https://example.com/compare/v0.2.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
`

describe('release notes', () => {
  it('takes the section of the version, up to the next one', () => {
    expect(changelogSection(changelog, '0.2.0')).toBe('### Añadido\n\n- Capas')
  })

  it('leaves the link definitions out of the last section', () => {
    expect(changelogSection(changelog, '0.1.0')).toBe('- Primera versión')
  })

  it('refuses to publish a version the changelog does not describe', () => {
    expect(changelogSection(changelog, 'Unreleased')).toBeNull()
    expect(() => releaseNotes(changelog, '0.3.0')).toThrow('no section for 0.3.0')
  })

  it('adds how to verify the installers', () => {
    expect(releaseNotes(changelog, '0.2.0')).toContain('gh attestation verify')
  })
})
