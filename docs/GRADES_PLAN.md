# All-grades implementation plan

**Status:** Phases 1 to 6 built on 2026-11-07; Phases 7–8 not started. **Goal:** play Scidama as Grade 7, 8, 9 or 10, each with its own
chips, scoring and board theme, in rooms, quick match, bot games, local games and replays.

The research behind this plan is in [`SCIDAMA_VERSIONS.md`](SCIDAMA_VERSIONS.md). The sources leave gaps, so
some rules below are our own calls; section 2 lists them.

## 1. Decisions already made

- **One board for every grade.** All grades keep the operator layout in `RULES.md`. The sources caption a
  separate board for THI that we could not see, so Grade 9 may differ from the printed game. Reverse this by
  adding a per-grade operator table to `OPERATORS` in `shared/engine.ts`.
- **A different theme for each grade** (section 5).
- **Neon comes after this plan** (section 7).
- **kWh rate:** ₱5 for now, as one value in the `GRADES` table. The rate depends on the game maker, so a room
  setting for it comes later (section 8).
- **Forced capture is on by default,** and the game makes a forced capture clear with auto-capture and a message
  (Phase 1). The host can turn auto-capture off with a room setting.

## 2. Rule calls

Calls 2, 3 and 14 are settled. The rest are the defaults we will build unless the owner changes them. Each goes
into `RULES.md` when built, and into `REVIEW_NOTES.md` with its reason.

| # | Question | Default | Why |
| --- | --- | --- | --- |
| 1 | Who wins? | Lower total, all grades | Every Sci-Dama source says so |
| 2 | kWh rate | ₱5, charged once at the end | Owner's decision; matches the sample sheet |
| 3 | Must take the most chips, dama priority | On by default; rooms can turn it off | Owner's decision; the sources require both |
| 4 | Touch move | Not used | It makes no sense with click and drag |
| 5 | Late move | Keep "loses on time" | Open question 2 in `REVIEW_NOTES.md` |
| 6 | Grade 8 scoring | All four operators score; negative is NS | No source; there are no units to mismatch |
| 7 | Grade 8 division and rounding | Full precision, rounded for display only | Keeps the engine exact and identical everywhere |
| 8 | Grade 9 on `×` and `÷` squares | NS | The one board has them; THI examples use only `+` and `−` |
| 9 | Grade 9 mixed % and °F | NS | Matches the different-units rule |
| 10 | Grade 9 remaining % chips | Look up each chip alone | Summed chips can pass 100 %, beyond the table |
| 11 | Grade 9 dama multiplier | Applied after the table lookup | No source; the score sheet is in °F |
| 12 | Grade 9 and 10 starting squares | Same squares as Grades 7 and 8, ascending by value | Layouts are image-only (see below) |
| 13 | Grade 10 same-unit `×` and `÷` | NS | Follows Electro's rule |
| 14 | Grade 10 final score | (total g × total °C) + total g·°C, in calories | Stated by the Thermo guide; the sample adds up |
| 15 | Ratings | One rating across grades | Fewer players per ladder in a demo |
| 16 | Quick match | One queue per preset and grade | Mixed grades in one game cannot work |
| 17 | Repetitive moves | Not detected; the game clock ends the game | Rooms with no clock could run on, so revisit if it happens |

For call 12, the first unit takes the Grade 7 kWh squares and the second the ₱ squares, smallest value first.

## 3. Consequences to expect

- **Lower score wins changes how the game plays.** Capturing raises your own score, and chips left on the board
  count against you, so NS captures become good moves and a dama becomes a liability. The blog names
  "Perdigana", the give-away form of dama, as the game's ancestor, so this looks intended.
- **A side can lose every chip and still win.** The engine already allows this; only the copy changes.
- **Finished Grade 7 replays may show different totals.** Old rows keep their saved winner. Live data resets on
  each deploy until Neon, so nothing needs migrating.

## 4. Phases

Each phase ends with `npm run check` passing and can ship alone.

### Phase 1: correct Grade 7 (medium) — built

Fix what the sources say is wrong while only one grade exists, so later phases start from the right rules.

- `shared/engine.ts`: lower total wins in `endGame`. Turn `maxCapture` on by default and extend `keepLongest`:
  most chips first, then a dama over a chip when the count is equal. Set the rate to ₱5.
