# Review notes — decisions made on your behalf

You asked for this to be done in one go, with recommended choices taken and noted for later review.
Each item says what was decided, why, and where to change it. **Open questions** are at the end.

## Product and rules

1. **Move clock expiry = loss on time.** The original reloaded the page (no result). Alternatives: auto-play
   a random move, or skip the turn. *Change:* `server/rooms.ts` → `onMoveTimeout`.
2. **Every step resets the move clock**, including each jump of a multi-capture (as the original did).
   *Change:* `server/rooms.ts` → `step()` calls `resetMoveClock`.
3. **Game clock expiry = game ends and scores decide** (remaining chips tallied for both), matching
   Damath's 20-minute game. *Change:* `onGameTimeout`.
4. **The higher final score wins**, even if the winner was eliminated — Damath scoring. The original also
   compared scores (but inverted). *Change:* `shared/engine.ts` → `endGame`.
5. **Negative subtraction scores 0** (kept from the original). Official integer Damath lets it go
   negative. *Change:* `scoreCapture`.
6. **"Take the most chips" is a room option, off by default** (the original did not enforce it; official
   Damath does). Quick matches use the default (off).
7. **Captured chips leave the board immediately** in a multi-capture (original behaviour; tournament
   draughts removes them at the end of the sequence).
8. **A blocked side ends the game** (the original never checked); remaining chips tallied, score decides.
9. **Disconnects:** a seated player who drops out of a game in progress has **90 seconds** to come back
   (reload or reconnect), whether or not there is a move clock; then they lose ("left the game"). Waiting
   rooms drop a seat after 60 s away and close when nobody is left. Finished rooms close 5 min after
   everyone leaves. *Change:* `RECONNECT_GRACE_SECONDS` in `shared/presets.ts`; `WAITING_GRACE_MS`,
   `ENDED_SWEEP_MS` in `server/rooms.ts`.
10. **Custom rooms start when the host presses Start** (the original auto-started on join). Quick-match
    rooms start immediately.
11. **Opening an invite link to a waiting room takes the free seat** automatically; a full or running room
    opens as a spectator (if the host allows spectators).
12. **One seat per player.** You can't sit in two unfinished rooms. Creating or joining another waiting
    room quietly releases your old waiting seat; a game in progress blocks it ("Return to your game").
13. **Draw offers:** one at a time; after a decline, the offerer waits 4 steps before offering again;
    making a move declines an open offer.
14. **Spectators can chat** (shown as "watching"). One chat per room, last 50 messages, not stored.
15. **Peso sign.** Chips and the ledger show `₱8` instead of the original `P8`.
16. **No-clock option.** Rooms can run with no game clock and/or no move clock (classroom use).

## Accounts, ratings and data

17. **Guest-first accounts.** A persistent guest (random name like "Keen Tarsier 42", rating 1200) on first
    visit; a password turns it into an account you can sign in to elsewhere. No email, no recovery, no
    OAuth.
18. **Names are unique** (case-insensitive), 3–20 characters: letters, digits, space, `_`, `-`.
19. **Guests can play rated games.** Quick matches are rated; custom rooms default to casual.
20. **Elo**, start 1200, K = 32 for the first 30 rated games, then 20. **Games that end before both sides
    have moved never count for rating** (stops resign-farming).
21. **Results are public.** Profiles list every finished game (rated or not), and the lobby shows the latest
    finished games when your own history is empty. If private-room results should stay private, see the
    open questions.
22. **SQLite via Node's built-in `node:sqlite`** (no native module). File at `DATABASE_PATH` (default
    `data/scidama.db`). On Render's free tier the disk is ephemeral: attach a persistent disk, or swap
    `server/db.ts` for Postgres (the repo object it returns is the only DB surface).
23. **Live rooms are in memory.** A restart drops games in progress (finished games are saved). One
    instance only; scaling out needs the Socket.IO Redis adapter and shared room state.
