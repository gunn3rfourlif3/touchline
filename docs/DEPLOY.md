# Deploying onto a VPS that already runs other things

The box is not empty. Every step here is written so that a mistake takes down
this project and nothing else. Work through it in order — it maps onto the
Tue–Sat tasks in the build tracker.

## Tue — Inventory ✅ done 17 Nov

See **[docs/VPS-INVENTORY.md](./VPS-INVENTORY.md)** for the findings. In short:

- **Everything on that box is Docker.** No proxy or database packages on the
  host at all.
- **Caddy is the edge**, in the `deploy` compose project, with automatic TLS.
- **Five Postgres instances**, each private to its own project, none published.
- **Port 3000 is taken** by `zaaka-pi-auction-app-1`.

The rest of this document is written against those facts. An earlier draft
assumed a host-installed proxy and a free port 3000; both were wrong.

## Wed — Snapshot, and prove the restore works

Take the provider snapshot. Then actually restore it to a throwaway instance
and boot it. A backup you have never restored is not a backup.

There is no backup service in the running units, so check first whether a
crontab is doing it — Wednesday assumes you are adding to a habit, and if
there is no habit, that is the more important finding:

```sh
crontab -l; sudo crontab -l; ls /etc/cron.d/
```

Dump every database on the box before adding a sixth. Each lives in its own
container, so each needs its own dump:

```sh
mkdir -p ~/pre-touchline-$(date +%F) && cd ~/pre-touchline-$(date +%F)
for c in xnith-db-1 demo-demo-postgres-1 eternalguard-db-1 deploy-postgres-1; do
  docker exec "$c" pg_dumpall -U postgres | gzip > "$c.sql.gz"
done
for c in cofifi-db-1 buddhapets-mariadb-1; do
  docker exec "$c" sh -c 'mysqldump --all-databases -uroot -p"$MARIADB_ROOT_PASSWORD"' \
    | gzip > "$c.sql.gz"
done
ls -lh
```

Keep those dumps off the box. A snapshot that lives only on the machine it
protects is not a backup either.

## Thu — Database

Touchline gets **its own `postgres:16-alpine` container**, inside its own
compose project, not a database inside one of the five that already run. The
reasoning is in the inventory; the short version is that sharing an instance
couples Touchline's uptime to another project's `docker compose down`.

No published port. The app reaches it by service name on the project network.

```yaml
# compose.yml — the database half
services:
  touchline-db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: touchline
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it}
      POSTGRES_DB: touchline
    volumes:
      - touchline-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U touchline"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [internal]

volumes:
  touchline-pgdata:
```

Apply the schema from inside the project network:

```sh
docker compose run --rm \
  -e DATABASE_URL=postgres://touchline:...@touchline-db:5432/touchline \
  touchline-app npx drizzle-kit migrate
```

Expect **12 tables, 11 foreign keys, 24 indexes, 3 enum types**. Verify:

```sh
docker compose exec touchline-db psql -U touchline -d touchline -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
```

Then confirm you changed nothing else — the other four Postgres containers
should still be healthy and untouched:

```sh
docker ps --filter 'name=postgres' --filter 'name=db' \
  --format '{{.Names}}\t{{.Status}}'
```

## Fri — Caddy

Caddy already terminates TLS for every site on the box and provisions
certificates automatically. There is no certbot, nothing to renew by hand, and
no second ACME client to install — installing one would fight the existing
setup over the same challenge path and both would fail at renewal, quietly,
months later.

**First, name the network Caddy is on.** This is the one fact the inventory
could not supply:

```sh
docker inspect deploy-caddy-1 \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Join it as external, and keep the database on a separate internal network so
Caddy cannot reach it:

```yaml
services:
  touchline-app:
    build: .
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      touchline-db:
        condition: service_healthy
    expose: ["3000"]          # internal only — 3000 is taken on the host
    networks: [internal, edge]

networks:
  internal:
  edge:
    external: true
    name: <the network from the command above>
```

Then the site block in the `deploy` project's Caddyfile:

```
touchline.example.com {
    encode zstd gzip
    reverse_proxy touchline-app:3000
}
```

Reload rather than restart, so the other sites never drop a request:

```sh
docker compose exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
docker logs --tail 50 deploy-caddy-1
```

Then check the other sites still answer, not just the new one. A bad Caddyfile
takes down every site on the box, not only this one.

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