- **Auto-capture.** Capturing is already mandatory in every room; the room setting only controls "most chips".
  Add `forcedStep(state)` to the engine: it returns the step when exactly one legal step exists and it is a
  capture. Because only one move is legal, auto-playing it takes no decision from the player.
  - `server/rooms.ts` plays it after a short pause (about 800 ms) so the move can be seen, and cancels the timer
    if the game ends. `LocalGame.tsx` does the same. Each jump of a chain is checked on its own.
  - With two or more captures available, the player still chooses, and the message says so.
  - Saved games do not change: a forced step can be worked out again from the position.
  - `autoCapture` is a room setting, on by default, that only the host can change. Offline it is a preference.
  - An auto-capture does not decline a draw offer, and the board locks during the pause.
  - Take back skips auto-captures, because undoing one would only make it play again.
- **Forced-capture message.** Today only the amber ring shows this, and Settings can turn the ring off, so the
  message always shows. It sits in the game rail in an `aria-live` region.
  - One option: "Auto-capture: your ₱8 must take ₱4.", or "Forced capture: ..." with the setting off.
  - Several options: "You must capture. Choose your capture."
  - The priority rules narrowed the options: "You must capture. The most chips come first, then a dama."
  - After an auto-capture: "Auto-capture: your ₱8 took ₱4."
  - Auto-played ledger rows carry a small "forced" label.
- `shared/bot.ts`: flip `evaluate` and `gain` to prefer a lower score, and retune the dama and advancement bonuses.
- Copy: `ResultDialog.tsx:27`, `Learn.tsx:129`, `Learn.tsx:279`, and `RULES.md`.
- Tests: winner direction, draw, capture priority, `forcedStep`, a room auto-playing a capture (integration),
  and a bot that picks the NS capture over a scoring one.

**Done when** a Grade 7 game ending 10–20 is won by the side on 10 in every mode, and a forced capture plays
itself with its message showing.

### Phase 2: make the engine grade-aware (medium, no behaviour change) — built

All of this stays in `shared/engine.ts`, as hard rule 2 requires.

- `Rules` gains `grade: 7 | 8 | 9 | 10`, default 7. `initialState` and `replay` already take `rules`, and
  `state.rules` already travels with the state, so this is the one seam for everything.
- A `GRADES` table holds each grade's chips, score columns, capture rule and final-score rule.
- `Unit` widens to `P`, `kWh`, `sci`, `pct`, `F`, `g`, `C`.
- `shared/codec.ts` looks chips up by chip number in the grade's table, and `decodeBoard` takes the grade. A chip's
  number comes from its unit and value, so `Piece` needed no new field. `pieceId` is unchanged.
- `START_SQUARES` holds the squares for chips 1 to 12, shared by every grade.
- Score columns replace the single number: `columns: Record<Side, Record<Column, number>>`. Grade 7 has kWh and
  ₱, Grades 8 and 9 have one column, Grade 10 has g, °C and g·°C. `scores` stays as the derived total, so most
  of the client keeps working. `projectedFinals` gives the bot and `endGame` the same answer.
- `Equation.unitFactor` stays, so the ledger can keep teaching `×5 ₱/kWh`. Totals come from the columns, so the
  rate reaches the final score once, as on the sheet, and a linear grade comes to the same number either way.
- `scoreCapture` and `piecePoints` take the grade. `base === null` stays the meaning of NS.
- `shared/notation.ts` gets one formatter for chips, equations and totals. `peso` already calls it; Phase 6 passes
  the grade to every screen.
- `GRADES` holds only Grade 7 until Phase 3, so `Grade` is `7` for now and widens by itself as entries are added.

**Done when** the Grade 7 tests pass unchanged apart from the rate, and a sample-sheet test reproduces ₱126.

### Phase 3: add Grades 8, 9 and 10 to the engine (medium) — built

- **Grade 8:** chips from the table in `SCIDAMA_VERSIONS.md`, stored as plain numbers. Display as
  `2.2011 × 10²`, never as long decimals.
- **Grade 9:** RH table in the engine. A % result looks up °F; a °F result adds directly. An exact `0 %` is a
  valid score of 78 °F, while a negative result is NS, so the two must stay distinct. Compare on °F; show °C.
