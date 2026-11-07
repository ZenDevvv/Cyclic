import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { io as connectClient, type Socket } from 'socket.io-client';
import { createServer } from './app.ts';
import { MIGRATIONS, openRepo, type SaveGameInput } from './db.ts';
import { parseTrustProxy } from './config.ts';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyStep, forcedStep, GRADE_IDS, GRADES, initialState, legalSteps, replay, sq, type GameState, type Grade } from '../shared/engine.ts';
import { decodeBoard } from '../shared/codec.ts';
import { AUTO_CAPTURE_MS } from '../shared/presets.ts';
import type {
  AckResult,
  ChatMessage,
  ClientToServerEvents,
  GameDetail,
  LobbyState,
  PlayerProfile,
  QueueState,
  RoomSnapshot,
  ServerToClientEvents,
  SessionResponse,
} from '../shared/protocol.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof createServer>>;
const sockets: Client[] = [];

before(async () => {
  server = await createServer({
    port: 0,
    dbPath: ':memory:',
    clientDist: null,
    timeScale: 0.01, // 60 s move clock → 600 ms, 90 s reconnect grace → 900 ms
    matchmaking: { widenEveryMs: 50 },
    guestsPerMinute: 10_000,
  });
});

after(async () => {
  for (const s of sockets) s.disconnect();
  await server.close();
});

async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(server.url + '/api' + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  });
  return { status: res.status, body: (await res.json()) as T };
}

const guest = async () => (await api<SessionResponse>('/guest', { method: 'POST' })).body;

interface Player {
  token: string;
  id: string;
  name: string;
  socket: Client;
  room: RoomSnapshot | null;
  chat: ChatMessage[];
  seat: string | null;
}

