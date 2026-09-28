#!/usr/bin/env node
// Guards the same two consumer-facing rules the main StarDust repo's
// DocsConsistencyTest enforces: no ADR citations, no numbered build
// phases. ADRs and phase numbers are internal sequencing vocabulary
// from the SDDPG design repo; a reader of this site has never seen it.

import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'

const ADR_PATTERN = /\bADR\b/
const PHASE_PATTERN = /\bphases?\s+\d/i

let failures = []

for await (const path of glob('docs/**/*.md')) {
  const contents = readFileSync(path, 'utf8')

  if (ADR_PATTERN.test(contents)) {
    failures.push(`${path}: cites an ADR — state the behaviour directly instead.`)
  }

  if (PHASE_PATTERN.test(contents)) {
    failures.push(`${path}: refers to a numbered build phase — name the feature or daemon instead.`)
  }
}

if (failures.length > 0) {
  console.error('Consumer docs guard failed:\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log(`Consumer docs guard passed — no ADR citations or numbered build phases found.`)
