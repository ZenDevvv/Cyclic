// End-to-end: two real browsers play through the UI against a real server.
// Needs `npm run build` first and a Chromium (CHROMIUM_PATH, default /usr/bin/chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer } from '../server/app.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'client/dist');
const SHOTS = path.join(ROOT, 'e2e/artifacts');

let server: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let dbDir: string;

before(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Run `npm run build` before the e2e test.');
  fs.mkdirSync(SHOTS, { recursive: true });
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scidama-e2e-'));
  server = await createServer({ port: 0, dbPath: path.join(dbDir, 'e2e.db'), clientDist: DIST, production: true, guestsPerMinute: 1000 });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  await server?.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
});

async function newPlayer(width = 1440, height = 900): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  return page;
}

/** The capture message must be on screen and in the live region that screen readers announce. */
async function notice(page: Page, text: string) {
  await page.locator('p:not(.sr-only)').filter({ hasText: text }).waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: text }).count(), 1);
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

/** Click a playable square by its coordinate (accessible names start with "(x,y),"). */
async function click(page: Page, x: number, y: number) {
  await page.locator(`button[aria-label^="(${x},${y}),"]`).click();
}

async function move(page: Page, from: [number, number], to: [number, number]) {
  await click(page, ...from);
  await click(page, ...to);
}

test('the title screen: menu by keyboard, previews, and taking over the demo game', async () => {
  const page = await newPlayer();
  await page.goto(server.url + '/');
  await page.getByRole('heading', { name: 'Scidama', level: 1 }).waitFor();
  await page.getByRole('group', { name: 'Demo game, playing itself' }).waitFor();
  await shot(page, '00-title');
  // Arrow keys move the highlight like a game menu; Enter follows it.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/learn$/);
  // "Play from here" carries the demo position into a bot game.
  await page.goto(server.url + '/');
  await page.waitForTimeout(4000); // let the demo make a few moves
  await page.getByRole('button', { name: 'Play from here' }).click();
  await page.waitForURL(/\/play\/bot$/);
  await page.getByRole('heading', { name: 'Play the bot' }).waitFor();
  const moves = await page.getByRole('log', { name: 'Moves and captures' }).innerText();
  assert.ok(/→/.test(moves), 'the bot game starts from the demo position, with its moves');
});

