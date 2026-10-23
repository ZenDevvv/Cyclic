# DESIGN.md — Scidama design system

Global design rules for every screen in this repo. Read this before touching anything in `client/`.
Two directions were dealt with the **design-taste-frontend** skill (taste-skill v2):

```
App screens (everything except /):  draw.mjs --app --kind community --style true-black-flat   seed 329759039
Title screen (/):                   draw.mjs --sector consumer-app --direction one-motif --keep palette,type   seed 575637363
```

The sheets are git-ignored working files: `.taste-skill/direction.app.json` (app) and
`.taste-skill/direction.json` (title). This file is the source of truth where they differ. The title
screen follows the skill's **page** rules (§13); every other screen follows the **app** rules.

## 1. The idea

**Night play on true black; the board is the only bright thing in the room.** Elevation is a lightness
step alone. Colour is spent on three things only: the board, the two sides (red and blue), and one data
hue (amber) for points and for marks the player must act on.

- **Face** (what makes it Scidama and not a kit): a warm near-black ground, the amber of coin and current
  (₱ and kWh) as the one data hue, and the felt-green board of the original Cyclic build.
- **Signature element: the capture ledger.** Every capture is written as the equation it scored —
  `₱8 + ₱4 = ₱12 · ×2 dama = ₱24` or `5 kWh × 3 kWh = NS` — so the move list teaches the unit rule while
  you play. It appears in the game rail, in replays and in the rules page.
- **Each screen's one question** (biggest block answers it):
  - Lobby: "How do I get into a game right now?" → quick match and open rooms lead.
  - Game: "Whose move, and what does this capture score?" → board, clocks, ledger.
  - Watch: "Which games are live?" → live boards.
  - Profile: "How good is this player?" → rating and record.
  - Leaderboard: "Who is best?" → ranked table.
  - Settings: "How does my board look and sound?" → previews beside controls.

## 2. Tokens

Defined once in `client/src/styles/tokens.css` and mapped into Tailwind's `@theme`. Components use tokens
only — never raw hex values.

```css
:root {
  /* ground and surfaces: elevation by lightness alone, no borders or shadows on cards */
  --ground:  #0e0d0c;   /* warm near-black */
  --surface: #181716;   /* cards, rail, top-level panels */
  --raised:  #262422;   /* nested panels, secondary buttons, running clock */
  --active:  #2f2c29;   /* hover / selected row */
  --border:  #24221f;   /* only where a line is truly needed (tables, inputs) */
  --rule:    #1d1b19;
  --control: #4a4743;   /* input and outlined-button edges */

  /* ink: two greys that read apart */
  --text:  #ffffff;
  --muted: #b4b4b4;
  --faint: #949494;     /* ≥ 4.5:1 on --raised */

  /* the one data hue — points, last move, legal targets, selection */
  --accent: #f2b33d;
  --accent-ink: #1a1306;    /* text on an amber fill */

  /* sides (identity, not data) */
  --red:  #e5483f;    --red-chip:  #c9372f;
  --blue: #3d8de0;    --blue-chip: #2668b5;

  /* status, as pale-on-dark pill pairs */
  --positive: #3fc07a;  --pill-positive-bg: #172a1d;
  --negative: #e5566f;  --pill-negative-bg: #2c1a20;
  --warning:  #e5a93b;  --pill-warning-bg:  #2b2414;
  --pill-neutral-bg: #262422;

  /* board (theme "felt"; other themes override these three) */
  --sq-light: #e8e1cf;   /* playable squares */
  --sq-dark:  #1f4d36;   /* dead squares */
  --sq-glyph: rgba(31, 77, 54, 0.5);   /* operator marks */
  --sq-coord-light / --sq-coord-dark;  /* edge coordinates on light and dark squares */
  --chip-face: #f6f1e4;  --chip-ink: #1c1a17;   /* the ivory centre of a chip and its figures */

  --radius-card: 20px;  --radius-control: 999px;  --radius-input: 10px;  --radius-board: 6px;
  --gap: 14px;  --pad: 22px;
  --control-height: 36px;  --row-height: 56px;  --topbar: 48px;
  --column: 1152px;
}
```

Board themes (Settings → Board): **Felt** (default, above), **Slate** (`#d9dadc` / `#3a3d42`), **Paper**
(the original: `#f5f5f5` / `#035a03`). Piece sets: **Flat** (default, SVG drawn in code) and **Classic**
(the original Cyclic chip art, downscaled to 160 px WebP).