async function player(existing?: { token: string; id: string; name: string }): Promise<Player> {
  let g = existing;
  if (!g) {
    const s = await guest();
    g = { token: s.token, id: s.me.id, name: s.me.name };
  }
  const socket: Client = connectClient(server.url, { auth: { token: g.token }, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const p: Player = { token: g.token, id: g.id, name: g.name, socket, room: null, chat: [], seat: null };
  socket.on('room:state', (r) => {
    p.room = r;
  });
  socket.on('chat:message', (m) => p.chat.push(m));
  const seated = new Promise<void>((resolve) =>
    socket.once('session:seat', (s) => {
      p.seat = s.code;
      resolve();
    }),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  await seated;
  return p;
}

function emit<T extends object = object>(p: Player, event: keyof ClientToServerEvents, ...args: unknown[]): Promise<AckResult<T>> {
  return new Promise((resolve) => (p.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
}

async function until(cond: () => boolean, ms = 3000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Scripted games make every move themselves; auto-capture has its own tests below.
const noClock = { gameMinutes: 0, moveSeconds: 0, autoCapture: false };
const autoOn = { ...noClock, autoCapture: true };

async function pair(settings: object = noClock, visibility: 'public' | 'private' = 'private') {
  const host = await player();
  const guestP = await player();
  const created = await emit<{ code: string }>(host, 'room:create', { visibility, settings: { hostSide: 'red', ...settings } });
  assert.ok(created.ok);
  const code = (created as { code: string }).code;
  const joined = await emit<{ role: string }>(guestP, 'room:join', { code, as: 'player' });
  assert.deepEqual(joined, { ok: true, role: 'player' });
  return { host, guest: guestP, code };
}

async function started(settings: object = noClock) {
  const p = await pair(settings);
  assert.deepEqual(await emit(p.host, 'room:start'), { ok: true });
  await until(() => p.guest.room?.phase === 'playing' && p.host.room?.phase === 'playing', 3000, 'game start');
  return p;
}

const stateOf = (p: Player): GameState => p.room!.game!.state;

// ------------------------------------------------------------------ REST

test('REST: guest session, rename, password, login, logout', async () => {
  const g = await guest();
  assert.match(g.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(g.me.rating, 1200);
  const me = await api<{ name: string }>('/me', { token: g.token });
  assert.equal(me.body.name, g.me.name);

  const bad = await api('/me', { method: 'PATCH', token: g.token, body: JSON.stringify({ name: 'x' }) });
  assert.equal(bad.status, 400);
  const renamed = await api<{ name: string }>('/me', { method: 'PATCH', token: g.token, body: JSON.stringify({ name: '  Ada   Lovelace ' }) });
  assert.equal(renamed.body.name, 'Ada Lovelace');
  const other = await guest();
  const clash = await api<{ error: string }>('/me', { method: 'PATCH', token: other.token, body: JSON.stringify({ name: 'ada lovelace' }) });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error, 'name_taken');

  const pw = await api<{ hasPassword: boolean }>('/me/password', { method: 'POST', token: g.token, body: JSON.stringify({ password: 'correct horse' }) });
  assert.equal(pw.body.hasPassword, true);
  const wrong = await api('/login', { method: 'POST', body: JSON.stringify({ name: 'Ada Lovelace', password: 'nope nope' }) });
  assert.equal(wrong.status, 401);
  const login = await api<SessionResponse>('/login', { method: 'POST', body: JSON.stringify({ name: 'ADA LOVELACE', password: 'correct horse' }) });
  assert.equal(login.body.me.id, g.me.id);
  assert.notEqual(login.body.token, g.token);

  assert.equal((await api('/logout', { method: 'POST', token: login.body.token })).status, 200);
  assert.equal((await api('/me', { token: login.body.token })).status, 401);
  assert.equal((await api('/me', { token: g.token })).status, 200, 'other sessions survive');
  assert.equal((await api('/me')).status, 401);
  assert.equal((await api('/nope')).status, 404);
});

test('sockets reject a missing or bad token', async () => {
  const s: Client = connectClient(server.url, { auth: { token: 'bogus' }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  const err = await new Promise<Error>((resolve) => s.once('connect_error', resolve));
  assert.equal(err.message, 'unauthorized');
  s.disconnect();
});

// ------------------------------------------------------------------ rooms

test('create, join, start; host is red; turn order and legality enforced', async () => {
  const { host, guest: g, code } = await pair();
  assert.equal(host.room?.code, code);
  assert.equal(host.room?.seats.red?.user.id, host.id);
  assert.equal(g.room?.seats.blue?.user.id, g.id);
  assert.equal((await emit(g, 'room:start')) .ok, false, 'only the host starts');
  assert.deepEqual(await emit(host, 'room:start'), { ok: true });
  await until(() => g.room?.phase === 'playing');
  assert.equal(g.room?.full, true);
  assert.deepEqual(g.room?.game?.records, []);

  const notYours = await emit(g, 'game:step', { from: 41, to: 32 });
  assert.equal((notYours as { error: string }).error, 'not_your_turn');
  const illegal = await emit(host, 'game:step', { from: 17, to: 33 });
  assert.equal((illegal as { error: string }).error, 'illegal');
  const garbage = await emit(host, 'game:step', { from: 'a', to: 99 });
  assert.equal((garbage as { error: string }).error, 'invalid');

  const first = legalSteps(stateOf(host))[0];
  assert.deepEqual(await emit(host, 'game:step', { from: first.from, to: first.to }), { ok: true });
  await until(() => g.room?.game?.state.turn === 'blue');
  assert.equal(g.room?.game?.lastStep?.from, first.from);
  assert.equal(g.room?.full, false);
  assert.equal(g.room?.game?.records, undefined, 'incremental snapshots carry only the last step');
});

test('a full game plays to a saved result and updates both records', async () => {
  const { host, guest: g } = await started();
  const bySide = { red: host, blue: g };
  let guard = 0;
  while (host.room?.phase === 'playing' && guard++ < 600) {
    const s = stateOf(host);
    const mover = bySide[s.turn];
    const legal = legalSteps(s);
    const pick = legal[guard % legal.length];
    const before = s.stepCount;
    let res = await emit(mover, 'game:step', { from: pick.from, to: pick.to });
    while (!res.ok && res.error === 'rate_limited') {
      await new Promise((r) => setTimeout(r, 100)); // this loop plays faster than any person
      res = await emit(mover, 'game:step', { from: pick.from, to: pick.to });
    }
    assert.equal(res.ok, true, JSON.stringify(res));
    await until(() => (host.room?.game?.state.stepCount ?? 0) > before || host.room?.phase === 'ended');
  }
  if (host.room?.phase === 'playing') {
    assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
  }
  await until(() => !!host.room?.game?.savedId, 3000, 'saved id');
  const savedId = host.room!.game!.savedId!;
  const saved = await api<GameDetail>(`/games/${savedId}`);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.red.id, host.id);
  assert.equal(saved.body.rated, false);
  // The saved steps replay to the same final position.
  assert.deepEqual(replay(saved.body.steps).state.board, stateOf(host).board);
  assert.ok(stateOf(g).result);
  const latest = await api<{ id: string }[]>('/games?limit=3');
  assert.ok(latest.body.some((x) => x.id === savedId));
  const profile = await api<PlayerProfile>(`/players/${g.id}`);
  assert.equal(profile.body.user.games, 1);
  assert.equal(profile.body.recent[0].id, savedId);
});

test('spectators get state but cannot move; private rooms stay off the lobby', async () => {
  const { host, code } = await started();
  const watcher = await player();
  const lobby: LobbyState[] = [];
  watcher.socket.on('lobby:state', (l) => lobby.push(l));
  watcher.socket.emit('lobby:subscribe');
  await until(() => lobby.length > 0);
  assert.ok(!lobby.at(-1)!.live.some((r) => r.code === code), 'private game not listed');

  const res = await emit<{ role: string }>(watcher, 'room:join', { code, as: 'player' });
  assert.deepEqual(res, { ok: true, role: 'spectator' }, 'a full room seats you as a spectator');
  await until(() => watcher.room?.code === code);
  const step = legalSteps(stateOf(host))[0];
  const denied = await emit(watcher, 'game:step', { from: step.from, to: step.to });
  assert.equal((denied as { error: string }).error, 'forbidden');
  await until(() => (host.room?.spectators.length ?? 0) === 1);
});

test('public waiting rooms appear in the lobby and disappear when full', async () => {
  const watcher = await player();
  let lobby: LobbyState | null = null;
  watcher.socket.on('lobby:state', (l) => (lobby = l));
  watcher.socket.emit('lobby:subscribe');
  const host = await player();
  const created = (await emit<{ code: string }>(host, 'room:create', { visibility: 'public', settings: {} })) as { code: string };
  await until(() => !!lobby?.open.some((r) => r.code === created.code), 3000, 'room listed');
  const g = await player();
  await emit(g, 'room:join', { code: created.code, as: 'player' });
  await until(() => !lobby?.open.some((r) => r.code === created.code), 3000, 'room unlisted');
  await emit(host, 'room:start');
  await until(() => !!lobby?.live.some((r) => r.code === created.code), 3000, 'live listed');
  const live = lobby!.live.find((r) => r.code === created.code)!;
  assert.equal(live.board.length, 32);
});

test('host settings: only the host, only while waiting; side choice moves the host', async () => {
  const { host, guest: g } = await pair();
  assert.equal((await emit(g, 'room:settings', { settings: { rated: true } })).ok, false);
  assert.equal((await emit(host, 'room:settings', { settings: { gameMinutes: 7 } })).ok, false, 'invalid values rejected');
  assert.deepEqual(await emit(host, 'room:settings', { settings: { hostSide: 'blue', maxCapture: true } }), { ok: true });
  await until(() => g.room?.seats.blue?.user.id === host.id);
  assert.equal(g.room?.seats.red?.user.id, g.id);
  assert.equal(g.room?.settings.maxCapture, true);
});

test('reconnecting with the same token returns the player to their seat', async () => {
  const { host, guest: g, code } = await started();
  g.socket.disconnect();
  await until(() => host.room?.seats.blue?.connected === false, 3000, 'disconnect seen');
  assert.ok(host.room?.seats.blue?.forfeitAt);
  const back = await player({ token: g.token, id: g.id, name: g.name });
  assert.equal(back.seat, code);
  await until(() => host.room?.seats.blue?.connected === true, 3000, 'reconnect seen');
  assert.equal(host.room?.seats.blue?.forfeitAt, null);
  assert.equal(back.room?.phase, 'playing');
  assert.ok(back.room?.full);
});

test('a player who stays away forfeits after the grace period', async () => {
  const { host, guest: g } = await started();
  g.socket.disconnect();
  await until(() => host.room?.phase === 'ended', 4000, 'forfeit');
  assert.equal(host.room?.game?.state.result?.reason, 'abandon');
  assert.equal(host.room?.game?.state.result?.winner, 'red');
});

test('running out of move time loses the game', async () => {
  const { host } = await started({ gameMinutes: 0, moveSeconds: 30 }); // 300 ms at this time scale
  await until(() => host.room?.phase === 'ended', 3000, 'move timeout');
  const result = host.room!.game!.state.result!;
  assert.equal(result.reason, 'timeout');
  assert.equal(result.winner, 'blue', 'red never moved');
});

test('resign, draw offer and decline, rematch swaps sides', async () => {
  const { host, guest: g } = await started();
  assert.deepEqual(await emit(g, 'game:draw-offer'), { ok: true });
  await until(() => host.room?.game?.drawOfferBy === 'blue');
  assert.deepEqual(await emit(host, 'game:draw-answer', { accept: false }), { ok: true });
  await until(() => host.room?.game?.drawOfferBy === null);
  assert.equal((await emit(g, 'game:draw-offer')).ok, false, 'cooldown after a declined offer');
  assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
  await until(() => g.room?.phase === 'ended');
  assert.equal(g.room?.game?.state.result?.winner, 'blue');

  assert.deepEqual(await emit(host, 'game:rematch', { want: true }), { ok: true });
  await until(() => g.room?.game?.rematch.red === true);
  assert.deepEqual(await emit(g, 'game:rematch', { want: true }), { ok: true });
  await until(() => g.room?.phase === 'playing' && g.room?.seats.red?.user.id === g.id, 3000, 'rematch');
  assert.equal(g.room?.seats.blue?.user.id, host.id);
  assert.equal(g.room?.game?.state.stepCount, 0);
});

test('draw by agreement', async () => {
  const { host, guest: g } = await started();
  await emit(host, 'game:draw-offer');
  await until(() => g.room?.game?.drawOfferBy === 'red');
  assert.deepEqual(await emit(g, 'game:draw-answer', { accept: true }), { ok: true });
  await until(() => host.room?.phase === 'ended');
  assert.equal(host.room?.game?.state.result?.reason, 'agreement');
  assert.equal(host.room?.game?.state.result?.winner, null);
});

test('chat reaches everyone in the room and is rate limited', async () => {
  const { host, guest: g } = await started();
  assert.deepEqual(await emit(host, 'chat:send', { text: '  good luck\u0007 ' }), { ok: true });
  await until(() => g.chat.some((m) => m.text === 'good luck' && m.role === 'red'));
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => emit(g, 'chat:send', { text: `spam ${n}` })));
  assert.ok(results.some((r) => !r.ok && r.error === 'rate_limited'));
  assert.equal((await emit(g, 'chat:send', { text: '' })).ok, false);
});

test('one seat per player: a game in progress blocks new rooms', async () => {
  const { host, code } = await started();
  const res = await emit(host, 'room:create', { visibility: 'private', settings: {} });
  assert.equal(res.ok, false);
  assert.equal((res as { error: string; code?: string }).error, 'already_seated');
  assert.equal((res as { code?: string }).code, code);
});

test('leaving a waiting room hands the host to the other player; last one out closes it', async () => {
  const { host, guest: g, code } = await pair();
  const watcher = await player();
  await emit(watcher, 'room:join', { code, as: 'spectator' });
  assert.deepEqual(await emit(host, 'room:leave'), { ok: true });
  await until(() => g.room?.hostId === g.id, 3000, 'host handoff');
  let closed = false;
  watcher.socket.once('room:closed', () => (closed = true));
  await emit(g, 'room:leave');
  await until(() => closed, 3000, 'spectator told the room closed');
  const again = await emit(host, 'room:join', { code, as: 'player' });
  assert.equal((again as { error: string }).error, 'not_found');
});

test('rated games move ratings; instant resignations do not count', async () => {
  const quickResign = await started({ ...noClock, rated: true });
  await emit(quickResign.host, 'game:resign');
  await until(() => !!quickResign.host.room?.game?.savedId);
  assert.equal(quickResign.host.room?.game?.ratingChange, null);

  const { host, guest: g } = await started({ ...noClock, rated: true });
  const s1 = legalSteps(stateOf(host))[0];
  await emit(host, 'game:step', s1);
  await until(() => stateOf(g).turn === 'blue');
  const s2 = legalSteps(stateOf(g))[0];
  await emit(g, 'game:step', s2);
  await until(() => stateOf(host).turn === 'red');
  await emit(g, 'game:resign');
  await until(() => !!host.room?.game?.ratingChange);
  const change = host.room!.game!.ratingChange!;
  assert.equal(change.red.after - change.red.before, 16);
  assert.equal(change.blue.after - change.blue.before, -16);
  const board = await api<{ user: { id: string } }[]>('/leaderboard');
  assert.ok(board.body.some((r) => r.user.id === host.id));
});

test('engine state from the server matches a local replay of the records', async () => {
  const { host, guest: g } = await started();
  for (let i = 0; i < 6; i++) {
    const s = stateOf(host);
    const mover = s.turn === 'red' ? host : g;
    const step = legalSteps(s)[0];
    await emit(mover, 'game:step', { from: step.from, to: step.to });
    await until(() => stateOf(host).stepCount === s.stepCount + 1);
  }
  assert.deepEqual(await emit(g, 'room:sync'), { ok: true });
  await until(() => g.room?.full === true && (g.room.game?.records?.length ?? 0) === 6);
  let local = initialState();
  for (const r of g.room!.game!.records!) local = applyStep(local, r).state;
  assert.deepEqual(local, stateOf(g));
});

// ------------------------------------------------------------------ auto-capture

/** Two quiet moves that leave red's ₱2 with one legal step: taking blue's ₱2. */
async function toForcedCapture(host: Player, g: Player) {
  await emit(host, 'game:step', { from: sq(5, 2), to: sq(4, 3) });
  await until(() => stateOf(g).stepCount === 1, 3000, 'red move');
  await emit(g, 'game:step', { from: sq(2, 5), to: sq(3, 4) });
}

const capture = { from: sq(4, 3), to: sq(2, 5) };

/** Run a test on a server whose clocks are slow enough to act during the auto-capture pause. */
async function withSlowClocks(run: () => Promise<void>) {
  const fast = server;
  server = await createServer({ port: 0, dbPath: ':memory:', clientDist: null, timeScale: 0.5, guestsPerMinute: 10_000 });
  try {
    await run();
  } finally {
    await server.close();
    server = fast;
  }
}

test('auto-capture is on by default and plays a forced capture by itself', async () => {
  const { host, guest: g } = await started({ gameMinutes: 0, moveSeconds: 0 });
  assert.equal(host.room?.settings.autoCapture, true);
  await toForcedCapture(host, g);
  await until(() => stateOf(host).stepCount >= 3, 3000, 'the auto-capture');
  assert.deepEqual(await emit(host, 'room:sync'), { ok: true });
  await until(() => host.room?.full === true && (host.room.game?.records?.length ?? 0) >= 3);
  const record = host.room!.game!.records![2];
  assert.equal(record.forced, true);
  assert.equal(record.from, capture.from);
  assert.equal(record.to, capture.to);
  assert.equal(record.side, 'red');
});

test('the host can turn auto-capture off, and then the player must capture by hand', async () => {
  const { host, guest: g } = await started(noClock);
  assert.equal(g.room?.settings.autoCapture, false);
  await toForcedCapture(host, g);
  await until(() => stateOf(host).stepCount === 2, 3000, 'blue move');
  assert.ok(forcedStep(stateOf(host)), 'the capture is forced');
  await new Promise((r) => setTimeout(r, AUTO_CAPTURE_MS * 0.01 * 10));
  assert.equal(stateOf(host).stepCount, 2, 'nothing played by itself');
  assert.deepEqual(await emit(host, 'game:step', capture), { ok: true });
  await until(() => stateOf(g).stepCount === 3, 3000, 'manual capture');
});

test('auto-capture setting: host only, fixed once the game starts, and validated', async () => {
  const { host, guest: g } = await pair({ gameMinutes: 0, moveSeconds: 0 });
  assert.equal(host.room?.settings.autoCapture, true);
  assert.deepEqual(await emit(host, 'room:settings', { settings: { autoCapture: false } }), { ok: true });
  await until(() => g.room?.settings.autoCapture === false, 3000, 'guest sees the setting');
  const notHost = await emit(g, 'room:settings', { settings: { autoCapture: true } });
  assert.equal(notHost.ok, false);
  const bad = await emit(host, 'room:settings', { settings: { autoCapture: 'yes' } });
  assert.equal(bad.ok, false);
  assert.deepEqual(await emit(host, 'room:start'), { ok: true });
  await until(() => host.room?.phase === 'playing', 3000, 'game start');
  const late = await emit(host, 'room:settings', { settings: { autoCapture: true } });
  assert.equal(late.ok, false);
});

test('a choice of captures is never played for the player', async () => {
  const { host, guest: g } = await started(autoOn);
  await toForcedCapture(host, g);
  await until(() => stateOf(host).stepCount >= 3, 3000, 'red auto-capture');
  // Blue can now retake with two different chips, so the game waits.
  await until(() => stateOf(host).turn === 'blue' && stateOf(host).stepCount === 3, 3000, 'blue to move');
  assert.ok(legalSteps(stateOf(host)).length > 1, 'blue has a choice');
  await new Promise((r) => setTimeout(r, AUTO_CAPTURE_MS * 0.01 * 10));
  assert.equal(stateOf(host).stepCount, 3);
});

test('an auto-capture is saved and replays like any other step', async () => {
  const { host, guest: g } = await started(autoOn);
  await toForcedCapture(host, g);
  await until(() => stateOf(host).stepCount >= 3, 3000, 'the auto-capture');
  assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
  await until(() => !!host.room?.game?.savedId, 3000, 'saved id');
  const saved = await api<GameDetail>(`/games/${host.room!.game!.savedId}`);
  assert.deepEqual(saved.body.steps[2], capture);
  assert.equal(replay(saved.body.steps).records[2].forced, true);
});

test('resigning during the pause cancels the auto-capture', async () => {
  await withSlowClocks(async () => {
    const { host, guest: g } = await started(autoOn);
    await toForcedCapture(host, g);
    await until(() => stateOf(host).stepCount === 2, 3000, 'blue move');
    assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
    await until(() => host.room?.phase === 'ended', 3000, 'game end');
    await new Promise((r) => setTimeout(r, AUTO_CAPTURE_MS * 0.5 + 100));
    assert.equal(stateOf(host).stepCount, 2, 'the capture never played');
  });
});

test('a player can make the forced capture during the pause, and it plays only once', async () => {
  await withSlowClocks(async () => {
    const { host, guest: g } = await started(autoOn);
    await toForcedCapture(host, g);
    await until(() => stateOf(host).stepCount === 2, 3000, 'blue move');
    assert.deepEqual(await emit(host, 'game:step', capture), { ok: true });
    await until(() => stateOf(host).stepCount === 3, 3000, 'manual capture');
    await new Promise((r) => setTimeout(r, AUTO_CAPTURE_MS * 0.5 + 100));
    assert.equal(stateOf(host).stepCount, 3, 'the timer did not play it again');
  });
});

test('capturing by hand cancels the timer, so the next forced capture still gets its full pause', async () => {
  await withSlowClocks(async () => {
    const pause = AUTO_CAPTURE_MS * 0.5;
    const { host, guest: g } = await started(autoOn);
    // Blue's forced capture is followed at once by a forced recapture for red.
    await emit(host, 'game:step', { from: sq(1, 2), to: sq(2, 3) });
    await until(() => stateOf(g).stepCount === 1, 3000, 'red move');
    await emit(g, 'game:step', { from: sq(2, 5), to: sq(3, 4) });
    await until(() => stateOf(host).stepCount === 2, 3000, 'blue move');
    await emit(host, 'game:step', { from: sq(2, 3), to: sq(1, 4) });
    await until(() => stateOf(g).stepCount === 3, 3000, 'red move');
    assert.ok(forcedStep(stateOf(g)), 'blue is forced');

    await new Promise((r) => setTimeout(r, pause * 0.6));
    assert.deepEqual(await emit(g, 'game:step', { from: sq(0, 5), to: sq(2, 3) }), { ok: true });
    await until(() => stateOf(host).stepCount === 4, 3000, 'blue capture');
    assert.ok(forcedStep(stateOf(host)), 'red is forced now');

    // Blue's old timer would have fired by now, cutting red's pause short.
    await new Promise((r) => setTimeout(r, pause * 0.6));
    assert.equal(stateOf(host).stepCount, 4, 'red still has its pause');
    await until(() => stateOf(host).stepCount === 5, 3000, 'red auto-capture');
  });
});

test('an auto-capture does not decline a draw offer the player has not seen', async () => {
  await withSlowClocks(async () => {
    const { host, guest: g } = await started(autoOn);
    await toForcedCapture(host, g);
    await until(() => stateOf(g).stepCount === 2, 3000, 'blue move');
    assert.deepEqual(await emit(g, 'game:draw-offer'), { ok: true });
    await until(() => stateOf(host).stepCount >= 3, 3000, 'the auto-capture');
    assert.equal(host.room?.game?.drawOfferBy, 'blue', 'the offer still stands');
  });
});

test('quick match pairs players of the same grade, and the game is that grade', async () => {
  const a = await player();
  const b = await player();
  assert.deepEqual(await emit(a, 'queue:join', { preset: 'blitz', grade: 10 }), { ok: true });
  assert.deepEqual(await emit(b, 'queue:join', { preset: 'blitz', grade: 10 }), { ok: true });
  await until(() => a.room?.phase === 'playing' && b.room?.phase === 'playing', 3000, 'match');
  assert.equal(a.room?.settings.grade, 10);
  assert.equal(stateOf(a).rules.grade, 10);
  assert.equal(a.room?.settings.rated, true);
  assert.deepEqual(await emit(a, 'game:resign'), { ok: true });
});

test('quick match keeps trying in every grade as the rating window widens', async () => {
  const strong = await guest();
  const weak = await guest();
  const red = { id: strong.me.id, name: strong.me.name, rating: 1200 };
  const blue = { id: weak.me.id, name: weak.me.name, rating: 1200 };
  const ratingChange = { red: { before: 1200, after: 1600 }, blue: { before: 1200, after: 1200 } };
  server.repo.saveGame({ ...savedGame({ red: 0, blue: 0 }, 7), rated: true, red, blue, ratingChange });
  const a = await player({ token: strong.token, id: strong.me.id, name: strong.me.name });
  const b = await player({ token: weak.token, id: weak.me.id, name: weak.me.name });
  await emit(a, 'queue:join', { preset: 'long', grade: 9 });
  await emit(b, 'queue:join', { preset: 'long', grade: 9 });
  const atFirst = a.room;
  assert.equal(atFirst, null, '400 points apart is too far at first');
  await until(() => a.room?.phase === 'playing', 3000, 'the periodic retry to pair them');
  assert.equal(a.room?.settings.grade, 9);
  assert.deepEqual(await emit(a, 'game:resign'), { ok: true });
});

test('quick match never pairs two grades, however long they wait', async () => {
  const a = await player();
  const b = await player();
  let aState: QueueState | null = null;
  a.socket.on('queue:state', (q) => {
    aState = q;
  });
  await emit(a, 'queue:join', { preset: 'long', grade: 8 });
  await emit(b, 'queue:join', { preset: 'long', grade: 9 });
  await until(() => (aState as QueueState | null)?.grade === 8, 3000, 'queue state');
  assert.equal((aState as unknown as QueueState).waiting, 1, 'counts only its own grade');
  await new Promise((r) => setTimeout(r, 1300)); // past a matching tick, with the rating window widened
  assert.equal(a.room, null);
  assert.equal(b.room, null);
  const counts = server.queue.counts();
  assert.equal(counts[8].long, 1);
  assert.equal(counts[9].long, 1);
  assert.equal(counts[7].long, 0);
  await emit(a, 'queue:leave');
  await emit(b, 'queue:leave');
});

test('quick match without a grade means Grade 7, and changing grade restarts the wait', async () => {
  const a = await player();
  const states: QueueState[] = [];
  a.socket.on('queue:state', (q) => states.push(q));
  await emit(a, 'queue:join', { preset: 'standard' });
  await until(() => states.length > 0, 3000, 'queue state');
  assert.equal(states.at(-1)?.grade, 7);
  const first = states.at(-1)!.since!;
  await new Promise((r) => setTimeout(r, 15));
  await emit(a, 'queue:join', { preset: 'standard' });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(states.at(-1)?.since, first, 'joining the same queue keeps your place');
  await emit(a, 'queue:join', { preset: 'standard', grade: 9 });
  await until(() => states.at(-1)?.grade === 9, 3000, 'the new queue');
  assert.ok(states.at(-1)!.since! > first, 'a different queue starts again');
  await emit(a, 'queue:leave');
  await until(() => states.at(-1)?.grade === null, 3000, 'leaving');
});

test('quick-match rooms use auto-capture and the most-chips rule', async () => {
  const a = await player();
  const b = await player();
  await emit(a, 'queue:join', { preset: 'long' });
  await emit(b, 'queue:join', { preset: 'long' });
  await until(() => a.room?.phase === 'playing' && b.room?.phase === 'playing', 3000, 'match');
  assert.equal(a.room?.settings.autoCapture, true);
  assert.equal(stateOf(a).rules.maxCapture, true);
  assert.deepEqual(await emit(a, 'game:resign'), { ok: true });
});

// ------------------------------------------------------------------ grades

const fourMoves = [
  { from: sq(5, 2), to: sq(4, 3) },
  { from: sq(2, 5), to: sq(3, 4) },
  { from: sq(4, 3), to: sq(2, 5) },
  { from: sq(1, 6), to: sq(3, 4) },
];

async function playMoves(host: Player, g: Player, moves: typeof fourMoves) {
  for (const move of moves) {
    const s = stateOf(host);
    assert.deepEqual(await emit(s.turn === 'red' ? host : g, 'game:step', move), { ok: true });
    await until(() => stateOf(host).stepCount === s.stepCount + 1 && stateOf(g).stepCount === s.stepCount + 1, 3000, 'the move');
  }
}

test('rooms default to Grade 7, and the host chooses the grade before the game', async () => {
  const { host, guest: g } = await pair({ gameMinutes: 0, moveSeconds: 0 });
  assert.equal(host.room?.settings.grade, 7);
  assert.deepEqual(await emit(host, 'room:settings', { settings: { grade: 9 } }), { ok: true });
  await until(() => g.room?.settings.grade === 9, 3000, 'the guest to see it');
  assert.equal((await emit(g, 'room:settings', { settings: { grade: 8 } })).ok, false, 'only the host');
  assert.deepEqual(await emit(host, 'room:start'), { ok: true });
  await until(() => host.room?.phase === 'playing', 3000, 'game start');
  assert.equal(stateOf(host).rules.grade, 9);
  assert.equal((await emit(host, 'room:settings', { settings: { grade: 10 } })).ok, false, 'fixed once the game starts');
});

test('a grade that does not exist is rejected, not crashed on', async () => {
  const host = await player();
  for (const grade of [6, 11, 7.5, '7', null, { grade: 7 }]) {
    const res = await emit(host, 'room:create', { visibility: 'private', settings: { grade } });
    assert.equal(res.ok, false, JSON.stringify(grade));
  }
  for (const grade of [6, '9']) assert.equal((await emit(host, 'queue:join', { preset: 'blitz', grade })).ok, false, JSON.stringify(grade));
});

test('each grade starts with its own chips and scores on the server', async () => {
  const expected: Record<Grade, { columns: object; scores: { red: number; blue: number } }> = {
    7: { columns: { red: { P: 4 }, blue: { P: 6 } }, scores: { red: 4, blue: 6 } },
    8: { columns: { red: { sci: 440 }, blue: { sci: 8.8e8 - 2.2e2 } }, scores: { red: 440, blue: 8.8e8 - 2.2e2 } },
    9: { columns: { red: { F: 88 }, blue: { F: 81 } }, scores: { red: 88, blue: 81 } },
    10: { columns: { red: { C: 4 }, blue: { C: 21 } }, scores: { red: 0, blue: 0 } },
  };
  for (const grade of GRADE_IDS) {
    const { host, guest: g } = await started({ ...noClock, grade });
    const { chips } = GRADES[grade];
    const onBoard = stateOf(host).board.filter((p) => p?.side === 'red').map((p) => `${p!.unit}${p!.value}`).sort();
    assert.deepEqual(onBoard, chips.map((c) => `${c.unit}${c.value}`).sort(), `grade ${grade}`);
    await playMoves(host, g, fourMoves);
    assert.deepEqual(stateOf(host).columns, expected[grade].columns, `grade ${grade}`);
    assert.deepEqual(stateOf(host).scores, expected[grade].scores, `grade ${grade}`);
    assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
  }
});

test('a finished game in any grade is saved with its grade and replays', async () => {
  for (const grade of GRADE_IDS) {
    const { host, guest: g } = await started({ ...noClock, grade });
    await playMoves(host, g, fourMoves);
    assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
    await until(() => !!host.room?.game?.savedId, 3000, 'saved id');
    const id = host.room!.game!.savedId!;
    const saved = (await api<GameDetail>(`/games/${id}`)).body;
    assert.equal(saved.grade, grade);
    assert.equal(saved.settings.grade, grade);
    assert.deepEqual(replay(saved.steps, { grade: saved.settings.grade, maxCapture: saved.settings.maxCapture }).state.board, stateOf(host).board);
    const profile = await api<PlayerProfile>(`/players/${host.id}`);
    assert.equal(profile.body.recent[0].grade, grade);
    const latest = await api<{ id: string; grade: Grade }[]>('/games?limit=5');
    assert.equal(latest.body.find((x) => x.id === id)?.grade, grade);
  }
});

test('a rematch keeps the grade', async () => {
  const { host, guest: g } = await started({ ...noClock, grade: 10 });
  assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
  await until(() => host.room?.phase === 'ended', 3000, 'game end');
  await emit(host, 'game:rematch', { want: true });
  await emit(g, 'game:rematch', { want: true });
  await until(() => host.room?.phase === 'playing', 3000, 'rematch');
  assert.equal(stateOf(host).rules.grade, 10);
  assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
});

test('the lobby shows a live game in its own grade', async () => {
  const watcher = await player();
  let lobby: LobbyState | null = null;
  watcher.socket.on('lobby:state', (l) => {
    lobby = l;
  });
  watcher.socket.emit('lobby:subscribe');
  const { host } = await pair({ ...noClock, grade: 8 }, 'public');
  assert.deepEqual(await emit(host, 'room:start'), { ok: true });
  await until(() => host.room?.phase === 'playing', 3000, 'game start');
  await until(() => !!(lobby as LobbyState | null)?.live.some((x) => x.code === host.room?.code), 3000, 'the live game');
  const live = (lobby as unknown as LobbyState).live.find((x) => x.code === host.room?.code)!;
  assert.equal(live.settings.grade, 8);
  assert.deepEqual(decodeBoard(live.board, 8), stateOf(host).board, 'the thumbnail is not blank');
  assert.deepEqual(await emit(host, 'game:resign'), { ok: true });
});

test('rated games move ratings in any grade', async () => {
  const { host, guest: g } = await started({ ...noClock, grade: 9, rated: true });
  await playMoves(host, g, fourMoves.slice(0, 3));
  assert.deepEqual(await emit(g, 'game:resign'), { ok: true });
  await until(() => !!host.room?.game?.ratingChange, 3000, 'rating change');
  const { red, blue } = host.room!.game!.ratingChange!;
  assert.ok(red.after > red.before);
  assert.ok(blue.after < blue.before);
});

// ------------------------------------------------------------------ saving scores

const savedGame = (scores: { red: number; blue: number }, grade: Grade = 8): SaveGameInput => {
  const you = { id: 'nobody', name: 'Nobody', rating: 1200 };
  return {
    roomCode: 'TEST',
    mode: 'custom',
    rated: false,
    red: you,
    blue: you,
    ratingChange: null,
    settings: { grade, gameMinutes: 0, moveSeconds: 0, rated: false, hostSide: 'red', allowSpectators: true, maxCapture: true, autoCapture: true },
    steps: [],
    scores,
    winner: 'red',
    reason: 'time',
    startedAt: 1,
    endedAt: 2,
  };
};

test('every size of score saves and reads back exactly', () => {
  const repo = openRepo(':memory:');
  // The two middle values are past 2^53: an INTEGER column stores them but cannot read them back.
  for (const score of [0, 220.11, 1.212e12, 2 ** 53, 3.2e17, 9.1e18, 2.94e24, 1.111e-11]) {
    const id = repo.saveGame(savedGame({ red: score, blue: score * 2 }));
    assert.deepEqual(repo.getGame(id)?.scores, { red: score, blue: score * 2 }, String(score));
  }
  assert.equal(repo.latestGames(50).length, 8, 'the lists that read every row still work');
  repo.close();
});

test('a database from before grades upgrades and keeps its games', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scidama-migrate-'));
  const file = path.join(dir, 'old.db');
  try {
    const old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]);
    old.exec('PRAGMA user_version = 1');
    old.exec(`INSERT INTO games (id, room_code, mode, rated, red_id, blue_id, red_name, blue_name, red_rating_before, blue_rating_before,
      settings_json, steps_json, step_count, red_score, blue_score, winner, reason, started_at, ended_at)
      VALUES ('g1', 'ROOM', 'custom', 0, 'a', 'b', 'Ana', 'Ben', 1200, 1200,
      '{"gameMinutes":20,"moveSeconds":60,"rated":false,"hostSide":"red","allowSpectators":true,"maxCapture":false}',
      '[[21,28]]', 1, 12, 34, 'red', 'time', 1, 2)`);
    old.close();

    const repo = openRepo(file);
    const game = repo.getGame('g1')!;
    assert.deepEqual(game.scores, { red: 12, blue: 34 });
    assert.equal(game.grade, 7);
    assert.equal(game.settings.grade, 7, 'a missing grade reads as 7');
    assert.equal(game.settings.maxCapture, false, 'the rest of the settings survive');
    assert.equal(game.steps.length, 1);
    const id = repo.saveGame(savedGame({ red: 3.2e17, blue: 0 }, 9));
    assert.equal(repo.getGame(id)?.grade, 9);
    assert.equal(repo.getGame(id)?.scores.red, 3.2e17);
    repo.close();

    const again = openRepo(file);
    assert.equal(again.getGame('g1')?.scores.blue, 34, 'opening it twice changes nothing');
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ matchmaking

test('quick match pairs two queued players into a rated game', async () => {
  const a = await player();
  const b = await player();
  const matched: string[] = [];
  a.socket.on('queue:matched', ({ code }) => matched.push(code));
  b.socket.on('queue:matched', ({ code }) => matched.push(code));
  assert.deepEqual(await emit(a, 'queue:join', { preset: 'blitz' }), { ok: true });
  assert.deepEqual(await emit(b, 'queue:join', { preset: 'blitz' }), { ok: true });
  await until(() => matched.length === 2, 3000, 'match');
  assert.equal(matched[0], matched[1]);
  await until(() => a.room?.code === matched[0] && a.room.phase === 'playing');
  assert.equal(a.room?.mode, 'quick');
  assert.equal(a.room?.settings.rated, true);
  assert.equal(a.room?.settings.moveSeconds, 30);
  const sides = [a.room!.seats.red!.user.id, a.room!.seats.blue!.user.id].sort();
  assert.deepEqual(sides, [a.id, b.id].sort());
});

test('leaving the queue and different presets never match', async () => {
  const a = await player();
  const b = await player();
  let matched = false;
  a.socket.on('queue:matched', () => (matched = true));
  const states: { preset: string | null }[] = [];
  a.socket.on('queue:state', (s) => states.push(s));
  await emit(a, 'queue:join', { preset: 'long' });
  await emit(b, 'queue:join', { preset: 'standard' });
  await until(() => states.some((s) => s.preset === 'long'));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(matched, false);
  await emit(a, 'queue:leave');
  await until(() => states.at(-1)?.preset === null);
  await emit(b, 'queue:leave');
});

test('TRUST_PROXY parsing never trusts everything by accident', () => {
  assert.equal(parseTrustProxy(undefined, true), 1);
  assert.equal(parseTrustProxy('', true), 1);
  assert.equal(parseTrustProxy('', false), false);
  assert.equal(parseTrustProxy('2', false), 2);
  assert.equal(parseTrustProxy('false', true), false);
  assert.equal(parseTrustProxy('yes please', true), false);
});