- **Grade 10:** three columns, `g × °C` into g·°C, final score in calories.
- `RULES.md` gains a section per grade. `engine.test.ts` gains a test for each section 2 call and the source
  examples: `25% + 40%` gives 91 °F, `37 °C × 10 g` gives 370 g·°C, and the 4576 calories sheet.

**Done when** a full scripted game finishes in each grade with the expected winner.

Measured over 1,000 random games per grade, with each side winning about half:

| Grade | Captures that score | Median final |
| --- | --- | --- |
| 7 | 21% | ₱96 |
| 8 | 90% | 2.4 × 10¹² |
| 9 | 21% | 415°F |
| 10 | 31% | 2,069 calories |

Grade 8's finals run as high as 10²⁴, so one large product can decide a game. Phase 4 measured this; check how it
feels when it is first played.

### Phase 4: teach the bot every grade (small to medium) — built

- `evaluate` is tuned to pesos, and its fixed `+6` dama bonus means nothing next to Grade 8's 10¹² range. Compare
  projected finals on a log scale and scale the bonuses to match.
- Grade 10's final score multiplies columns, so `evaluate` must use the grade's final-score rule, not a sum.
- Test: the medium bot beats a random player in most of 20 games in each grade, and always returns a legal turn.

The log scale also fixed a real bug: a won game was worth 100,000, while a Grade 8 lead was worth over 10¹², so
the bot preferred a bigger lead to winning. Results over 24 games per pairing:

| Grade | Medium v random | Hard v easy | New v old bot, medium (30 games) | Biggest term in the loser's score |
| --- | --- | --- | --- | --- |
| 7 | 24–0 | 24–0 | 13–15, 2 draws | 25% |
| 8 | 23–1 | 24–0 | 17–13 | 98% |
| 9 | 24–0 | 24–0 | 14–15, 1 draw | 15% |
| 10 | 24–0 | 24–0 | 16–14 | Not comparable: its final multiplies columns |

Skill decides Grade 8, but one term is nearly the whole losing score. Easy plays about even with a random player
in every grade, which suits a beginner but may be weaker than the name suggests.

### Phase 5: server and protocol (medium) — built

- `shared/presets.ts`: `RoomSettings.grade`, default 7. `shared/protocol.ts` and the zod `settingsSchema` first,
  as hard rules 4 and 5 require.
- `server/rooms.ts`: pass the grade to `initialState`; rematches keep it; lobby state and `game:` payloads carry it.
- `server/matchmaking.ts`: key the queue by preset and grade, and make `counts()` report both. `queue:join` gains
  a validated `grade`.
- `server/db.ts`: new migration adding `games.grade INTEGER NOT NULL DEFAULT 7`, for filters and game rows.
  Keep `settings_json` as the source for replays; a missing grade means 7.
- `red_score` and `blue_score` became `REAL` in the same migration. SQLite stores any size in an `INTEGER` column, but
  `node:sqlite` refuses to read back a whole number past 2⁵³, so one Grade 8 game would have broken every list
  that reads it. A test saves and reads every size, and another upgrades a real old-format database.
- `queue:join` without a grade means Grade 7, so a client from before a deploy still works.
- `server/server.test.ts`: a room plays and saves a non-default grade, and quick match never pairs two grades.

### Phase 6: client (large) — built

- **Picking a grade:** `RoomSettingsEditor.tsx`, the Lobby quick-match block, and bot and local setup in
  `LocalGame.tsx`. Remember the last grade in `store/prefs.ts`.
- **Chips:** `Chip.tsx` must fit `1.212 × 10¹²` on a chip, on two lines if needed, and pass the accessible-name
  rule. The Classic piece art is Grade 7 only, so other grades fall back to Flat.
- **Board names:** square labels come from the shared formatter.
- **Ledger:** `Ledger.tsx` writes each grade's equations and shows its columns. Its empty-state scoring guide
  changes per grade. The capture ledger is the signature element, so check it closely.
- **Scores:** `PlayerStrip.tsx`, `ResultDialog.tsx`, `GameRow.tsx`, `Watch.tsx`, `Profile.tsx` and `Replay.tsx`
  format through the shared formatter, and each game shows its grade.
