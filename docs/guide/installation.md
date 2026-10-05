# Installation

This page takes you from an empty project to a StarDust instance connected to a bootstrapped database. It assumes you already meet the [requirements](/guide/requirements) and have an empty MySQL or MariaDB database to use.

## Install with Composer

```bash
composer require damarbob/stardust:^0.3@alpha
```

**The `@alpha` flag is required** while StarDust has no stable release. Composer installs only stable versions by default, so a bare `composer require damarbob/stardust` fails with "Could not find a version … matching your minimum-stability". The flag applies to this one package only, and the rest of your dependencies stay on stable versions.

The package pulls in only `psr/log` and `psr/clock`, both interface-only packages. It brings no framework, ORM, query builder or logging implementation.

## Prepare the PDO connection

StarDust takes a PDO you create. One attribute is required and one is a choice:

```php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=app', $user, $pass, [
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION, // required
    PDO::ATTR_EMULATE_PREPARES => false, // optional, either setting works
]);
```

`ERRMODE_EXCEPTION` is required because several of the engine's guards need a failed statement to raise. Native prepares (`false`) are what the test suite uses by default, so the examples here use them, but PHP's emulated default works too. See [Configuration](/usage/configuration#pdo-connection-settings) for details, and [Integrating with your application](/usage/integrating#sharing-your-applications-pdo) if your application already has a PDO you were planning to reuse.

The database named in the DSN must already exist. StarDust creates tables in it but does not create the database itself. The database user needs the privileges to create tables: bootstrap creates the schema, and the Watcher later creates further tables as it adds capacity.

## Construct StarDust

```php
use StarDust\Config\Config;
use StarDust\StarDust;

$engine = new StarDust(new Config(pdo: $pdo));
```

`Config` needs only the PDO. Everything else has a default. Constructing the object does no I/O, so nothing has touched the database yet. See [Configuration](/usage/configuration) for the settings you may want to change.

## Bootstrap the schema

Bootstrapping creates every table the engine needs. It is idempotent and non-destructive: running it again on a bootstrapped database changes nothing, and it never drops or rewrites existing data, so it is safe to run on every deploy.

### From PHP

```php
$engine->bootstrap();
```

### From the CLI

The CLI reads its connection from environment variables:

```bash
STARDUST_DSN='mysql:host=127.0.0.1;dbname=app' \
STARDUST_USER=app STARDUST_PASS=secret \
  vendor/bin/stardust bootstrap
```

`STARDUST_DSN` and `STARDUST_USER` are required and `STARDUST_PASS` defaults to empty. On success it prints `stardust: bootstrap complete.` Use the CLI form in a deploy script, and the PHP form from a console command or a test setup.

## Verify the installation

Check the version the CLI reports:

```bash
vendor/bin/stardust --version
# 0.3.0-alpha.1
```

Then check what the engine detected on your database, and that the registry is reachable:

```php
echo $engine->serverEngine()->name;   // MYSQL or MARIADB

var_dump($engine->listModels(tenantId: 1)); // array(0) {} on a fresh database
```

If the server is below the supported floor, `serverEngine()` raises `UnsupportedServerException` here, which is the point of checking. If `listModels()` returns an empty list without error, the connection, the required PDO attributes and the schema are all in place.

## Next steps

- Follow the [complete example](/guide/tutorial) to define a model, write entries and filter them.
- Or run the whole thing with no setup using the [five-minute quickstart](/guide/quickstart).
- Read [Deployment](/operations/deployment) before you go to production. StarDust needs its background processes running, or a scheduled `tick`, for capacity and deferred work.
