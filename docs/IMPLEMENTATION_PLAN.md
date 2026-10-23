# Implementation plan

Goal: turn the original relay-and-DOM prototype into a server-authoritative multiplayer game with a lobby,
rooms (public/private/invite), quick matchmaking, spectating, chat, reconnection, rematch, accounts,
ratings, replays, a rules page, local play (bot and pass-and-play) and a responsive, designed UI.

Read with [`ANALYSIS.md`](ANALYSIS.md) (what existed), [`RULES.md`](RULES.md) (engine spec),
[`../DESIGN.md`](../DESIGN.md) and [`../AGENTS.md`](../AGENTS.md). Execution order and per-step prompts are
in [`CHAIN_PROMPTS.md`](CHAIN_PROMPTS.md).

## 1. Architecture

```
 Browser (React SPA)                          Node process (one service)
 ┌──────────────────────────┐   REST /api   ┌──────────────────────────────────────────┐
 │ pages  ── stores ─ api.ts ├──────────────►│ http.ts  (session, profile, leaderboard,  │
 │   │                       │              │           games, stats)                   │
 │   └─ Board ── engine.ts ◄─┼─ shared/ ───►│ sockets.ts ─ rooms.ts ─ engine.ts         │
 │        (legal-move hints) │  Socket.IO   │     │           │  └ clocks, chat, seats   │
 │ socket.ts ◄──────────────►├──────────────►│     └ matchmaking.ts                      │
 └──────────────────────────┘               │ db.ts (node:sqlite): users, sessions,     │
                                             │        games (+ moves for replays)        │
                                             └──────────────────────────────────────────┘
```

- **Server-authoritative.** The client sends `game:step {from, to}`. The server checks it against
  `legalSteps(state)` from the shared engine, applies it, and broadcasts a full room snapshot. The client
  runs the same engine only to draw hints, so hints and validation can never disagree.
- **Snapshots, not diffs.** Every change broadcasts `room:state` (≈2–4 KB). Simple, self-healing after
  reconnects, impossible to desync. A `lastStep` record rides along for animation and sound.
- **Clocks on the server.** The room stores `gameEndsAt` and `moveEndsAt` (epoch ms) and a timer per
  room; clients render countdowns from those plus a measured server-time offset.
- **Identity without friction.** First visit → `POST /api/guest` creates a persistent guest (random
  unique name, rating 1200) and returns a session token kept in `localStorage`. Players can rename and
  can set a password to sign in on another device. Tokens are stored hashed (SHA-256); passwords with
  scrypt.
- **Persistence.** SQLite through `node:sqlite` (no native build): `users`, `sessions`, `games` (result,
  scores, ratings before/after, settings, and the step list for replays). Live rooms are in memory; a
  restart drops games in progress (noted in REVIEW_NOTES).

## 2. Data model

```sql
users    (id TEXT PK, name TEXT UNIQUE COLLATE NOCASE, password_hash TEXT NULL, rating INT 1200,
          games INT, wins INT, losses INT, draws INT, created_at INT, last_seen_at INT)
sessions (token_hash TEXT PK, user_id TEXT → users, created_at INT, last_used_at INT)
games    (id TEXT PK, room_code TEXT, mode TEXT 'quick'|'custom', rated INT,
          red_id TEXT, blue_id TEXT, red_name TEXT, blue_name TEXT,
          red_rating_before INT, blue_rating_before INT, red_rating_after INT NULL, blue_rating_after INT NULL,
          settings_json TEXT, steps_json TEXT, red_score INT, blue_score INT,
          winner TEXT NULL 'red'|'blue', reason TEXT, started_at INT, ended_at INT)
```

## 3. Room model (in memory)

```ts
Room {
  code: string                    // 6 chars, no look-alikes (e.g. "K7Q2MX")
  visibility: 'public' | 'private'
  mode: 'custom' | 'quick'
  hostId: string
  settings: { gameMinutes: 10|20|30, moveSeconds: 30|60|90, rated: boolean,
              hostSide: 'red'|'blue'|'random', allowSpectators: boolean, maxCapture: boolean }
  seats: { red: Seat | null, blue: Seat | null }    // Seat = user summary + connected flag
  spectators: Map<userId, user summary>
  phase: 'waiting' | 'playing' | 'ended'
  game: GameState | null; clocks; lastStep; drawOfferBy; rematchVotes; chat (last 50)
}
```

- **Public** rooms are listed in the lobby while waiting and on Watch while playing (if spectators are
  allowed). **Private** rooms are reachable only by code or invite link `/room/CODE`.
- Host picks settings while waiting; the game starts when the host presses **Start** with both seats
  filled. Quick-match rooms start immediately.
- A user holds at most one seat in an unfinished room. Trying to take another seat in a different room
  returns `already_seated` with the code, and the UI offers "Return to your game".
- Disconnects: seats are kept; the room shows "Opponent disconnected". On their turn the move clock keeps
  running, so a vanished player loses on time. A waiting room whose host is gone for 60 s closes.
- After a game: **Rematch** (both vote; sides swap; same settings) or leave. Ended rooms with nobody
  connected are swept after 5 minutes.

## 4. Socket protocol (summary — full types in `shared/protocol.ts`)

Client → server (all with an ack `{ ok: true, ... } | { ok: false, error, message }`):

