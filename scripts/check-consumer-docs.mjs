#!/usr/bin/env node
// Guards the consumer-facing rules the main StarDust repo's
// DocsConsistencyTest enforces: no ADR citations and no numbered build
// phases. ADRs and phase numbers are internal sequencing vocabulary
// from the SDDPG design repo, so a reader of this site has never seen
// them, and the pages don't name that repo either.

import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'

const ADR_PATTERN = /\bADRs?\b/
const PHASE_PATTERN = /\bphases?\s+(\d|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b)/i
const DESIGN_REPO_PATTERN = /\bSDDPG\b/

let failures = []

for await (const path of glob('docs/**/*.md')) {
  const contents = readFileSync(path, 'utf8')

  if (ADR_PATTERN.test(contents)) {
    failures.push(`${path}: cites an ADR. State the behaviour directly instead.`)
  }

  if (PHASE_PATTERN.test(contents)) {
    failures.push(`${path}: refers to a numbered build phase. Name the feature or daemon instead.`)
  }

  if (DESIGN_REPO_PATTERN.test(contents)) {
    failures.push(`${path}: names the internal design repository. Describe the behaviour instead.`)
  }
}

if (failures.length > 0) {
  console.error('Consumer docs guard failed:\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log('Consumer docs guard passed. No ADR citations, build phases or design repository names found.')
