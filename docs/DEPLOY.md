# Deploying onto a VPS that already runs other things

The box is not empty. Every step here is written so that a mistake takes down
this project and nothing else. Work through it in order — it maps onto the
Tue–Sat tasks in the build tracker.

## Tue — Inventory

Before touching anything, write down what is already there. You will need this
on Friday when you add the vhost.

```sh
ss -tulpn                      # what is listening, on which ports
docker ps -a                   # containers, running or not
systemctl list-units --type=service --state=running
nginx -T 2>/dev/null | head -50    # or: caddy adapt --config /etc/caddy/Caddyfile
ls /etc/letsencrypt/live/ 2>/dev/null
df -h && free -m
```

Two questions decide the rest of the week:

1. **Which reverse proxy is in front, and is it managed or hand-rolled?** A
   managed one (Caddy, nginx-proxy, Traefik) means Friday is a 30-minute job.
   A hand-rolled nginx config with manual certbot means Friday is a Saturday.
2. **Is there a Postgres already running, and what version?** If it is 14 or
   newer, add a database to it. If it is older, or it is tuned for another
   project's workload, run a second instance on another port instead.

## Wed — Snapshot, and prove the restore works

Take the provider snapshot. Then actually restore it to a throwaway instance
and boot it. A backup you have never restored is not a backup.

```sh
# Existing databases, before you add anything
pg_dumpall -U postgres | gzip > ~/pre-pitchside-$(date +%F).sql.gz
```

Keep that dump off the box.

## Thu — Database

Own database, own role, no superuser.

```sql
CREATE ROLE pitchside WITH LOGIN PASSWORD 'generate-a-real-one';
CREATE DATABASE pitchside OWNER pitchside;
REVOKE ALL ON DATABASE pitchside FROM PUBLIC;
```

Then confirm the other projects are untouched:

```sh
psql -U postgres -c "\l"          # the other databases still there, same owners
psql -U postgres -d <other_db> -c "\dt" | head
```

Apply the schema:

```sh
DATABASE_URL=postgres://pitchside:...@127.0.0.1:5432/pitchside \
  npx drizzle-kit migrate
```

12 tables, 11 foreign keys, 24 indexes, 3 enum types. Verify:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
```

## Fri — Reverse proxy

Add a vhost **beside** what is there. Do not replace the existing config, and
do not install a second ACME client — the one already issuing certificates for
the other projects issues this one too. Two certbots on one box fight over the
same challenge directory and both fail at renewal, three months later, quietly.

The app listens on a loopback port (3000 by default; pick another if taken —
your Tuesday inventory says which are free). The proxy terminates TLS and
forwards to it. Nothing but the proxy binds a public interface.

Check renewal still works for everything, not just the new domain:

```sh
certbot renew --dry-run        # or: caddy reload && journalctl -u caddy -n 50
```

## Sat — Scaffold and pipeline

Already built — this repository. What is left is wiring it to the box:

1. Build on the VPS or push a built image; either is fine at this size.
2. Run it under systemd or Docker Compose, restart on failure, env from the
   unit file or an `env_file` that is not in the repository.
3. Push-to-deploy from a branch, with the build running before the swap so a
   broken build never replaces a working process.
4. Finish with the page live over HTTPS on the domain.

## Standing rules

- **Deploy on Saturdays.** Weeknights push to a branch.
- **Migrations run before the new code starts**, and every migration in this
  project must be safe to apply while the old code is still running. Adding a
  column is; dropping one is not. Drop in a later migration, after the code
  that used it is gone.
- **Back up before every migration**, not just the first.

## Known advisories

`npm audit` reports 4 moderate advisories inside `drizzle-kit`'s deprecated
`@esbuild-kit/*` dependencies. They concern esbuild's **development** server.
`drizzle-kit` is a devDependency and is never in the production bundle; the
offered "fix" is a downgrade to drizzle-kit 0.18.1, a 2023 release that does
not support this schema. Left as-is deliberately. Re-check when drizzle-kit
drops the `@esbuild-kit` dependency.
