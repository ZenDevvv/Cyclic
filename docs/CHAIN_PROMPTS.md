# Chain prompts

Run these in order, one per agent turn (or one per session). Each prompt is self-contained: it says what
to read, what to build, and how to prove it works. Every prompt ends with the same gate: run the listed
checks, fix failures, and append any decision made on the owner's behalf to `docs/REVIEW_NOTES.md`.

Common preamble for every prompt:

> You are working in the Scidama repo. Read `AGENTS.md` first. Follow its hard rules (server-authoritative,
> one engine, erasable TS with `.ts` import extensions, zod validation, pinned deps ≥ 2 weeks old). For UI,
> follow `DESIGN.md`. Do not stop to ask questions: take the recommended option, note it in
> `docs/REVIEW_NOTES.md`, and continue.

---

## Prompt 1 — Scaffold

Read `docs/IMPLEMENTATION_PLAN.md` §1 and §7. Replace the legacy layout (`main.js`, `src/`) with the new
one:

- `package.json` (name `scidama`, `"type": "module"`, `engines.node >= 22.18`), exact pinned deps from the
  plan, scripts `dev`, `build`, `start`, `test`, `typecheck`, `e2e`, `check`.
- `tsconfig.json`: strict, `moduleResolution: bundler`, `allowImportingTsExtensions`, `noEmit`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, `jsx: react-jsx`; includes `shared`, `server`,
  `client/src`, `e2e`.
- `vite.config.ts` (root `client/`, outDir `client/dist`, React + Tailwind plugins, dev proxy for `/api`
  and `/socket.io` to :5500).
- Move SFX to `client/public/sfx/`; convert the 24 chip PNGs to 160 px WebP in
  `client/public/pieces/classic/` (named `red-p2.webp`, `blue-kwh11.webp`, …); drop duplicates, the
  operator PNGs and crowns (drawn in SVG now). Delete `main.js` and `src/` (they stay in git history).
- `.gitignore` (node_modules, client/dist, data/, .taste-skill/, *.db), `.env.example` (`PORT`,
  `DATABASE_PATH`, `CORS_ORIGIN`, `NODE_ENV`).
- Minimal `client/index.html`, `client/src/main.tsx` rendering "Scidama", `server/index.ts` serving it.

Check: `npm install && npm run typecheck && npm run build && node server/index.ts` serves the page.

## Prompt 2 — Rules engine

Read `docs/RULES.md` completely. Implement `shared/engine.ts` as pure functions over immutable state:
types (`Side`, `Unit`, `Op`, `Piece`, `GameState`, `Step`, `StepRecord`, `Equation`, `GameResult`),
`OPERATORS`, `initialState(rules)`, `legalSteps(state)`, `applyStep(state, step)`
(returns `{ state, record }`; handles capture removal, scoring, continuation, crowning, turn switch,
blocked/elimination end), `scoreCapture(attacker, captured, op)`, `endGame(state, reason, winner?)`
(remaining-chip tally, result), `remainingTally(state)`, and coordinate helpers. Include the optional
`maxCapture` rule.

Write `shared/engine.test.ts` with `node:test` covering: initial layout and operators; plain moves for
both sides; mandatory capture; backward capture; multi-capture continuation and the jumper lock; flying
dama moves and captures (landing anywhere beyond, blocked by two in a row); crowning only at sequence end;
every row of the scoring table, both dama multipliers, ×3 kWh; elimination, blocked and timeout endings;
remaining tally; maxCapture filtering; a random-playout fuzz test (500 games) asserting invariants (piece
counts never rise, scores never fall, every game terminates).

Check: `npm test`.

## Prompt 3 — Bot and shared utilities

- `shared/bot.ts`: `chooseStep(state, level: 'easy'|'medium'|'hard', rng?)`. Search over whole turns
  (sequences of steps by the same side), alpha-beta, evaluation = score difference + material (kWh worth
  ×3) + dama bonus + advancement. Easy = shallow with noise, hard = depth 4–5 with a time cap.
- `shared/rating.ts`: Elo (K 32 under 30 games, else 20), returns new ratings for win/loss/draw.
- `shared/codec.ts`: compact board string for thumbnails (32 chars, one per playable square).
- `shared/presets.ts`: time-control presets (`blitz` 10 min / 30 s, `standard` 20 min / 60 s, `long`
  30 min / 90 s) and room defaults.
- `shared/protocol.ts`: every socket event name, payload and snapshot type from the plan §4–5.

Tests for bot legality (100 random positions × levels), rating maths and codec round-trip.

## Prompt 4 — Server foundation

`server/config.ts` (env), `server/db.ts` (`node:sqlite`, WAL, append-only `MIGRATIONS`, repository
functions), `server/names.ts` (guest name generator), `server/auth.ts` (token create/verify with SHA-256
hash, scrypt passwords, name validation 3–20 chars `[A-Za-z0-9 _-]`), `server/http.ts` (REST routes in
the plan §5, zod-validated, JSON errors), `server/app.ts` (`createServer({ dbPath, port })` returning
`{ httpServer, io, close }` for tests), `server/index.ts` (entry). Serve `client/dist` with SPA fallback in
production. Tests: guest → me → rename (conflict 409) → set password → login elsewhere → logout.

## Prompt 5 — Rooms, games, spectators, chat, reconnection