- **Learn:** a section per grade with a worked example. Its 26 ₱/kWh mentions are Grade 7 copy.
- **Saved local games:** add the grade; old saves load as Grade 7.
- **Title screen:** stays Grade 7. `useAttractGame.ts` and "Play from here" need no change beyond Phase 1.
- `MiniBoard.tsx` hard-codes `data-board="felt"` and needs the game's grade.
- **Exponents:** Inter's web font only has ¹ ² ³, so `MathText` and the chips draw exponents as real superscripts.
- **Score sheet:** `ScoreSheet.tsx` shows the columns above the ledger in Grades 7 and 10. Grade 10's score reads 0 until
  a side has both grams and °C, so this is what shows its game moving.
- **Results:** Grade 10's dialog lists its columns, because captures and chips left do not add up to its final.
- **Profile:** the best and average score figures are gone: best meant highest, and each grade has its own unit.

### Phase 7: grade themes (small to medium)

See section 5. Add the tokens, update `DESIGN.md` §2 and §7 in the same change, and run the taste-skill linter.

### Phase 8: finish (small)

- Extend `e2e/play.e2e.ts` to play a non-default grade through two browsers.
- Run the DESIGN.md §12 checks at 1440, 768 and 390 for each grade.
- Update `README.md`, `AGENTS.md` and `REVIEW_NOTES.md`, then start `DATABASE_PLAN.md`.

## 5. Grade themes

Today, `[data-board]` in `tokens.css` overrides three board tokens, and `Board.tsx:256` sets the attribute from
the player's Settings choice. Grade themes reuse that mechanism.

| Grade | Theme | Idea | Light square | Dark square |
| --- | --- | --- | --- | --- |
| 7 | Felt (exists) | The original table | `#e8e1cf` | `#1f4d36` |
| 8 | Chalk | A classroom chalkboard | `#e4e6e1` | `#2f3a35` |
| 9 | Sky | Weather and humidity | `#e1e8e6` | `#2c5560` |
| 10 | Clay | Heat and fire | `#ecdfd0` | `#6b3a2a` |

These colours are starting points, to be checked on real screens.

- **Settings:** add **Match the grade** as the new default. Felt, Slate and Paper stay as overrides, so a player
  can still choose one look for everything.
- **Scope:** themes change the board only. `DESIGN.md` keeps colour outside the board to a minimum, and amber
  stays the one data hue, so the app shell does not change per grade.
- **Check per theme:** amber last-move and legal-move marks stay visible, red and blue chips stay distinct,
  operator glyphs stay readable, and edge coordinates pass contrast. Clay is the riskiest, near the red chips and
  amber marks.

## 6. Risks

| Risk | Plan |
| --- | --- |
| Our Grade 8 rules are invented | Keep them in one table entry, and label them in Learn |
| One term dominates Grade 8 | Measured in Phase 4: 98% of the loser's score, though skill still decides. Play it first |
| Grade 9 half-scores on the shared board | Measured in Phase 3: 21% of captures score, the same as Grade 7, so it stays |
| A proper manual contradicts section 2 | Rule calls are data in `GRADES`, so most fixes are one-line |
| Grade 8 numbers break layouts | Test the longest values at 390 px in Phase 6 |
| `engine.ts` grows large | Accept it; splitting would need a change to hard rule 2 |

## 7. Why Neon comes after

1. **The score shape changes here.** Decimals, very large numbers and a new `grade` column all affect the
   schema. Doing Neon first means designing the Postgres tables twice.
2. **Both touch the same code.** Neon makes `finish()` in `server/rooms.ts` async, and Phase 5 changes the rooms
   around it. One at a time is safer.
3. **Losing data costs little right now.** Phase 1 changes who wins, so history from before it is inconsistent
   anyway, and a demo can restart from empty.
4. **Neon stays independent.** Nothing here makes it harder, and `DATABASE_PLAN.md` is ready when this ends.

Do Neon first only if real people need their accounts to survive deploys before this plan is finished.

## 8. Later

- **kWh rate room setting.** `kwhRate` joins `RoomSettings`, with zod validation and a control in
  `RoomSettingsEditor.tsx`. Rated games and quick match should stay on the default, so ratings stay comparable.
- Other game-maker settings, if more turn up.
