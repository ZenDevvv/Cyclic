# Scidama rules (engine spec)

This is the canonical description of the rules implemented by `shared/engine.ts`. The engine is the only
place these rules live; the server and the client both import it. Change a rule here, in the engine, and in
`shared/engine.test.ts` together.

Scidama is the "science" variant of Damath (Filipino math checkers). Everything below describes Grade 7, Electro
Sci-Dama, until the section "Grades 8, 9 and 10", which lists what those grades change. The evidence for each
rule is in `SCIDAMA_VERSIONS.md`. The twist: every chip carries a
quantity with a **unit**, either pesos (₱) or kilowatt-hours (kWh), and a capture only scores when the
arithmetic is dimensionally valid.

## Board

- 8×8 board. Coordinates are `(x, y)`, both 0–7. `x` runs left to right and `y` runs bottom to top from
  red's seat. Square index = `y * 8 + x`.
- Only squares with `(x + y)` odd are playable (32 squares). Each playable square carries one operator.
- Operator layout (red's view, top row first; `.` = not playable):

```
y=7  ×  .  ÷  .  −  .  +  .
y=6  .  ÷  .  ×  .  +  .  −
y=5  −  .  +  .  ×  .  ÷  .
y=4  .  +  .  −  .  ÷  .  ×
y=3  ×  .  ÷  .  −  .  +  .
y=2  .  ÷  .  ×  .  +  .  −
y=1  −  .  +  .  ×  .  ÷  .
y=0  .  +  .  −  .  ÷  .  ×
     0  1  2  3  4  5  6  7
```

  The layout is symmetric under a 180° turn, so both players see the same board from their own seat.

## Chips

Each side has 12 chips: six peso chips (₱2, ₱4, ₱6, ₱8, ₱10, ₱12) and six energy chips (1, 3, 5, 7, 9,
11 kWh). Starting squares (as in the original Cyclic build):

| Side | y | Chips (x: chip) |
| --- | --- | --- |
| Red | 0 | 1: ₱12, 3: 9 kWh, 5: ₱6, 7: 3 kWh |
| Red | 1 | 0: 1 kWh, 2: ₱4, 4: 11 kWh, 6: ₱8 |
| Red | 2 | 1: ₱10, 3: 7 kWh, 5: ₱2, 7: 5 kWh |
| Blue | 5 | 0: 5 kWh, 2: ₱2, 4: 7 kWh, 6: ₱10 |
| Blue | 6 | 1: ₱8, 3: 11 kWh, 5: ₱4, 7: 1 kWh |
| Blue | 7 | 0: 3 kWh, 2: ₱6, 4: 9 kWh, 6: ₱12 |

Red moves first. Red moves toward `y = 7`, blue toward `y = 0`.

## Moving

- **Chip (not crowned):** a plain move goes one square diagonally **forward** onto an empty square.
- **Dama (crowned chip):** a plain move goes any distance along a diagonal over empty squares ("flying").

## Capturing

- **Chip:** jumps an adjacent opponent chip in **any** of the four diagonal directions (backward too) and
  lands on the empty square directly beyond.
- **Dama:** travels along a diagonal over empty squares, jumps exactly one opponent chip, and may land on
  any empty square beyond it until the next occupied square or the edge.
- **Capturing is mandatory.** If any capture exists for the side to move, a plain move is illegal.
- **Multi-capture.** After a capture, if the same chip can capture again, the turn continues and that chip
  must keep capturing. Other chips may not move until the sequence ends.
- Captured chips leave the board immediately (as in the original build).
- **Capture priority, room rule `maxCapture`** (on by default): the "mayor" rules. The side must choose the
  sequence that captures the most chips, and on equal counts a dama goes before an ordinary chip. So a chip
  taking two beats a dama taking one. A host can turn this off, which allows any capture.
- **Auto-capture, room setting `autoCapture`** (on by default): when a capture is the only legal step, the
  server plays it after 800 ms and every player sees a message. A dama with several landing squares has a choice,
  so it is not forced. Each jump of a multi-capture is judged on its own. A player may make the capture during
  the pause. An auto-capture does not decline a draw offer. This changes who plays the step, not the rules, so
  it is not part of `Rules`, and replays need no record of it. In bot and pass-and-play games the setting is
  a per-device preference.

## Crowning

A chip that **ends its turn** on the far row (red `y = 7`, blue `y = 0`) becomes a dama. A chip that lands
on the far row mid-sequence and can still capture keeps capturing as a chip and is crowned only if the
sequence ends there.

## Scoring a capture

The landing square's operator combines the capturing chip's value `a` with the captured chip's value `b`:

| Units | `+` | `−` | `×` | `÷` |
| --- | --- | --- | --- | --- |
| Same unit (₱ with ₱, kWh with kWh) | `a + b` | `a − b`, or 0 if negative | no score | no score |
| Different units | no score | no score | no score | no score |

Why: only adding or subtracting like quantities gives a quantity in the same unit. ₱ × ₱ or kWh ÷ kWh is
not money or energy, and ₱ + kWh is not a quantity at all. ("NS" = no score.)

Then, in order:

1. ×2 if the capturing chip is a dama.
2. ×2 if the captured chip is a dama (so dama takes dama is ×4).
3. kWh results are converted to pesos at **₱5 per kWh** (×5). The rate depends on the game maker; it is one
   constant, `KWH_RATE`, until rooms can set it.

The result is added to the capturing side's score in pesos. Scores never go down, and **every point counts
against you**: the lower total wins.

## End of game

The game ends when any of these happens:

1. A side has no chips left.
2. The side to move has no legal move (blocked).
3. The game clock runs out (default 20 minutes for the whole game).
4. A player runs out of move time (default 60 s per turn) — **that player loses on time**.
5. A player resigns, both agree to a draw, or a player abandons (disconnects past the grace period).

For endings 1–3, every chip still on the board is added to its owner's score: its value, ×2 if it is a
dama, ×5 if it is a kWh chip. The lower score wins; equal scores are a draw. Endings 4–5 decide the winner
directly, but the remaining-chip tally is still computed and shown.

## Grades 8, 9 and 10

These grades share the board, the moves, capture priority, auto-capture, dama multipliers, the clocks and the
rule that the lower total wins. Each differs only in its chips and its scoring, which live in `GRADES` in
`shared/engine.ts`. Chips 1 to 12 start on the same squares in every grade. A game's scores are kept in
columns, as on the paper score sheets, and its score is always the grade's total of those columns.

"Our call" marks a rule the sources leave open. `GRADES_PLAN.md` section 2 gives the reasons.

### Grade 8: Scientific Notation

- **Chips 1 to 12:** 1.1 × 10⁻¹, 2.2 × 10², 3.3 × 10⁻³, 4.4 × 10⁴, 5.5 × 10⁻⁵, 6.6 × 10⁶, 7.7 × 10⁻⁷,
  8.8 × 10⁸, 9.9 × 10⁻⁹, 1.01 × 10¹⁰, 1.111 × 10⁻¹¹, 1.212 × 10¹².
- **Scoring (our call):** there are no units to mismatch, so all four operators score. A subtraction below zero
  is NS. Results keep full precision and are rounded to five figures for display only.
- **Final score:** the sum of the capture results and the remaining chips.

### Grade 9: THI

- **Chips:** 70, 75, 80, 85, 110, 120 °F on the squares of odd chips, and 25, 30, 35, 40, 45, 50 % on the squares
  of even chips, smallest first (our call).
- **Humidity with humidity:** `+` and `−` work out a %, and the table turns it into °F, so `25% + 40%` is
  `65% → 91°F`. Exactly 0% is a score of 78°F. Below zero is NS.
- **Temperature with temperature:** `+` and `−` add the result straight to the sheet.
- **Everything else is NS:** `×`, `÷` (our call, since the shared board has them) and mixed units (our call).
- **Dama factors** apply after the table (our call).
- **Remaining chips:** a % chip is looked up on its own (our call); a °F chip counts its value.
- **Final score:** the total in °F, shown in °C as well, using (°F − 32) × 5/9. The order is the same either way.

| RH % | °F | RH % | °F | RH % | °F |
| --- | --- | --- | --- | --- | --- |
| 0 | 78 | 35 | 85 | 70 | 93 |
| 5 | 79 | 40 | 86 | 75 | 95 |
| 10 | 80 | 45 | 87 | 80 | 97 |
| 15 | 81 | 50 | 88 | 85 | 99 |
| 20 | 82 | 55 | 89 | 90 | 102 |
| 25 | 83 | 60 | 90 | 95 | 105 |
| 30 | 84 | 65 | 91 | 100 | 108 |

### Grade 10: Thermo

- **Chips:** 3, 7, 13, 19, 29, 37 g on the squares of odd chips, and 2, 11, 17, 23, 31, 55 °C on the squares of
  even chips, smallest first (our call).
- **Same units:** `+` and `−` go in the g or °C column. Below zero is NS. `×` and `÷` are NS (our call).
- **Different units:** `g × °C` multiplies into the g·°C column, whichever chip is taking. `+`, `−` and `÷` are NS.
- **Remaining chips** are added to their g or °C column.
- **Final score:** (total g × total °C) + total g·°C, in calories.

## Notation

A move is written with absolute coordinates from red's frame, e.g. `₱8 (6,1)→(5,2)`. A capture adds its
equation, e.g. `₱8 + ₱4 = ₱12` or `5 kWh × 3 kWh = NS`, followed by multipliers when they apply
(`×2 dama`, `×5 ₱/kWh`) and the points scored.
