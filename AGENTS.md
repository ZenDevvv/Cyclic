# AGENTS.md — rules for agents working in this repo

Scidama Online: a real-time, two-player math-checkers game (Damath variant with ₱/kWh units). Read this
file first, then [`DESIGN.md`](DESIGN.md) before any UI work and [`docs/RULES.md`](docs/RULES.md) before
any game-logic work.

## Stack

| Layer | Tech |
| --- | --- |
| Runtime | Node ≥ 22.18 (dev machine: 26). Node runs `.ts` directly by stripping types — no server build. |
| Server | Express 5, Socket.IO 4.8, `node:sqlite` (built in), zod for payload validation |
| Client | React 19, Vite 8, Tailwind CSS 4, React Router 7, zustand 5, Inter (self-hosted) |
| Shared | `shared/` — pure TypeScript used by both sides: engine, bot, protocol types, presets, rating |
| Tests | `node:test` (unit + socket integration), `playwright-core` + system Chromium (E2E) |

## Commands

```bash
npm install
npm run dev         # server on :5500 (watch) + Vite on :5173 with proxy → open http://localhost:5173
npm run build       # client → client/dist
npm start           # production: one process serves client/dist + API + sockets on $PORT (5500)
npm test            # unit + integration tests (shared/, server/)
npm run typecheck   # tsc --noEmit over everything
npm run e2e         # needs `npm run build` first. Two browsers play through the UI.
npm run seed        # with `npm run dev` running: demo players, games and rooms (local only)
npm run check       # typecheck + test + build — run before you say you're done
```

## Layout

```
shared/   engine.ts (rules), bot.ts, protocol.ts (socket/REST types), presets.ts, rating.ts, codec.ts
server/   index.ts (entry) → app.ts (createServer), db.ts, auth.ts, http.ts, rooms.ts, matchmaking.ts, sockets.ts
client/   index.html, public/ (sfx, classic piece art), src/{pages,components,lib,store,styles}
e2e/      browser end-to-end test (screenshots land in e2e/artifacts/, git-ignored)
scripts/  seed-demo.ts — local demo data
docs/     RULES, ANALYSIS, IMPLEMENTATION_PLAN, CHAIN_PROMPTS, REVIEW_NOTES
```

## Hard rules

1. **The server is authoritative.** Clients send intents (`game:step {from,to}`), the server validates
   with the shared engine, applies, and broadcasts state. Never trust a client for moves, scores, clocks
   or results.
2. **One rules engine.** Game rules live only in `shared/engine.ts`. Do not re-implement move generation
   or scoring anywhere else. A rule change updates `docs/RULES.md`, the engine and its tests together.
3. **Erasable TypeScript only** (Node strips types at runtime): no `enum`, `namespace`, parameter
   properties or decorators. Use `import type` for types and include the `.ts`/`.tsx` extension in every
   relative import. `tsconfig.json` enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`.
4. **Validate every inbound payload** (socket and REST) with the zod schemas in `server/`. Unknown or
   invalid input gets an error ack, never a crash.
5. **Protocol lives in `shared/protocol.ts`.** Add or change an event there first; both sides import it.
6. **Database migrations are append-only** (`server/db.ts` → `MIGRATIONS`). Never edit a migration that
   has shipped; add a new one.
7. **Design rules are in `DESIGN.md`** — tokens only, no raw hex in components, no banned devices. Run the
   taste-skill linter on UI changes (command in DESIGN.md §12).
8. **Tests.** Engine changes need engine tests; server flow changes need an integration test in
   `server/*.test.ts`. `npm run check` must pass before reporting a task complete.
9. **Dependencies:** pin exact versions, choose releases at least two weeks old, avoid packages with
   install scripts, and justify every new dependency in the PR/commit message.
10. **Supply-chain hygiene** (this machine had a malware incident that hid code after long runs of
    whitespace in config files): keep config files short and readable, never commit generated or minified
    code into source folders, and look at any diff to `*.config.*`, `package.json` and `.gitignore` line
    by line.
11. **Secrets:** none in the repo. Configuration comes from env vars (`.env.example` lists them).
12. **Decisions you make on the owner's behalf** go into `docs/REVIEW_NOTES.md` with the reason and how to
    reverse them.

## Conventions

- Server modules export plain functions and small classes without parameter properties. State that must
  survive a restart goes in SQLite; live room state is in memory.
- Client state: `store/` (zustand). Socket events are subscribed in one place (`lib/socket.ts`) and written
  into stores; components read stores.
- Files: `PascalCase.tsx` for React components, `camelCase.ts` for everything else; tests sit next to
  their module as `name.test.ts`.
- Copy follows DESIGN.md §9 (sentence case, words of the trade, no emoji in chrome).
- Accessibility: every control reachable by keyboard, visible focus, contrast ≥ 4.5:1, board squares are
  buttons with names.
