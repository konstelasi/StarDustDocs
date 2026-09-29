# Contributing

Bug reports, questions and pull requests against the engine are welcome, and so are fixes to this documentation site. Both live in their own repository with their own contribution flow — this page covers both.

## Setting up

Clone [the engine repository](https://github.com/damarbob/StarDust), then:

```bash
composer install
cp phpunit.xml.dist phpunit.xml    # gitignored — put your database credentials here
```

Point the credentials at a **throwaway database** — the bootstrap tests drop every StarDust table between runs. You'll need PHP 8.1+ and a MySQL 8.0.13+, Percona 8.0.13+, or MariaDB 10.11+ server to run the full smoke suite, but the suite skips cleanly rather than failing when no credentials are configured, so a fresh clone runs green without one.

## Before you push

Three commands, the same ones CI runs:

```bash
vendor/bin/phpstan analyse
npx --yes markdownlint-cli2@0.23.2 "*.md" "src/**/*.md" ".agent/**/*.md" "docs/**/*.md"
vendor/bin/phpunit --testsuite Smoke
```

Most of the project's conventions are enforced by these rather than by review, so a mistake surfaces immediately instead of days later in a pull request comment.

## Reporting an issue

Open an issue on [the engine's GitHub repository](https://github.com/damarbob/StarDust/issues). Include your PHP version, your database engine and its version, and a minimal reproduction if you can put one together — a failing test is the fastest way to get something fixed.

## Improving these docs

Found a mistake on this site, a broken link, or a page that could be clearer? This site is its own repository — [StarDustDocs](https://github.com/konstelasi/StarDustDocs) — built with [VitePress](https://vitepress.dev/). Clone it, `npm install`, then `npm run docs:dev` to preview your changes locally before opening a pull request.

Pages exist in English under `docs/` and in Indonesian under `docs/id/`, mirroring each other file for file. A fix to one usually wants the same fix in the other — if you're not comfortable making the Indonesian edit yourself, say so in the pull request and note which page needs it.
