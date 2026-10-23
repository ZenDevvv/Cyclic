# Analysis of the original Cyclic build

Snapshot of the repository at commit `494c197` ("Update README.md"), before the rewrite.

## What it is

**Scidama Online**: a two-player, real-time, browser version of Scidama, a science-flavoured Damath
(Filipino math checkers). Each chip is a quantity in pesos (P2–P12) or kilowatt-hours (1–11 kWh); captures
are scored by the operator printed on the landing square, and only dimensionally valid arithmetic scores.
Full rules: [`RULES.md`](RULES.md).

## How it was built

| Part | Implementation |
| --- | --- |
| Server | `main.js`: Express static server + Socket.IO 4.7 relay. Rooms in a `Map` keyed by a user-typed room ID; 2 seats. |
| Client | `src/index.html`, `src/app.js` (~1,500 lines of DOM-as-state), `src/pieces.js` (24 HTML strings), `src/styles.css`. |
| Assets | 24 chip PNGs at 1080×1096 (~1 MB each, ~24 MB total for 70 px pieces), 2 crown PNGs, 4 operator PNGs, SFX mp3s (duplicated in `red_chip/`). |
| State | The DOM. Each client moves pieces locally and emits `move-piece`, `remove-piece`, `make-king`, `update-score`, `append-history`, `change-player`, `win-condition`; the server forwards them to the other socket. |
| Flow | Type name + room ID → Create (red, moves first) or Join (blue). The game starts when the second player joins. |

## Defects found

Correctness and fairness:

1. **Client-authoritative.** The server relays whatever a client sends. Any player can move any piece,
   award themselves points or declare a win from the console. Desyncs are silent.
2. **End-of-game bonus counted twice.** Both clients handle `win-condition`, and each emits `update-score`
   and the history lines for the remaining chips.
3. **Winner inverted.** `showWin()` announces "RED WINS" when `redScore < blueScore`.
4. **Race at the end.** `showWin()` runs on a 1 s timeout after emitting the score update, so it can read a
   stale score.
5. **Session clock never ends the game.** At 0 it calls `alert()` every second forever. Each client runs
   its own unsynchronised clock started at join time.
6. **Move clock reloads the page.** When the 60 s move timer hits 0 the client alerts and reloads, which
   drops that player and leaves the opponent stranded. No result is recorded.
7. **Touch path diverges from mouse path.** `touchStart` duplicates the move logic with differences: for a
   dama it emits `change-player` once per capture-map entry, and its win check only alerts locally.
8. **Coordinates differ per player.** `getRowCol` uses a different frame for blue, so the two move
   histories disagree.
9. **Implicit globals** (`chips`, `result`, `elementId`, `gameFinished`).

Product gaps:

10. No lobby: rooms are invisible; you must know the exact ID. Anyone who guesses an ID can join. No
    private rooms, no matchmaking, no spectators.
11. Disconnect or refresh ends the game for both (`alert` + reload); no reconnection.
12. Win/lose modals exist in HTML but are never shown; their image and "Exit" link point to files that do
    not exist. No rematch, resign or draw.
13. No identity, ratings, history, replays or leaderboard.
14. Not responsive (fixed 70 px squares, 560 px board). The README says so.
15. ~24 MB of chip images; Socket.IO client loaded from a CDN at a different version than the server.
16. CORS origin hard-coded to `https://dashboard.render.com` (harmless for same-origin, but misleading).

## What is kept

- The rules as implemented (board, operator layout, chip set, unit-aware scoring, flying dama,
  backward captures, mandatory capture, immediate removal, ₱3/kWh) — now in one tested engine.
- The 20-minute game clock and 60-second move clock as the default time control.
- The original chip artwork, downscaled, as the "Classic" piece set.
- The original sound effects.
- Red and blue as the two sides; red moves first.