## 3. Type

- **Inter** (variable, self-hosted via `@fontsource-variable/inter`). One family. Weights 400, 500, 600 —
  nothing heavier.
- Sizes: **12** (meta, axis, pills) · **14** (body, rows, nav) · **16** (card titles) · **20** (page
  title, h1) · **24** (KPI figures, scores) · **28–32** (clock digits only). Nothing at 40+.
- `font-variant-numeric: tabular-nums` on every score, clock, rating, count and table figure (`.num`).
- Sentence case everywhere. No tracked uppercase labels. Room codes are IDs and may use the monospace
  stack (`ui-monospace`) — nothing else does.

## 4. Shell and layout

- **No sidebar.** A 48 px top bar on the page ground: the mark + "Scidama" on the column's left edge,
  links **Play · Watch · Leaderboard · Learn**, and on the right the online count and the account button.
  When content scrolls under it, it gains a 1 px `--rule` bottom edge.
- A centred column, max 1152 px, 24 px gutters on desktop and 16 px on phones.
- **Game screen:** board left, a 384 px rail right (opponent strip + clock, ledger/chat tabs, your strip +
  clock, actions). Board size = the smaller of 720 px and the viewport height minus the top bar and 48 px.
  Below 960 px the rail moves under the board; on phones the opponent strip sits above the board and
  yours below it, with the ledger as a horizontal strip (the Lichess phone pattern).
- One gap value (14 px) horizontally and vertically. Cards in a row share their bottom edge.
- Touch targets ≥ 44 px on phones. No page ever scrolls sideways.

## 5. Colour rules

- Colour budget outside the board ≤ ~3 % of pixels. The accent **never** fills a button, tab or nav item.
- The primary action is an **inverted pill**: white fill, black label, 36 px tall. One per screen.
- Secondary buttons: `--raised` fill, white label. Tertiary: text only, `--muted` → `--text` on hover.
- Red and blue appear only as side identity: chip rings, a 8 px dot beside a player's name, the running
  clock's side mark. Never as status.
- Wins/losses use the status pill pairs (pale ink on a dark tint), not the side colours.
- Amber marks: score figures and gains in the ledger, last-move squares, legal-move dots, the selected
  chip's ring, chips that must capture.

## 6. Components

| Component | Rule |
| --- | --- |
| Card / panel | `--surface`, radius 20, padding 22, no border, no shadow. Nested panels `--raised`, radius 14. |
| Dialog, menu, toast | The only things with a shadow (they float). `--surface`, radius 20. |
| Button | Pills, 36 px. Primary inverted; secondary `--raised`; destructive = text in `--negative` with a confirm. |
| Input | 40 px, radius 10, `--ground` fill, 1 px `--control` edge, label above (14/500), never a placeholder as label. |
| Segmented control | `--raised` track, active segment `--active` with white label; as wide as its options. |
| Tabs | Text tabs, active = white label + 2 px white underline on a 1 px `--rule`. |
| Pill | 20–24 px, 12/500, pale-on-dark pairs; `flex: none; white-space: nowrap`. |
| Table | 12 px grey sentence-case headers, no fill band, 1 px `--rule` rows, numbers right-aligned tabular. |
| Empty state | Keep the frame and header, one sentence, and the next action. |
| Loading | Final layout with flat `--raised` bars at real size; no shimmer. |
| Error | Inside the block that failed, one sentence and a Retry text button. |

## 7. The board

- Squares are real buttons (keyboard: Tab to the board, arrows to move focus, Enter/Space to select and
  move, Esc to cancel). Each has an accessible name like "(5,2) plus, red ₱2".
- Input: click a chip then a target, or drag. Both share one code path.
- Marks: last move = amber tint on both squares; selected chip = 3 px amber ring; legal target = amber dot
  (28 % of the square); chips that must capture = 2 px amber ring; illegal attempt = a 120 ms shake.
- Coordinates inset in the edge squares at 11 px (toggle in Settings), flipping with the board.
- Chips slide 180 ms ease-out; captured chips fade 160 ms. With `prefers-reduced-motion` or the setting
  off, they jump.

## 8. Motion

Motion is feedback only: press, hover, focus, chip slides, a dialog or sheet opening, a row arriving.
Nothing performs an entrance. Transform and opacity only. Everything honours `prefers-reduced-motion`.

## 9. Copy

