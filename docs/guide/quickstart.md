# Try it in five minutes

One command brings up a database, creates the schema, seeds a sample model, runs an indexed filter and starts all four background processes. It is the fastest way to see StarDust work before you install anything in your own project.

## Prerequisites

- Docker with Docker Compose.
- Git, to clone the repository.
- An internet connection on the first run: the setup step installs Composer dependencies inside the container.

Nothing else is needed on your machine. PHP and MySQL both run in containers.

## Start the stack

```bash
git clone https://github.com/damarbob/StarDust.git
cd StarDust
docker compose up
```

This starts, in order:

1. **`mysql`**: MySQL 8.0 with a `stardust` database.
2. **`init`**: a one-shot service that installs dependencies, bootstraps the schema, runs the seed script and exits.
3. **`watcher`, `reconciler`, `liberator` and `chronicler`**: the four background processes, started once `init` has finished successfully.

The MySQL container is also published on your host at port **3307**, in case you want to connect a database client to it. Set `STARDUST_HOST_DB_PORT` to use another port if 3307 is taken. The containers themselves talk to each other over the Compose network and do not depend on that mapping.

## What just happened

The `init` service ran [`docker/seed.php`](https://github.com/damarbob/StarDust/blob/main/docker/seed.php), which is the whole StarDust flow in one short script:

1. It connected with a PDO set to raise exceptions and bootstrapped the schema.
2. It registered a `company` model with four filterable fields: `name`, `industry`, `employees` and `founded`.
3. It provisioned an indexed page and reserved a slot for each field, so the very first query already uses indexes. In a real deployment the Watcher does this for you automatically.
4. It wrote five companies from a raw JSON array, the way a CMS or HTTP layer would hand entries over.
5. It decoded a filter from a JSON wire payload and ran it.

The [complete example](/guide/tutorial) walks through the same steps one at a time.

## Read the seeded query

The filter's results are printed by the `init` service. Read them with:

```bash
docker compose logs init
```

You should see the software companies with more than 100 employees:

```text
=== StarDust quickstart ===
Software companies with more than 100 employees:
  - Initech      software       510 employees
  - Hooli        software       240 employees
```

Those two rows came from `industry = 'software' AND employees > 100`. `industry` and `employees` are user-defined fields, not table columns, and the query ran as an indexed range scan.

To experiment, edit `docker/seed.php` and run `docker compose up init` again. The script is idempotent: the model and fields are get-or-create, and seeding is skipped once the model already has entries.

## Watch the daemons work

The four background processes are running as separate containers:

```bash
docker compose ps
docker compose logs -f watcher reconciler
```

Each writes one JSON object per line to its log. They stay idle until there is work to do.

To see them do something, run the field lifecycle example inside the stack. It promotes a field to filterable and shows what happens next, and `--observe` tells it to tick nothing itself and watch your running daemons instead:

```bash
docker compose run --rm init php examples/01-field-lifecycle.php --observe
```

The Watcher checks for work once a minute by default, so it can take a while for the page to be provisioned. That wait is real, and it is exactly the [backfill window](/concepts/background-work#backfill-windows) the example exists to show. See [Runnable examples](/guide/examples).

## Tear it down

```bash
docker compose down -v
```

`-v` also removes the database volume, so the next `docker compose up` starts from scratch. Leave it off to keep your data.

## Not a production setup

This stack is for trying StarDust out. It is not a template for deployment:

- the database password is `root`, and the database port is published on your host;
- the repository is bind-mounted into every container;
- there is one container per daemon, with no supervision beyond Docker's restart policy;
- the entries are sample data.

For production, see [Deployment](/operations/deployment).
