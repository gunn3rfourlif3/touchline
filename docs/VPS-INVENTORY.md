# VPS inventory — 17 Nov 2026

Tuesday's task. Everything below is observed, not assumed. The two decisions
it settles are at the bottom.

## The box

| | |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS |
| Host | `vmi3453343`, user `deploy` (uid 1001) |
| CPU | 6 cores |
| RAM | 11.9 GB total, 3.5 GB used, 8.4 GB available |
| Disk | 193 GB, 82 GB used, 111 GB free (43%) |
| Hardening present | `fail2ban`, `unattended-upgrades` both running |

Room for another small stack. Not room for carelessness: there are already
about 20 containers and **five** separate Postgres instances running.

## Everything is Docker

No `nginx`, `caddy`, `apache2` or `psql` binary exists on the host — which is
why the proxy, vhost, cert and Postgres sections of the inventory came back
empty. They are not missing; they are inside containers. Any plan written
against host packages is wrong for this box.

## What holds the public ports

| Port | Bound to | Owner |
| --- | --- | --- |
| 22 | `0.0.0.0` | host sshd |
| 80 | `0.0.0.0` | `deploy-caddy-1` (caddy:2-alpine) |
| 443 TCP + UDP | `0.0.0.0` | `deploy-caddy-1` — UDP is HTTP/3 |
| 3100 | `0.0.0.0` | `eternalguard-app-1` |
| 3000 | `127.0.0.1` | `zaaka-pi-auction-app-1` |
| 8080 | `127.0.0.1` | `buddhapets-wordpress-1` |

**Caddy is the edge, and it runs in the `deploy` compose project.** It is a
managed proxy with automatic TLS, so Friday's task is a site block plus a
network attachment, not a hand-rolled vhost and a certbot dance. The build
plan allowed for Friday becoming a Saturday job if the proxy was hand-rolled.
It is not. Friday stays a weeknight.

Every application container behind it — `deploy-web-1`, `demo-demo-web-1`,
`deploy-api-1`, `cofifi-wordpress-1` — exposes its port **internally only**.
Caddy reaches them by container name across a shared Docker network. That is
the established pattern on this box and the one to follow.

## The five Postgres instances

| Container | Image | Published? |
| --- | --- | --- |
| `xnith-db-1` | postgres:16-bookworm | no |
| `demo-demo-postgres-1` | postgres:16-alpine | no |
| `eternalguard-db-1` | postgres:16 | no |
| `deploy-postgres-1` | postgres:16-alpine | no |
| `zaaka-pi-auction-db-1` | mysql:8.0 | no |

Plus two MariaDB (`cofifi-db-1`, `buddhapets-mariadb-1`) and three Redis.

Not one database port is published to the host. Each project owns its own
database container on its own private network.

## Two findings that are not mine to fix

**Port 3100 is open to the internet.** `eternalguard-app-1` binds `0.0.0.0`,
so it is reachable directly — no TLS, no Caddy, no fail2ban rules in front of
it, and nothing in the firewall narrowing it. If that app is meant to be
public it belongs behind Caddy like everything else; if it is not, the bind
should be `127.0.0.1`. Either is a one-line change in its compose file.

**`eternalguard-migrate-1` exited three months ago** and was never cleaned up.
Harmless, but it means a `docker compose up` in that project will try to run
migrations again, and nobody has checked what that does in three months.

**No backup service is running.** `cron.service` is up, so there may be a
crontab doing it, but nothing in the service list suggests scheduled dumps.
Worth confirming before Wednesday's task, because Wednesday assumes you are
adding to an existing backup habit rather than starting one.

## Decision 1 — Thursday's database

**Run Touchline's own `postgres:16-alpine` container inside the Touchline
compose project.** Do not add a database to any of the five existing
instances.

Reasons, in order:

1. It is the pattern every other project on this box already follows. A
   deviation would be the odd one out, and the odd one out is what breaks
   when someone else does maintenance.
2. No existing Postgres publishes a port, so reaching one from a new project
   means attaching Touchline to that project's private network — which couples
   Touchline's uptime to that project's compose lifecycle. A `docker compose
   down` in `deploy` would take Touchline's database with it.
3. Independent backup, restore and upgrade. Restoring Touchline cannot
   endanger another project's data if they never shared an instance.

The cost is roughly 30–50 MB of RAM for a sixth Postgres. Against 8.4 GB
available, that is not the constraint. Consolidating five instances into one
is a real improvement someday, but doing it *as part of* adding a new project
means one change that can break four others.

## Decision 2 — Friday's proxy, and the port

**Publish no host port at all.** Touchline's app container exposes 3000
internally and joins Caddy's network; Caddy addresses it as
`touchline-app:3000`.

This matters because **3000 is already taken on the host** by
`zaaka-pi-auction-app-1`. The `.env.example` and `DEPLOY.md` I wrote on
Saturday assumed a free 3000 and a host-installed proxy. Both are now
corrected in this repository. Had that gone to the box unchanged, Friday would
have been spent debugging a port collision.

Caddy site block, to add to the `deploy` project's Caddyfile:

```
touchline.example.com {
    encode zstd gzip
    reverse_proxy touchline-app:3000
}
```

Replace the hostname with the real one. Caddy provisions the certificate on
first request; no certbot, and nothing to renew by hand. Confirm the
Caddyfile's path inside `deploy-caddy-1` before editing — it is likely a bind
mount from the `deploy` project directory, in which case edit it there and
`docker compose exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

The network Caddy is on needs naming before Friday:

```sh
docker inspect deploy-caddy-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Touchline's compose file declares that network as `external: true` and joins
it. That is the one piece of Friday's work this inventory cannot supply.
