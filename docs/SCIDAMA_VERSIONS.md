# Scidama versions by grade (research notes)

**Status:** research from 2026-11-07, all built by `GRADES_PLAN.md`. `RULES.md` is the spec for what the engine does;
this file records what the published Sci-Dama materials say, and where we had to decide for ourselves.

No official rulebook was found. The sources are classroom guidelines and a 2011 teacher's blog, and they use
the old year levels. First to Fourth Year map to Grades 7 to 10. The best single source is the owner's PDF copy
of *SciDama: Science Board Game for High School Students*, which also adds a corrected Thermo guide. Its board
pictures are missing, and it cites DepEd Memo No. 465, s. 2009, whose link is dead. Check this file against an
official manual if one turns up.

Each fact is marked: **[stated]** in a source, **[checked]** by redoing a sample's arithmetic, or
**[inferred]** by us.

## The versions

| Grade | Year | Version | Science concept | Board |
| --- | --- | --- | --- | --- |
| 7 | First | Electro Sci-Dama | Electric power consumption | Shared board |
| 8 | Second | Scientific Notation Sci-Dama | Scientific notation | Shared board |
| 9 | Third | THI Sci-Dama | Temperature humidity index | Its own board |
| 10 | Fourth | Thermo Sci-Dama | Thermodynamics (heat) | Shared board |

The guidelines caption two boards: "Sci-Dama board for Electro, Scientific Notation and Thermo Sci-Dama" and
"Sci-Dama board for THI Sci-Dama" **[stated]**. The board layouts are images we could not read. One source
says "Secondary Sci Dama. THI only (plus and minus)", which hints that the THI board has only `+` and `−`
squares, and every THI example uses only those **[inferred]**.

## Rules shared by all versions

All **[stated]** in the guidelines or the blog's general rules.

