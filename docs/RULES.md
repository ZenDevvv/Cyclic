# Scidama rules (engine spec)

This is the canonical description of the rules implemented by `shared/engine.ts`. The engine is the only
place these rules live; the server and the client both import it. Change a rule here, in the engine, and in
`shared/engine.test.ts` together.

Scidama is the "science" variant of Damath (Filipino math checkers). The twist: every chip carries a
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
- **Optional room rule `maxCapture`** (off by default): the side must choose a sequence that captures the
  most chips. Off matches the original Cyclic build; on matches official Damath tournament rules.

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
3. kWh results are converted to pesos at **₱3 per kWh** (×3).

The result is added to the capturing side's score in pesos. Scores never go down.

## End of game

The game ends when any of these happens:

1. A side has no chips left.
2. The side to move has no legal move (blocked).
3. The game clock runs out (default 20 minutes for the whole game).
4. A player runs out of move time (default 60 s per turn) — **that player loses on time**.
5. A player resigns, both agree to a draw, or a player abandons (disconnects past the grace period).

For endings 1–3, every chip still on the board is added to its owner's score: its value, ×2 if it is a
dama, ×3 if it is a kWh chip. The higher score wins; equal scores are a draw. Endings 4–5 decide the winner
directly, but the remaining-chip tally is still computed and shown.

## Notation

A move is written with absolute coordinates from red's frame, e.g. `₱8 (6,1)→(5,2)`. A capture adds its
equation, e.g. `₱8 + ₱4 = ₱12` or `5 kWh × 3 kWh = NS`, followed by multipliers when they apply
(`×2 dama`, `×3 ₱/kWh`) and the points scored.