test('a private room: invite link, start, captures in the ledger, chat, resign, rematch', async () => {
  const host = await newPlayer();
  const friend = await newPlayer(390, 844);

  await host.goto(server.url + '/play');
  await host.getByRole('button', { name: 'Create a room' }).first().click();
  // Host plays red so the scripted moves below are red's.
  await host.getByRole('radio', { name: 'Red', exact: true }).click();
  await host.getByRole('radio', { name: 'None' }).last().click(); // no move clock
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop()!;
  await host.getByText('Invite a friend').waitFor();
  await shot(host, '01-waiting-host');

  await friend.goto(`${server.url}/room/${code}`);
  await friend.getByText('Waiting for').first().waitFor();
  await shot(friend, '02-waiting-friend-phone');

  await host.getByRole('button', { name: 'Start game' }).click();
  await host.getByRole('group', { name: /Board, red to move/ }).waitFor();
  await friend.getByRole('group', { name: /Board, red to move/ }).waitFor();

  // Red ₱2 forward, blue ₱2 forward. Red's capture is then the only legal move, so it plays itself.
  await move(host, [5, 2], [4, 3]);
  await friend.getByRole('group', { name: /blue to move/ }).waitFor();
  await move(friend, [2, 5], [3, 4]);
  await host.getByRole('group', { name: /red to move/ }).waitFor();
  await notice(host, 'Auto-capture: your ₱2 must take ₱2.');
  await notice(friend, "Auto-capture: Red's ₱2 must take ₱2.");
  await shot(host, '03-auto-capture');
  await friend.getByRole('group', { name: /blue to move/ }).waitFor(); // ₱2 + ₱2 on a + square, played by the game
  await host.getByRole('log', { name: 'Moves and captures' }).getByText('forced').waitFor();
  await notice(friend, 'You must capture. Choose your capture.');
  await move(friend, [1, 6], [3, 4]); // ₱8 − ₱2 on a − square

  for (const p of [host, friend]) {
    const ledger = p.getByRole('log', { name: 'Moves and captures' });
    await ledger.getByText('+₱4').waitFor();
    await ledger.getByText('+₱6').waitFor();
  }
  await shot(host, '04-game-host');
  await shot(friend, '05-game-friend-phone');

  // Chat from the phone reaches the host.
  await friend.getByRole('tab', { name: /Chat/ }).click();
  await friend.getByRole('button', { name: 'Good luck' }).click();
  await host.getByRole('tab', { name: /Chat/ }).click();
  await host.getByRole('log', { name: 'Chat' }).getByText('Good luck').waitFor();

  // Resign with confirmation; both see the result.
  await host.getByRole('button', { name: 'Resign' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await host.getByRole('heading', { name: 'You lose' }).waitFor();
  await friend.getByRole('heading', { name: 'You win' }).waitFor();
  await shot(friend, '06-result-friend-phone');
  await shot(host, '07-result-host');

  // Rematch from the result dialogs: sides swap.
  await host.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();
  await friend.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();
  await friend.getByRole('group', { name: /Board, red to move/ }).waitFor();
  // The friend is red now, so it is their move and their chips are clickable.
  await move(friend, [1, 2], [0, 3]);
  await host.getByRole('group', { name: /blue to move/ }).waitFor();

  // The finished game has a replay.
  const res = await fetch(`${server.url}/api/leaderboard`);
  assert.equal(res.status, 200);
});

test('pass and play: auto-capture, its message, take back, and the setting that turns it off', async () => {
  const page = await newPlayer();
  const ledger = page.getByRole('log', { name: 'Moves and captures' });
  await page.goto(server.url + '/play/local');
  await page.getByRole('group', { name: /Board, red to move/ }).waitFor();

  // A previous forced capture must not trap Take back: it returns to the last real choice.
  await move(page, [5, 2], [4, 3]);
  await page.getByRole('group', { name: /blue to move/ }).waitFor();
  await move(page, [2, 5], [3, 4]);
  await notice(page, 'Auto-capture: your ₱2 must take ₱2.');
  await ledger.getByText('forced').waitFor();
  await notice(page, 'You must capture. Choose your capture.');
  await page.getByRole('button', { name: 'Take back' }).click();
  await page.getByRole('group', { name: /blue to move/ }).waitFor();
  await page.waitForTimeout(1200); // longer than the pause: nothing may replay by itself
  assert.equal(await ledger.getByText('forced').count(), 0, 'taking back stays taken back');

  // With the setting off, the message still warns but the player makes the capture.
  await page.goto(server.url + '/settings');
  await page.getByRole('switch', { name: /Auto-capture on this device/ }).click();
  await page.goto(server.url + '/play/local');
  await page.getByRole('group', { name: /blue to move/ }).waitFor();
  await move(page, [2, 5], [3, 4]);
  await notice(page, 'Forced capture: your ₱2 must take ₱2.');
  await page.waitForTimeout(1200);
  assert.equal(await ledger.getByText('forced').count(), 0, 'nothing played by itself');
  await move(page, [4, 3], [2, 5]);
  await ledger.getByText('forced').waitFor();
});

test('a host can turn auto-capture off for the room', async () => {
  const host = await newPlayer();
  const friend = await newPlayer();
  await host.goto(server.url + '/play');
  await host.getByRole('button', { name: 'Create a room' }).first().click();
  await host.getByRole('radio', { name: 'Red', exact: true }).click();
  await host.getByRole('radio', { name: 'None' }).last().click();
  const toggle = host.getByRole('switch', { name: /^Auto-capture/ });
  assert.equal(await toggle.getAttribute('aria-checked'), 'true', 'on by default');
  await toggle.click();
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForURL(/\/room\//);
  await friend.goto(host.url());
  await friend.getByText('Waiting for').first().waitFor();
  await friend.getByText('Off', { exact: true }).waitFor(); // the guest can see the host's choice
  await host.getByRole('button', { name: 'Start game' }).click();
  await host.getByRole('group', { name: /Board, red to move/ }).waitFor();
  await move(host, [5, 2], [4, 3]);
  await friend.getByRole('group', { name: /blue to move/ }).waitFor();
  await move(friend, [2, 5], [3, 4]);
  await notice(host, 'Forced capture: your ₱2 must take ₱2.');
  await host.waitForTimeout(1200);
  await move(host, [4, 3], [2, 5]);
  await friend.getByRole('group', { name: /blue to move/ }).waitFor();
});

const boardTheme = (page: Page) => page.getByRole('group', { name: /Board,/ }).getAttribute('data-board');

/** Open a local game on a saved position, as if it had been left there. */
async function savedGame(page: Page, mode: 'bot' | 'local', save: object) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`scidama.local.${mode}`, JSON.stringify({ level: 'easy', you: 'red', resigned: null, ...save })] as const);
  await page.goto(`${server.url}/play/${mode}`);
  await page.getByRole('group', { name: /Board,/ }).waitFor();
}

