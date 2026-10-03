# CLAUDE.md

Guidance for AI coding agents in this repository. How to build and deploy the site is in [README.md](README.md).

## This repository

- English pages live under `docs/`, and their Indonesian counterparts under `docs/id/` with the same paths. A change to one page usually means changing its counterpart too.
- `docs/reference/glossary.md` and `docs/id/reference/glossary.md` are generated from the separate `StarDustGlossary` repo. Edit the content there and rerun its compiler, never the generated files.
- These pages are consumer-facing. **Never cite an ADR, and never name a numbered build phase** ("Phase 5"). Name the feature or daemon instead.
- `npm run docs:build` fails on a dead internal link, so run it before calling a change done.

## Writing style

Every human-read text here follows StarDust's writing style guide (`.agent/rules/writing-style-guide.md` in <https://github.com/damarbob/StarDust>). The core of it:

- Never use an em dash or an en dash, nor a hyphen standing in for one. Split the sentence, or use a comma or parentheses. Hyphenated words such as "end-to-end" are fine.
- Never put a colon or semicolon in a heading or title.
- Use colons and semicolons sparingly in prose. Prefer two sentences.
- One strong claim with a concrete fact beside it is fine. Two in one line, or one in every sentence, reads as generated.
- Aim for about 80% formal and 20% conversational, nearer fully formal on reference pages. Vary sentence length, and never introduce errors on purpose.

Older pages still have dashes. Follow the rule for every sentence you write or rewrite.

## Indonesian copy

- **StarDust terms stay English**: Field, Entry, Tenant, Page, Slot, Engine, Wire format and the rest of the glossary. If a translation sounds odd in Indonesian, keep the English. `bidang`, `penyewa`, `halaman`, `mesin` and `kawat` were all tried and reverted.
- **Re-compose, don't translate word by word.** Literal idioms and prepositions read as calque, for example `kolom kelas satu` for "first-class columns" or `di bawah` for "under this clause".
- **Check meaning against the English, not just fluency.** Words with a narrow technical sense are where a fluent translation goes wrong. A "free" slot is available, not `gratis`. A "tombstoned" column is marked, not `dihapus`. A double negative must survive translation.
- If swapping one word doesn't fix an awkward sentence, rewrite the whole sentence.

## Commits

- Don't commit unless asked. Hand over the message and a `git add` with explicit paths.
- **Never add a `Co-Authored-By` line** or any other attribution trailer. A person adds one by hand if they want it.
- Follow StarDust's `.agent/rules/commit-style-guide.md`: an imperative subject with no prefix, bullets for several changes, body lines never hard-wrapped, and never `#` followed by digits.