- Words of the trade: *chip, dama, capture, ledger, room, seat, quick match, rematch, ₱, kWh*.
- Buttons say what they do: "Find a match", "Create room", "Copy invite link", "Offer draw".
- Zeros print as 0; missing values as a grey em dash.
- No emoji in UI chrome (players may type anything in chat).

## 10. Banned (checked by the taste-skill linter and inspector)

Gradients; glows; glass/backdrop blur; shadows on resting cards; icons in tinted circles or squares;
eyebrow labels and pill badges above headings; tracked uppercase labels; monospace outside IDs; violet or
indigo; cream-with-terracotta; navy/slate dark themes; emoji in chrome; lorem/Acme/John Doe; a hero header
on an app screen; titles over 32 px; figures at 48 px or more; pagination under short lists.

## 11. Exceptions, with reasons

These were measured by the inspector and are kept on purpose:

| Rule | Where | Why |
| --- | --- | --- |
| `icon-chips` (pass `--allow icon-chips`) | Any screen with a board | The "icons in tinted squares" are the board's 32 operator squares — the game itself, not decoration. The board root carries `data-ui`. |
| `colour-sprawl` (WARN) | Game, replay, watch, learn at 768/390 | The board is the screen's data; on narrow screens it is most of the first screen. Colour outside the board stays under budget. |
| `panel-void` (WARN) | Ledger at the start of a game | The ledger fills as the game is played; while empty it shows the scoring guide (reference data), not a blank box. |
| `below-fold` (WARN) | Learn | A long-form rules page; the first screen carries the title, the summary, the actions and a live board. |
| `hero-void` / `ragged-row` (WARN) | Leaderboard with few players | The table grows with the player base; nothing is padded to fill it. |
| Monospace | Room codes only | IDs; one `ID_FONT` constant in `components/ui/controls.tsx`. |

**People tints** (`components/ui/Avatar.tsx`): each person gets a stable initial on a dark tint of a hue
derived from their id (skipping the violet/indigo band). Identity, not data; never used in charts.

## 12. Checks

```bash
node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs client/src/pages/Title.tsx client/src/components/title
node ~/.claude/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:5500/            # title: page rules
node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app client/src
npm run build && npm start   # then, in another shell:
node ~/.claude/skills/design-taste-frontend/scripts/inspect.mjs --app --allow icon-chips http://localhost:5500/
```

Fix every FAIL; defend or fix every WARN. Look at the 1440 / 768 / 390 screenshots every round.

## 13. The title screen (`/`)

A game title screen, built to the skill's page rules with its own direction (**one motif**).

- **The idea:** the notched chip of the original Cyclic artwork (and of the logo mark) becomes the one
  motif: a chip a screen wide whose face is a window onto a game that plays itself.
- **The motif at four scales, and nothing else:** the giant chip (desktop: its face ends on the page's
  right margin, the ring bleeds off the edge; phones: below the menu, bleeding off both sides) · the
  original chip art "spilled" around it (the project's own raster pictures; tap to toss) · the menu cursor
  (`ChipCursor`) · the rim unrolled into a full-width band that separates the hero from the sections.
  No other decorative shapes.
- **Colour:** the motif carries the amber accent at full scale — **only on this screen**. App screens keep
  amber on data.
- **Type (five sizes on the page):** 115 (h1, `clamp(64px, 8vw, 115px)`) · 63 (section headings) ·
  34 / 26 (statement and menu rows) · 18 (text) · 13 (meta). The shared top bar and footer keep the app's
  12/14/16.
- **The live thing — attract mode** (`components/title/useAttractGame.ts`): bot against bot in the
  chip's face, each capture rising off its square as the sum it scored; **Play from here** takes the
  position into `/play/bot` with you as the side to move. It never plays sound by itself, pauses off
  screen or in a hidden tab, and under reduced motion holds a still position.
- **The menu** works like a game's: ↑ ↓ move the chip cursor, Enter starts; the selected row is an
  inverted white pill (the screen's primary control). Hovering or focusing a row swaps what shows
  through the face with a circular wipe: the game, a room with its code on chips, or the unit rule.
- **Motion:** hero parts rise in, the chip rolls in, spilled chips drop in, sections reveal on scroll,
  the ring spins (140 s a turn), the rim band rolls. All transform/opacity; reduced motion shows the
  finished state.
- **Below the hero:** "From title screen to table" (one bar, segments sized by real durations) and a
  paragraph with picture words. Remove both from `pages/Title.tsx` for a single-screen title.
- **Inspector exceptions:** `no-footage` (the live game is the moving picture); one sub-13px block (the
  shared top bar's 12px meta).