`server/rooms.ts` (RoomManager per plan §3), `server/sockets.ts` (auth middleware from the handshake
token, event handlers with zod + per-socket rate limit). Implement: create (public/private), join as
player or spectator, leave, host settings, start, steps validated by the engine, server clocks
(game + move) with timeouts, resign, draw offer/answer, rematch with side swap, chat (last 50, 200
chars, 1 msg / 700 ms), presence counts, lobby broadcast (throttled), reconnection (seat re-attached on
connect), one-seat-per-user rule, sweeping of empty rooms. On game end: persist to `games`, update
ratings and records for rated games.

Tests with `socket.io-client`: create/join/start; illegal step rejected; a scripted full game to a
result; spectator receives state but cannot move; private room absent from lobby; reconnection keeps the
seat; move timeout ends the game; rematch swaps sides; chat broadcast and rate limit; result persisted
and ratings changed.

## Prompt 6 — Matchmaking

`server/matchmaking.ts`: one queue per preset, pair by closest rating with a window that widens 100 every
5 s, never pair a user with themself, leave queue on disconnect or when seated elsewhere. Matched pairs get
a public, rated, quick room that starts at once. Emit `queue:state` (position, waited seconds, players in
queue) and `queue:matched`. Tests: two clients queue → matched → room playing; cancel leaves the queue.

## Prompt 7 — Client foundation

Read `DESIGN.md` fully. Build `client/src/styles/tokens.css` + `app.css` (Tailwind `@theme` mapping
tokens), self-hosted Inter, the shell (48 px top bar, centred column, phone menu sheet), router with every
route from the plan §6 (placeholders allowed), `lib/session.ts` (token storage, guest bootstrap),
`lib/api.ts`, `lib/socket.ts` (single socket, auth token, server-time offset, event → store wiring),
stores (`session`, `lobby`, `room`, `prefs` persisted to localStorage), and UI primitives (Button,
IconButton, Dialog, Sheet, Tabs, Segmented, Switch, Input, Pill, Toast, Skeleton). No banned devices.

## Prompt 8 — Board

`components/board/Board.tsx` and friends: an 8×8 grid of square buttons with operator glyphs (SVG),
absolutely positioned chips keyed by piece id so moves animate with CSS transforms, flat SVG chip and
classic WebP chip, dama crown, three board themes, coordinates, flip, marks (last move, selected, legal
dots, must-capture rings, illegal shake), click-to-move + pointer drag + keyboard focus/arrows/Enter/Esc,
`onStep(step)` callback, read-only mode for thumbnails/replays/rules. `lib/sound.ts` maps step records to
the original SFX with volume/mute from prefs. Verify by playing a local hot-seat game.

## Prompt 9 — Room screen

`pages/Room.tsx`: waiting room (seats, settings editable by host, invite link + code copy, start,
spectator list), game layout (board + rail: opponent strip & clock, tabs Ledger | Chat, your strip &
clock, actions: resign with confirm, offer/answer draw, flip), the capture ledger (equations with units,
amber points), result dialog (winner, reason, both tallies, rating change, rematch, back to lobby),
disconnected/reconnecting banners, spectator mode. Phone layout per DESIGN.md §4.

## Prompt 10 — Lobby

`pages/Lobby.tsx`: quick match presets (one click to queue; queue state with elapsed time and cancel),
"Create room" dialog (visibility, time control, side, rated, spectators, max-capture), "Join with code",
open public rooms list with count-card filter (Open, Live, All), live games preview, your recent games,
top 5 players, presence counts. Every list has empty/loading/error states.

## Prompt 11 — Local play

`pages/LocalGame.tsx` for `/play/bot` (pick level and side; bot runs in a Web Worker or idle callback so
the UI never blocks) and `/play/local` (pass-and-play with optional auto-flip). Same rail, ledger and
result dialog as online games; clocks optional.

## Prompt 12 — Secondary screens

Watch (live boards via codec thumbnails, click to spectate), Profile (rating, record, rating-history
chart, recent games), Leaderboard (table), Replay (step slider, keyboard arrows, ledger synced), Learn
(rules from `docs/RULES.md` with live read-only boards demonstrating each rule), Settings (two-column
layout; previews beside controls).

## Prompt 13 — Responsive, accessibility, design gate

Check 1440, 1024, 768, 390 widths for every route. Keyboard-only pass through lobby → room → game.
Run the taste-skill lint (`--app`) and inspector on Lobby, Room (local game), Watch, Profile, Leaderboard,
Learn, Settings. Fix every FAIL, defend or fix every WARN, critique screenshots, fix the top three
problems, repeat (max three rounds).

## Prompt 14 — E2E, docs, wrap-up

`e2e/play.e2e.ts` with `playwright-core` + system Chromium: start the server on a temp DB and port, open
two browser contexts, create a private room, join by invite link, start, play several moves including a
capture, resign, assert the result dialog in both. Rewrite `README.md` (what, how to run, how to deploy,
architecture link). Finalise `docs/REVIEW_NOTES.md`. Run `npm run check` and `npm run e2e`.

## Prompt 15 — Title screen (added after review)

The owner found the lobby too busy as a home page. Make `/` a game title screen and move the lobby to
`/play` (update every link that meant "the lobby"). Treat it as a **page** for the taste-skill: inventory
the subject, deal a direction with `draw.mjs --sector consumer-app --keep palette,type --have
illustration`, write the idea sentence, and build one live thing from the game itself. Keep it focused:
title, a game-style menu (arrow keys + Enter), and the art. Reuse the original chip artwork from git
history. Check with `lint.mjs` and `inspect.mjs` (page mode) to 0 FAIL, look at 1440/768/390, verify every
interaction in a browser, and add an E2E test.