- **Operators:** the landing square sets the operation. The capturing chip's value always comes first.
- **Moves:** chips move diagonally forward. Captures go forward or backward. Passing is not allowed.
- **Touch move:** a player who touches a chip must move it unless that is illegal.
- **Capture priority:** capturing is mandatory, and the "mayor" rules decide between captures. Taking three
  beats taking two ("mayor tatlo over dalawa"), and taking two or three beats a 'dama' capture ("mayor dalawa or
  tatlo over dama"). When the count is equal, a dama taking a chip beats a chip taking a chip.
- **Dama squares:** red (0,7) (2,7) (4,7) (6,7); blue (1,0) (3,0) (5,0) (7,0).
- **Dama movement:** slides diagonally forward or backward over vacant squares.
- **Multipliers:** dama takes chip ×2; chip takes dama ×2; dama takes dama ×4.
- **Time:** 20-minute game, 1 minute per move. A late move gets a warning and a forced move. The fourth
  violation disqualifies the player, even one who is leading.
- **Game end:** time runs out, repetitive moves, a player resigns, a chip is cornered, a player has no move or
  no chips, or a player is a no-show after ten minutes.
- **Remaining chips:** added to the owner's total; a remaining dama counts double.
- **Winner:** the **lower** total wins; a draw is ½ each.

### Lower score wins

Every Sci-Dama source that gives a winner rule says the lower total wins:

- Guidelines rule 19: "The player with the lesser accumulated total score wins the game."
- Blog general rule 12 (Electro, Scientific Notation, THI): "The player with a lesser total score is declared
  winner".
- THI: "the player with the lesser temperature in the Total THI (°F converted to °C) is declared winner."
- Thermo: "The object of the game is to have the lowest possible score to be able to win."
- Sci-Damaths blog rule 20: "The player with the greater accumulated total wins the games except sci-dama."

That last line is why this is easy to get wrong: plain Damath is the opposite, and the higher total wins.

## Grade 7: Electro

- **Chips [stated]:** 1, 3, 5, 7, 9, 11 kWh and ₱2, ₱4, ₱6, ₱8, ₱10, ₱12.
- **Scoring [stated]:** same units with `+` or `−` score. A negative result, and every `×` or `÷`, is NS
  (no score). Sample rows: `7 kWh − 11 kWh = NS`, `3 kWh × 3 kWh = NS`, `₱10 × ₱4 = NS`, `₱12 ÷ ₱2 = NS`.
- **Different units [stated]:** the chip is still taken and the sheet records no score.
- **Final score:** (total kWh × rate) + total ₱. The rate is "rate per kWh" on the sheet, and ₱5 in the sample.
- **Sample [checked]:** 12 kWh scored + 6 kWh remaining = 18 kWh; 18 × ₱5 = ₱90. ₱18 scored + ₱18 remaining =
  ₱36. Total ₱126.

## Grade 8: Scientific Notation

- **Chips [stated]:** the value of chip *n* is below. Odd chips have negative exponents, even chips positive.

| Chip | Value | Chip | Value |
| --- | --- | --- | --- |
| 1 | 1.1 × 10⁻¹ | 7 | 7.7 × 10⁻⁷ |
| 2 | 2.2 × 10² | 8 | 8.8 × 10⁸ |
| 3 | 3.3 × 10⁻³ | 9 | 9.9 × 10⁻⁹ |
| 4 | 4.4 × 10⁴ | 10 | 1.01 × 10¹⁰ |
| 5 | 5.5 × 10⁻⁵ | 11 | 1.111 × 10⁻¹¹ |
| 6 | 6.6 × 10⁶ | 12 | 1.212 × 10¹² |

- **Starting squares [checked]:** the blog lists a square for each chip number. All 24 match the Grade 7
  layout in `RULES.md`, with chip *n* on the square of the Grade 7 chip of value *n*.
- **Scoring:** no source explains it. There are no units, so all four operators may simply apply
  **[inferred]**, but rounding, negative results and how totals compare are all unknown.

## Grade 9: THI

- **Chips [stated]:** 70, 75, 80, 85, 110, 120 °F and 25, 30, 35, 40, 45, 50 %. Starting squares are unknown.
- **Scoring [stated]:** a humidity result is converted to °F with the table below and added to the running
  THI total. A negative result is NS.
- **°F chips [stated, sample only]:** the sheet adds °F results straight to the total, e.g. `70°F − 50°F = 20°F`.
- **Final score [stated]:** add remaining chips, then convert the total to °C. The lesser temperature wins.
  No formula is given; the usual one is (°F − 32) × 5/9 **[inferred]**.
- **Sample:** the sheet has arithmetic slips (174 + 65 is shown as 139, and 35% + 50% as 80%), so use it for
  the method only. Its chip values also include some that are not on the chip list.

| RH % | °F | RH % | °F | RH % | °F |
| --- | --- | --- | --- | --- | --- |
| 0 | 78 | 35 | 85 | 70 | 93 |
| 5 | 79 | 40 | 86 | 75 | 95 |
| 10 | 80 | 45 | 87 | 80 | 97 |
| 15 | 81 | 50 | 88 | 85 | 99 |
| 20 | 82 | 55 | 89 | 90 | 102 |
| 25 | 83 | 60 | 90 | 95 | 105 |
| 30 | 84 | 65 | 91 | 100 | 108 |

The largest possible sum of two humidity chips is 50 % + 45 % = 95 %, so the table covers every result
**[checked]**. A dama's ×2 or ×4 is not covered by any example, so whether it applies before or after the
lookup is unknown.

## Grade 10: Thermo

- **Chips [stated]:** 3, 7, 13, 19, 29, 37 g and 2, 11, 17, 23, 31, 55 °C. Starting squares are unknown.
- **Scoring [stated]:** same units with `+` or `−` go in the g or °C column. A negative result is NS. Different
  units with `+`, `−` or `÷` are NS. `g × °C` multiplies into the g·°C column, e.g. `37 °C × 10 g = 370 g·°C`.
- **Same units with `×` or `÷`:** not stated. Electro's rule would make them NS **[inferred]**.
- **Final score [stated, checked]:** (total g × total °C) + total g·°C, in calories. The Thermo guide says to
  "MULTIPLY the sum of all g's and sum of all C's then add their product to the gC's". The guidelines sample
  agrees: g 27 + 18 = 45, °C 44 + 49 = 93, 45 × 93 = 4185, 4185 + 391 = 4576 calories. The blog's older wording,
  which adds g and °C and then multiplies by g·°C, is superseded.
- **Remaining chips:** the sample adds them to the player's columns, so we follow it. Both Thermo texts also
  say they are "diminished from the player who has the leftover", which we read as the same tally **[inferred]**.
- **Sample:** two rows (`31g − 2g`, `17°C − 3°C`) read as NS despite positive results. The extracted table is
  out of order, so this may be an extraction error.

## Where the current build differs

| Rule | Sources | Current build |
| --- | --- | --- |
| Late move | Warning and forced move; fourth disqualifies | Loses on the first timeout |
| Touch move | Required | Not used |
| Repetitive moves | End the game | Not detected |
| Board | A separate board for THI | One board for every grade (the owner's decision) |
| Start of the game | Drawing lots or a coin toss | Red moves first; hosts choose or randomise sides |

## Still unknown

- The operator layouts of both boards, and whether the shared board matches the layout in `RULES.md`.
- Grade 8 scoring.
- Grade 9 and 10 starting squares.
- Same-unit `×` and `÷` in Grade 10.
- Whether a dama's multiplier in Grade 9 applies before or after the table lookup.

## Sources

- *SciDama: Science Board Game for High School Students* (owner's PDF copy; also at
  <https://studylib.net/doc/25216178/sci-dama>)
- Sci-Dama guidelines (PDF copy): <https://pdfcoffee.com/download/sci-dama-guide-lines2-pdf-free.html>
- Overview of the four versions: <https://tsoktok.blogspot.com/2011/09/sci-dama-as-teaching-strategy-in.html>
- Electro: <https://tsoktok.blogspot.com/2011/09/electro-scidama.html>
- Scientific Notation: <https://tsoktok.blogspot.com/2011/09/dama-sci-notation.html>
- THI: <https://tsoktok.blogspot.com/2011/09/thi-scidama.html>
- Thermo: <https://tsoktok.blogspot.com/2011/09/thermo-scidama.html>
- How to play Sci-Damaths: <https://scidamaths.blogspot.com>
- Grade mapping (search snippets only): <https://quizlet.com/ph/206532893/sci-damath-flash-cards/> and
  <https://www.studocu.com/ph/document/rizal-high-school/physical-science/ix-scidama-for-reference/72673159>