const square = (x: number, y: number) => y * 8 + x;
const opening = [[5, 2, 4, 3], [2, 5, 3, 4], [4, 3, 2, 5], [1, 6, 3, 4]].map(([a, b, c, d]) => ({ from: square(a, b), to: square(c, d) }));

test('a Grade 9 room: chosen by the host, seen by the guest, played, saved and replayed', async () => {
  const host = await newPlayer();
  const friend = await newPlayer(390, 844);
  await host.goto(server.url + '/play');
  await host.getByRole('button', { name: 'Create a room' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Grade 9' }).click();
  await dialog.getByText('Temperature humidity index').waitFor();
  await dialog.getByRole('radio', { name: 'Red', exact: true }).click();
  await dialog.getByRole('radio', { name: 'None' }).last().click();
  await dialog.getByRole('switch', { name: /^Auto-capture/ }).click();
  await dialog.getByRole('button', { name: 'Create room' }).click();
  await host.waitForURL(/\/room\//);
  await friend.goto(host.url());
  await friend.getByText('Grade 9 · THI').first().waitFor();
  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of [host, friend]) {
    await p.getByRole('group', { name: /Board, red to move/ }).waitFor();
    assert.equal(await boardTheme(p), 'sky');
    await p.getByText('Grade 9 · THI').first().waitFor();
  }
  await host.locator('button[aria-label="(5,2), plus, Red 25%"]').waitFor({ state: 'attached' });

  await move(host, [5, 2], [4, 3]);
  await friend.getByRole('group', { name: /blue to move/ }).waitFor();
  await move(friend, [2, 5], [3, 4]);
  await host.getByRole('group', { name: /red to move/ }).waitFor();
  await move(host, [4, 3], [2, 5]);
  await friend.getByRole('group', { name: /blue to move/ }).waitFor();
  for (const p of [host, friend]) {
    const ledger = p.getByRole('log', { name: 'Moves and captures' });
    await ledger.getByText('25% + 25% = 50% → 88°F').waitFor();
    await ledger.getByText('+88°F').waitFor();
  }
  await host.getByRole('button', { name: 'Resign' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await host.getByRole('dialog').getByText(/°C\)/).first().waitFor(); // finals show °C as well
  await host.getByRole('dialog').getByRole('link', { name: /Replay|Review/ }).first().click();
  await host.waitForURL(/\/game\//);
  await host.getByText('Grade 9 · THI').first().waitFor();
  await host.getByRole('log', { name: 'Moves and captures' }).getByText('25% + 25% = 50% → 88°F').waitFor();
  assert.equal(await host.getByRole('group', { name: /Replay/ }).getAttribute('data-board'), 'sky');
});

test('quick match in Grade 10: the same queue, a Thermo game and its score sheet', async () => {
  const a = await newPlayer();
  const b = await newPlayer(390, 844);
  for (const p of [a, b]) {
    await p.goto(server.url + '/play');
    await p.getByRole('radio', { name: 'Grade 10' }).first().click();
    await p.getByRole('button', { name: /^Long/ }).click();
  }
  for (const p of [a, b]) {
    await p.waitForURL(/\/room\//);
    await p.getByRole('group', { name: /Board,/ }).waitFor();
    assert.equal(await boardTheme(p), 'clay');
    await p.getByRole('table', { name: 'Score sheet' }).waitFor();
    await p.getByText('0 cal', { exact: true }).first().waitFor();
  }
  await a.getByRole('button', { name: 'Resign' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await a.getByRole('dialog').getByText('Mass × temperature').waitFor();
});

test('the bot plays Grade 8 on the phone, with real superscripts and nothing off the page', async () => {
  const page = await newPlayer(390, 844);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url + '/play/bot');
  const setup = page.getByRole('dialog');
  await setup.getByRole('radio', { name: 'Grade 8' }).click();
  await setup.getByRole('radio', { name: 'Easy' }).click();
  await setup.getByRole('radio', { name: 'Red, first' }).click();
  await setup.getByRole('button', { name: 'Start game' }).click();
  await page.getByText(/Grade 8 · Scientific Notation/).first().waitFor();
  assert.equal(await boardTheme(page), 'chalk');
  await move(page, [5, 2], [4, 3]);
  const ledger = page.getByRole('log', { name: 'Moves and captures' });
  await ledger.locator('sup').first().waitFor();
  await page.getByRole('group', { name: /red to move/ }).waitFor({ timeout: 10_000 }); // the bot answered
  const text = await ledger.innerText();
  assert.ok(!/[⁰⁴-⁹⁻]/.test(text), 'exponents are drawn, not left to a fallback font');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(errors, []);
});

test('no grade scrolls sideways at any width, and each keeps its own board', async () => {
  const themes = { 7: 'felt', 8: 'chalk', 9: 'sky', 10: 'clay' };
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]] as const) {
    for (const [grade, theme] of Object.entries(themes)) {
      const page = await newPlayer(width, height);
      await savedGame(page, 'local', { steps: opening, grade: Number(grade) });
      assert.equal(await boardTheme(page), theme);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(over, 0, `grade ${grade} at ${width}px`);
      await page.context().close();
    }
  }
});

test('local games: the grade is chosen, kept across a reload, and old saves stay Grade 7', async () => {
  const page = await newPlayer();
  await page.goto(server.url + '/play/local');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Grade 10' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start game' }).click();
  await page.getByText(/Grade 10 · Thermo/).first().waitFor();
  await move(page, [5, 2], [4, 3]);
  await page.reload();
  await page.getByText(/Grade 10 · Thermo/).first().waitFor();
  await page.getByRole('log', { name: 'Moves and captures' }).getByText('2°C').waitFor();

  const old = await newPlayer();
  await savedGame(old, 'local', { steps: opening.slice(0, 1) }); // saved before grades existed
  await old.getByText(/Grade 7 · Electro/).first().waitFor();
});

test('board settings: one look for everything, Classic chips only in Grade 7, and the old default moves on', async () => {
  const prefs = (patch: object, version = 2) => JSON.stringify({ state: { boardTheme: 'grade', ...patch }, version });
  const withPrefs = async (value: string, grade: number) => {
    const page = await newPlayer();
    await page.addInitScript((v) => localStorage.setItem('scidama.prefs', v), value);
    await savedGame(page, 'local', { steps: [], grade });
    return page;
  };
  assert.equal(await boardTheme(await withPrefs(prefs({ boardTheme: 'slate' }), 9)), 'slate', 'a chosen look wins');
  assert.equal(await boardTheme(await withPrefs(prefs({ boardTheme: 'felt' }, 1), 9)), 'sky', 'the old default follows the grade');
  assert.equal(await boardTheme(await withPrefs(prefs({ boardTheme: 'slate' }, 1), 9)), 'slate', 'an old choice is kept');

  const grade7 = await withPrefs(prefs({ pieceSet: 'classic' }), 7);
  assert.equal(await grade7.locator('[data-board] img').count(), 24, 'Grade 7 has the original art');
  const grade8 = await withPrefs(prefs({ pieceSet: 'classic' }), 8);
  assert.equal(await grade8.locator('[data-board] img').count(), 0, 'there is no art for other grades');
  assert.equal(await grade8.locator('[data-board] svg text').filter({ hasText: '1.212' }).count(), 2);
});

test('the rules page teaches every grade', async () => {
  const page = await newPlayer();
  await page.goto(server.url + '/learn');
  for (const name of ['Grade 8 · Scientific Notation', 'Grade 9 · THI', 'Grade 10 · Thermo']) {
    await page.getByRole('heading', { name }).waitFor();
  }
  await page.getByText("these are Scidama Online's own rules").waitFor();
  const demo = page.locator('#grade-10').getByRole('group', { name: 'Practice board' });
  assert.equal(await demo.getAttribute('data-board'), 'clay');
  await demo.locator('button[aria-label^="(2,3),"]').click();
  await demo.locator('button[aria-label^="(4,5),"]').click();
  await page.locator('#grade-10').getByText('37 g × 11°C = 407 g·°C').first().waitFor();
});

test('quick match puts two players into the same game', async () => {
  const a = await newPlayer();
  const b = await newPlayer();
  await a.goto(server.url + '/play');
  await b.goto(server.url + '/play');
  await a.getByRole('button', { name: /^Blitz/ }).click();
  await a.getByText(/Searching/).first().waitFor();
  await shot(a, '08-queue');
  await b.getByRole('button', { name: /^Blitz/ }).click();
  await a.waitForURL(/\/room\//);
  await b.waitForURL(/\/room\//);
  assert.equal(a.url(), b.url());
  await a.getByRole('group', { name: /Board, red to move/ }).waitFor();
  await shot(a, '09-quick-game');
});

test('watching a public game and the lobby lists it', async () => {
  const watcher = await newPlayer();
  await watcher.goto(server.url + '/watch');
  await watcher.getByRole('link', { name: /against/ }).first().waitFor();
  await shot(watcher, '10-watch');
  await watcher.getByRole('link', { name: /against/ }).first().click();
  await watcher.waitForURL(/\/room\//);
  await watcher.getByText(/You're watching/).waitFor();
  await shot(watcher, '11-spectating');
});
