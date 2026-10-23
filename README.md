# Scidama Online (Cyclic)

Real-time, two-player **math checkers with units**. Scidama is a science variant of Damath, the Filipino
math checkers: every chip is a quantity in pesos (₱2–₱12) or kilowatt-hours (1–11 kWh), every playable
square carries + − × ÷, and a capture scores only when the arithmetic still makes a quantity:
`₱8 + ₱4 = ₱12` scores, `₱8 × ₱4` and `₱8 + 3 kWh` don't. Full rules: [`docs/RULES.md`](docs/RULES.md).

## Features

- **A title screen that plays itself**: a giant chip (the original art's notched chip) whose face shows a
  bot-vs-bot demo game, captures popping up as sums; a game-style menu (arrow keys + Enter); and
  "Play from here" to take over the demo position against the bot.

- **Play online**: quick match by rating (Blitz / Standard / Long), or rooms you create — invite-only with a
  link and 6-character code, or listed in the lobby. Host picks the clocks, sides, rated or casual,
  spectators, and the tournament "take the most chips" rule.
- **Server-authoritative games** with a shared, tested rules engine; server clocks (game clock + move
  clock); resign, draw offers, rematch with side swap; reconnect within 90 s after a dropped connection
  or a reload.
- **Spectating** live public games, with room chat for players and watchers.
- **The capture ledger**: the move list written as the equations each capture scored, plus score previews
  on the landing squares before you commit.
- **Accounts without friction**: a persistent guest on first visit; set a password to sign in elsewhere.
  Elo ratings, profiles with rating history, a leaderboard, and replays of every finished game.
- **Offline practice**: a bot with three levels (runs in a Web Worker) and pass-and-play on one screen.
- **Learn page** with live boards that run the real engine.
- Responsive from phones to desktops, keyboard-playable board, original sound effects and chip art.

## Run it

Requires **Node ≥ 22.18** (Node runs the server's TypeScript directly and provides the built-in SQLite).

```bash
npm install
npm run dev          # server on :5500 + Vite dev server (it prints the URL, usually :5173)
```

Production:

```bash
npm run build        # client → client/dist
NODE_ENV=production npm start      # serves client + API + sockets on $PORT (default 5500)
```

Other scripts: `npm test` (engine, bot and server integration tests), `npm run typecheck`,
`npm run e2e` (two real browsers play through the UI; needs a build and Chromium at
`CHROMIUM_PATH`, default `/usr/bin/chromium`), `npm run check` (typecheck + tests + build), and
`npm run seed` (with `npm run dev` running: demo players, finished games, live games and open rooms).

Configuration is by environment variable — see [`.env.example`](.env.example) (`PORT`, `DATABASE_PATH`,
`CORS_ORIGIN`, `NODE_ENV`, `TRUST_PROXY`). Node can load a file directly:
`node --env-file=.env server/index.ts`.

## Deploy (Render or similar)

Live: <https://scidama.onrender.com> (Render). Pushing to `main` redeploys it.

- Recommended settings: build `npm install --include=dev && npm run build`, start `npm start`,
  `NODE_ENV=production`. Node comes from `.node-version` (24).
- A service still set up for the original app also works: with build `npm install` and start `npm start`
  or `node main.js`, the first boot builds the client (`scripts/ensure-build.ts`) before starting.
- Attach a **persistent disk** and point `DATABASE_PATH` at it (e.g. `/var/data/scidama.db`); without
  one, accounts and history reset on every deploy and every restart. Render's free tier has no disks and
  sleeps when idle (games in progress end when it does).
- One instance only: live rooms are kept in memory (see `docs/REVIEW_NOTES.md`).

## How it's built

| Part | Where |
| --- | --- |
| Rules engine (moves, captures, scoring, endings) | `shared/engine.ts` — the only copy of the rules |
| Bot, Elo, board codec, presets, socket/REST types | `shared/` |
| Express + Socket.IO server, rooms, clocks, matchmaking | `server/` |
| SQLite (Node's `node:sqlite`) | `server/db.ts` |
| React 19 + Vite + Tailwind 4 client | `client/` |

Read these before changing things: [`AGENTS.md`](AGENTS.md) (rules for contributors and coding agents),
[`DESIGN.md`](DESIGN.md) (design system), [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md),
[`docs/ANALYSIS.md`](docs/ANALYSIS.md) (the original build and what was fixed), and
[`docs/REVIEW_NOTES.md`](docs/REVIEW_NOTES.md) (decisions waiting for the owner's review).

## Credits

Original Scidama Online / Cyclic by ZenDevvv — game rules, chip artwork and sound effects come from that
build. MIT licensed.