24. **Rate limits:** 10 new guests/minute and 8 login attempts/minute per IP; 15 socket events/second per
    connection; chat 1 message per 0.7 s per player. `TRUST_PROXY` controls whether the client IP comes
    from `X-Forwarded-For` (on by default in production — correct behind Render's proxy).

## Design

25. **Style: taste-skill "true-black flat"** (dark), dealt with seed 329759039, with a warm near-black
    ground, an amber data hue and the felt-green board of the original. No light theme. Tokens:
    `client/src/styles/tokens.css`; rules: `DESIGN.md`.
26. **Flat SVG chips are the default piece set**; the original chip art is kept as "Classic" (downscaled
    from 1080 px PNG to 160 px WebP: ~24 MB → 336 KB). Board themes: Felt (default), Slate, Original.
27. **Operator and crown PNGs replaced** by SVG drawn in code.
28. **Design gate results:** taste-skill lint 0 FAIL / 0 WARN; inspector 0 FAIL on every screen. The
    remaining WARNs are listed with reasons in `DESIGN.md` §11 (mostly the board itself counting as
    "colour" and "icons").

## Title screen (added 2026-10-23)

29a. **`/` is now a game title screen; the lobby moved to `/play`.** Every "back to the lobby" link and the
     top bar's Play link point to `/play`; the logo goes to the title.
29b. **Design direction "one motif"** (taste-skill page route, seed 575637363): the notched chip, a screen
     wide, in the amber accent — amber at large scale only on this screen. The dealt hero ("tabbed folder
     stack") was redrawn because folder tabs would add a second shape to a one-motif page; the hero follows
     the direction's own composition instead. Details: `DESIGN.md` §13.
29c. **Quick match from the title queues the Standard preset** (20 min, 60 s a move) and lands on `/play`
     already searching. *Change:* the `quick` state in `pages/Title.tsx` → `menu`.
29d. **"Play a friend" opens the create-room dialog** on `/play` rather than creating a room silently, so
     the clock and sides can be chosen first.
29e. **The demo game is bot against bot in the browser** (medium against easy, alternating sides per
     round), never makes sound on its own, pauses off screen, and holds a still position under reduced
     motion. "Play from here" hands the position to the bot page with you as the side to move.
29f. **Two short sections below the title** ("From title screen to table" and a paragraph about the ways
     to play, with the Damath origin: Jesus Huenda, Sorsogon, first tournament 1980 — from Wikipedia).
     Delete `FlowSection` / `WaysSection` in `pages/Title.tsx` for a single-screen title.
29g. **The spilled chips are the original 1080 px artwork**, recompressed to 320 px WebP in
     `client/public/art/` (216 KB total).

## Engineering

29. **Rewrite rather than refactor.** The original kept game state in the DOM and trusted clients; it could
    not be made server-authoritative incrementally. Rules were ported 1:1 into `shared/engine.ts` with
    tests (`docs/ANALYSIS.md` lists what was kept and which bugs were fixed).
30. **Legacy files deleted** (`main.js`, `src/`); they remain in git history at commit `494c197`.
31. **Node runs the server's TypeScript directly** (type stripping) — no server build step. Developed and
    tested on Node 26; `engines` says ≥ 22.18, which has the needed features but was not tested here.
32. **Dependencies pinned to releases at least two weeks old**, installed with `--ignore-scripts` (no
    package needs install scripts). Supply-chain caution after the malware incident on this machine.
33. **The bot runs in the browser** (Web Worker); hard thinks up to ~1 s. Bench: hard beat medium 11/12,
    medium beat easy 6/6.
34. **Nothing was committed or pushed.** All changes are in the working tree of `~/Projects/Cyclic` on
    `main`. Suggested: review, then commit on a branch.

## Not done (worth considering next)

- Tournaments / arenas, friends lists and direct challenges, in-game emotes beyond quick chat phrases.
- Moderation: mute/report in chat, profanity filter, admin tools.
- Account recovery (email), OAuth sign-in.
- Filipino (Tagalog) translation of the interface.
- Server-side bot opponents in quick match when nobody is waiting.
- Puzzles ("find the best capture") built from saved games.
- A light theme.

## Open questions for you

1. **Negative scores:** keep "below zero scores nothing", or score negatives like integer Damath?
2. **Running out of move time:** keep "loses the game", or auto-play a move / give a strike first?
3. **Privacy of results:** should games from invite-only rooms be hidden from profiles and the lobby's
   "just finished" list?
4. **Hosting:** Render as before? If so, with a persistent disk, or should the DB move to Postgres?
5. **Identity:** are guest accounts plus optional passwords enough, or do you want email / Google sign-in?
6. **Language:** add a Tagalog translation for students?
7. **Name:** the product is called Scidama in the UI and the repo is Cyclic — keep both?
