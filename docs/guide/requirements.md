# Requirements

StarDust needs a modern PHP and a specific class of database. It checks the database itself when it starts, so an unsupported server is refused up front rather than discovered in production.

## PHP and extensions

- **PHP 8.1 or later.** The test suite runs on 8.1, 8.2, 8.3 and 8.4.
- **`ext-pdo` and `ext-pdo_mysql`.** StarDust talks to the database only through PDO.

The package's only Composer dependencies are the interface packages `psr/log` and `psr/clock`.

## Supported databases

### MySQL and Percona 8.0.13+

MySQL and Percona Server 8.0.13 or later. The floor is firm: StarDust relies on functional unique indexes, which do not exist below 8.0.13. That rules out the whole early 8.0 series (8.0.0 to 8.0.12), not only 5.7.

### MariaDB 10.11+

MariaDB 10.11 or later. MariaDB has no equivalent of the index type MySQL provides, so the same "at most one live slot per field" guarantee is enforced there with a generated column and a plain unique index. That is why MariaDB's floor was chosen on its own merits rather than by mirroring MySQL's. **Shared hosting commonly runs MariaDB**, so check the version with your host.

### A behavioural difference on MariaDB

Range filters (`lt`, `lte`, `gt`, `gte`, and a `between` whose bounds straddle it) and field sorts order supplementary-plane Unicode characters, mostly emoji and well outside everyday text, at the opposite end from MySQL. Every other comparison, and ordinary text in any language, behaves identically on both.

## Unsupported engines

These are detected and refused, not merely untested:

- **MariaDB older than 10.11**, including 10.7 to 10.10. Those versions compare text inside JSON columns differently, and there is no fix that configuration alone can provide.
- **MySQL and Percona older than 8.0.13.**
- **Anything that is not MySQL, Percona or MariaDB.** PostgreSQL, SQLite and SQL Server are not supported. StarDust's schema and SQL are written for MySQL-family databases, and there is no in-memory stand-in for tests. See the [FAQ](/guide/faq#can-i-use-postgresql-or-sqlite).

## Engine detection at boot

You never configure which engine you are on. StarDust reads the server's version from the live connection and picks the right variants of the few statements that differ. If the server is below either floor it raises `UnsupportedServerException` instead of continuing.

The check happens the first time the engine needs to know its dialect, for example in `bootstrap()`, or when you call `serverEngine()`. It does not happen when you construct `StarDust`. To see what was detected:

```php
echo $engine->serverEngine()->name; // MYSQL or MARIADB
```

## Hosting requirements

For the reference deployment you need:

- persistent background processes or long-running containers (systemd, supervisor, Docker, Kubernetes, ECS or similar);
- PHP with CLI access, for the `bin/stardust` entry point;
- local filesystem write access, for export files and background import payloads (a mounted volume in containers);
- exactly one Watcher process, enforced by your process supervisor. StarDust adds its own safety net, but the supervisor is the primary guard.

If you cannot run persistent processes, a bounded `bin/stardust tick` on a schedule does the same work. A host with no shell, no cron and no scheduled URL fetch is not supported at any level. [Deployment](/operations/deployment) lists which hosting tiers qualify for each mode.
