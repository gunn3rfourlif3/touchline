# Touchline

A South African sports fan platform: weekly predictions as the habit, a
provenance-led auction marketplace as the business. Built solo, nights and
weekends.

Stage 1 is the predictions pilot. Everything else is scaffolding that exists
only where it could not be added later.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16, App Router, TypeScript strict |
| Database | PostgreSQL + Drizzle |
| Auth | Auth.js v5, phone OTP, no wallet |
| Hosting | Existing VPS, behind the reverse proxy already there |

**Next 16, not 15.** The plan said 15. On a fresh install, 15.5.x carries
unpatched postcss advisories through its own dependencies, fixable only by
moving to 16. A greenfield project started today should not inherit those on
day one. 16.4.6 audits clean.

## Running it

```sh
cp .env.example .env.local        # fill in AUTH_SECRET and OTP_PEPPER
npm install
npx drizzle-kit migrate
npm run dev
```

With `SMS_PROVIDER` unset, OTP codes are written to the server log instead of
being sent. That is the intended development path; it is also why the app
refuses to start in production without it.

## Verifying it

```sh
npx tsc --noEmit                          # typecheck
DATABASE_URL=... OTP_PEPPER=... npx tsx scripts/verify-otp.ts
```

`verify-otp.ts` runs 17 checks against a real database: phone normalisation
across the four formats South Africans actually type, replay rejection, the
attempt cap, expiry, send rate limiting, and that no plaintext code is
recoverable from what is stored.

## Layout

```
src/
  auth.ts              Auth.js config, phone OTP provider
  db/
    schema.ts          All 12 tables, with the reasoning in comments
    index.ts           Pooled client, reload-safe in development
  lib/
    phone.ts           E.164 normalisation for SA mobile numbers
    otp.ts             Issue and verify, hashed and rate limited
scripts/
  verify-otp.ts        Integration checks against a live database
docs/
  DEPLOY.md            Putting this on a VPS that already runs other things
drizzle/
  0000_initial.sql     Generated migration
```

## Decisions worth knowing

**Snapshot tables are written from day one.** `bid_snapshots`, `price_history`
and `feed_fetches` have no readers yet. They exist because line movement and
sale-price history cannot be reconstructed after the fact, and the auction is
nine weeks away.

**Phone is the only identity.** No wallet, no address, no email requirement.
Numbers normalise to E.164 on the way in, so `0821234567` and
`+27 82 123 4567` are one account rather than two.

**OTP codes are stored hashed with a pepper from the environment.** A database
leak does not hand over live codes, and rotating `OTP_PEPPER` invalidates every
outstanding one.

**Users soft-delete.** POPIA requires deletion on request; league standings
require the row to keep existing. The row is scrubbed and marked, not removed,
and a returning user reclaims the same account rather than creating a second.

**The round locks once, at the earliest kickoff** — not per fixture. One lock
time is explainable in a WhatsApp group; per-fixture locking is not.

## Not built, deliberately

Chat, video, fantasy squads, football, retail stock, real-money betting, native
apps. Each is defensible later and fatal now.
