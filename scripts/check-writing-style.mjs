#!/usr/bin/env node
// Guards the two rules of the StarDust writing style guide that a script can
// check. A page never uses an em dash, an en dash or a hyphen standing in for
// one, and a heading never holds a colon or a semicolon. Code is exempt, so
// fenced blocks and inline code are skipped.
//
// With no arguments it checks every page under docs/ and the README. Pass
// file paths to check only those.

import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'

const DASH = /[\u2013\u2014]/
const SPACED_HYPHEN = /(?<=\S) -{1,2} (?=\S)/
const HEADING = /^#{1,6}\s/
// The changelog guide sets "## [1.4.0] - 2026-02-22" as the version heading.
const VERSION_HEADING = /^#{2}\s\[[^\]]+\] - \d{4}-\d{2}-\d{2}$/
const TABLE_RULE = /^\|[\s:|-]+$/

const failures = []

function check(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let fenced = false
  let frontMatter = lines[0] === '---'

  lines.forEach((line, index) => {
    if (frontMatter && index > 0 && line === '---') {
      frontMatter = false
      return
    }
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      return
    }
    if (fenced) return

    const text = line.replace(/`[^`]*`/g, '')
    const where = `${path}:${index + 1}`

    if (DASH.test(text)) {
      failures.push(`${where}: has an em dash or an en dash. Split the sentence, or use a comma or parentheses.`)
    } else if (!VERSION_HEADING.test(text) && !TABLE_RULE.test(text) && SPACED_HYPHEN.test(text)) {
      failures.push(`${where}: uses a hyphen as a dash. Split the sentence, or use a comma or parentheses.`)
    }

    if (!frontMatter && HEADING.test(text) && /[:;]/.test(text)) {
      failures.push(`${where}: has a colon or a semicolon in a heading.`)
    }
  })
}

const paths = process.argv.length > 2 ? process.argv.slice(2) : ['README.md']
if (process.argv.length <= 2) {
  for await (const path of glob('docs/**/*.md')) {
    paths.push(path)
  }
}

for (const path of paths) {
  check(path)
}

if (failures.length > 0) {
  console.error('Writing style guard failed:\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log(`Writing style guard passed. No dashes or heading colons in ${paths.length} files.`)
