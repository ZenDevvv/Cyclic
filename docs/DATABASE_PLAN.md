# Persistent database plan (parked)

**Status:** parked on 2026-11-07, not started. Nothing here is implemented.
**Decision so far:** move to Neon's free Postgres when this is picked up. This is a demo project, so
everything has to stay free.
**Order:** do this after `GRADES_PLAN.md`. Scores will then be decimals or very large numbers, and `games` gains
a `grade` column, so use `DOUBLE PRECISION` for scores, not `INTEGER`. Migration 2 in `server/db.ts` made the same
change in SQLite; `GRADES_PLAN.md` Phase 5 says why.

## The problem

The server stores everything in a SQLite file. Unless `DATABASE_PATH` points at a persistent disk, that file
sits in `data/` inside the app folder, and Render wipes it on every deploy and restart. Render's free tier
has no disks, so accounts, ratings and game history do not survive there. No render.yaml exists, so the real
service settings live only in the Render dashboard; check them before starting.

## The plan: Render free + Neon free

Keep the web service on Render's free tier and move the data to Neon's free Postgres. Data then survives
deploys, restarts and Render's idle sleep, because it no longer lives on Render's disk.

Free-tier terms checked on 2026-11-07. They change, so check them again before signing up.

| Option | Free tier | Verdict |
| --- | --- | --- |
| Neon | 1 GB storage and 100 compute hours a month per project; going over never deletes data | Use this |
| Render Postgres | Expires 30 days after creation, 14-day grace period, then deleted | Unusable for free |
| Supabase | Reported to pause after a week of inactivity, may need manual reactivation | Poor fit |

## Work needed

`server/db.ts` is not the only file that changes, despite what its header comment and `REVIEW_NOTES.md`
item 22 suggest. `node:sqlite` is synchronous and a hosted database is not.

1. **Async conversion.** Every repo method becomes async, along with about 20 call sites in `http.ts`,
   `auth.ts`, `sockets.ts` and `rooms.ts`. That includes the auth middleware in `http.ts` and `sockets.ts`.
2. **End of game (the risky part).** `finish()` in `server/rooms.ts` reads ratings, saves and broadcasts in
   one uninterrupted step. Once async, the rating read and write must share a transaction, and a slow or
   failed save must not stop players seeing the result. Shutdown must wait for saves still in flight.
3. **Postgres schema.** A new migration list, keeping the append-only rule from then on:
   - Timestamps must be `BIGINT`: `Date.now()` overflows a Postgres `INTEGER`.
   - `COLLATE NOCASE` needs a replacement, such as a unique index on `lower(name)`.
   - `PRAGMA user_version` needs a schema version table.
4. **Config.** Add `DATABASE_URL` to `server/config.ts` and `.env.example`. Add the `pg` package, following
   the dependency rules in `AGENTS.md`.
5. **Connections.** Close idle connections so Neon can scale to zero; otherwise the app burns compute hours
   while nobody is playing.
6. **Tests.** `npm test` creates its own SQLite files today, so it needs a Postgres database to run against.

Existing data does not need migrating. The live leaderboard was empty on 2026-11-07, and any guest accounts
reset once.

## Owner's steps

1. Create a free Neon project.
2. Add its connection string to the Render service as `DATABASE_URL`.

## What stays limited on free tiers

- **Slow first visit.** Render sleeps when idle, and Neon adds up to a few seconds on the first query.
- **Games in progress.** These live in memory, so a sleep or restart still loses them. Only finished games
  are saved.
- **Neon's limits.** Going over the compute limit pauses the database until the next monthly window, so
  logins and saves fail until then. Going over storage makes writes that add data fail.

## Sources

- Render free tier: <https://render.com/docs/free>
- Neon free plan limits: <https://neon.com/faqs/free-plan-limits-and-quotas>
- Supabase free tier (third-party guide): <https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/>
