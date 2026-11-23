// Turns coverage/coverage-summary.json into a Markdown table for the CI job summary.
import { readFileSync } from 'node:fs'

const { total } = JSON.parse(readFileSync(new URL('../coverage/coverage-summary.json', import.meta.url), 'utf8'))
const rows = [
  ['Líneas', total.lines],
  ['Sentencias', total.statements],
  ['Funciones', total.functions],
  ['Ramas', total.branches],
].map(([name, m]) => `| ${name} | ${m.pct.toFixed(1)} % | ${m.covered} / ${m.total} |`)

process.stdout.write(
  ['### Cobertura de tests', '', '| | % | Cubierto |', '| --- | ---: | ---: |', ...rows, ''].join('\n'),
)