| Event | Payload | Effect |
| --- | --- | --- |
| `lobby:subscribe` / `lobby:unsubscribe` | — | Receive `lobby:state` updates |
| `room:create` | settings + visibility | Create, take the host seat |
| `room:join` | `{ code, as: 'player' \| 'spectator' }` | Take the free seat or watch |
| `room:leave` | — | Leave seat/spectating (forfeits if playing) |
| `room:settings` | partial settings | Host only, while waiting |
| `room:start` | — | Host only, both seats filled |
| `game:step` | `{ from, to }` | One step (a plain move or one jump) |
| `game:resign` / `game:draw-offer` / `game:draw-answer` | — / — / `{ accept }` | |
| `game:rematch` | `{ want }` | Rematch vote |
| `chat:send` | `{ text }` | ≤ 200 chars, rate-limited |
| `queue:join` / `queue:leave` | `{ preset }` | Matchmaking |

Server → client: `lobby:state`, `room:state` (snapshot), `room:closed`, `chat:message`, `queue:state`,
`queue:matched {code}`, `presence {online, playing}`, `error`.

## 5. REST

`POST /api/guest` · `GET /api/me` · `PATCH /api/me {name}` · `POST /api/me/password {password}` ·
`POST /api/login {name,password}` · `POST /api/logout` · `GET /api/leaderboard` ·
`GET /api/players/:id` (profile + recent games + rating history) · `GET /api/games/:id` (replay) ·
`GET /api/stats` · `GET /api/health`.

## 6. Client screens

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | Title screen | Giant-chip motif with a self-playing demo game, game-style menu, "Play from here" (added 2026-10-23, see DESIGN.md §13) |
| `/play` | Lobby | Quick match presets + queue state; create room; join by code; open rooms (count-card filter); live games; recent games; top players |
| `/room/:code` | Room | Waiting room → game → result dialog; players and spectators; chat; share link |
| `/watch` | Watch | Live public games with mini boards |
| `/play/bot`, `/play/local` | Local game | Bot (3 levels, runs in the browser) and pass-and-play; not rated |
| `/player/:id` | Profile | Rating, record, rating history, recent games |
| `/leaderboard` | Leaderboard | Ranked table (≥ 1 rated game) |
| `/game/:id` | Replay | Step through a finished game with its ledger |
| `/learn` | Rules | The rules with live diagrams built from the real board component |
| `/settings` | Settings | Name, password, board theme, piece set, sound, hints, coordinates, motion |

## Status (updated 2026-10-23)

All phases (0–15) are implemented, including the title screen added after the first review.
Verification:

- `npm run check`: typecheck clean, 46 tests pass (21 engine, 5 bot/rating/codec, 20 server
  integration incl. matchmaking), production build passes.
- `npm run e2e`: 4 browser scenarios pass (title screen menu + "Play from here"; private room via invite
  link → captures → chat → resign → rematch; quick match; spectating from Watch).
- Taste-skill gate: app screens lint 0 FAIL / 0 WARN, inspector 0 FAIL on all 11 app screens; title
  screen (page rules) lint 0 / 0, inspector 0 FAIL. Remaining WARNs are defended in `DESIGN.md` §11, §13.
- Decisions to review: `docs/REVIEW_NOTES.md`.

## 7. Phases (each is one chain prompt)

| # | Phase | Output | Done when |
| --- | --- | --- | --- |
| 0 | Planning | AGENTS.md, DESIGN.md, docs/* | Docs exist and agree |
| 1 | Scaffold | package.json, tsconfig, Vite + Tailwind, folder layout, assets moved/optimised, legacy removed | `npm run typecheck` and `npm run build` pass on an empty shell |
| 2 | Engine | `shared/engine.ts` + tests | All rules in RULES.md covered by tests |
| 3 | Bot + shared utils | `shared/bot.ts`, `rating.ts`, `codec.ts`, `presets.ts`, `protocol.ts` + tests | Bot always returns a legal step; tests pass |
| 4 | Server foundation | db, auth, REST + tests | Guest → rename → password → login works in tests |
| 5 | Rooms and games | rooms, sockets, clocks, chat, spectators, rematch, reconnection, persistence, ratings + tests | Two socket clients can play a full game to a recorded result |
| 6 | Matchmaking | queue + tests | Two queued clients are paired into a started room |
| 7 | Client foundation | tokens, shell, router, session bootstrap, socket store, UI kit | App boots, guest created, socket connects |
| 8 | Board | Board, chips (flat + classic), themes, click/drag/keyboard, animation, sound | Board plays a local game correctly |
| 9 | Room screen | waiting room, game rail, clocks, ledger, chat, actions, result | Two browsers can play through the UI |
| 10 | Lobby | quick match, create/join, lists, counts | All room flows reachable from the lobby |
| 11 | Local play | bot and pass-and-play | A full bot game ends with a result |
| 12 | Secondary screens | watch, profile, leaderboard, replay, learn, settings | Each screen renders real data and empty states |
| 13 | Responsive, a11y, design gate | phone/tablet layouts, keyboard board, taste lint + inspect, fixes | 0 FAIL at 1440/768/390 |
| 14 | E2E, docs, wrap-up | e2e test, README, deploy notes, REVIEW_NOTES | `npm run check` and `npm run e2e` pass |
| 15 | Title screen | `/` title with attract mode; lobby moved to `/play` | Page-mode inspector 0 FAIL; title E2E passes |
