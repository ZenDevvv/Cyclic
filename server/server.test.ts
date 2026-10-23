import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { io as connectClient, type Socket } from 'socket.io-client';
import { createServer } from './app.ts';
import { parseTrustProxy } from './config.ts';
import { applyStep, initialState, legalSteps, replay, type GameState } from '../shared/engine.ts';
import type {
  AckResult,
  ChatMessage,
  ClientToServerEvents,
  GameDetail,
  LobbyState,
  PlayerProfile,
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

const noClock = { gameMinutes: 0, moveSeconds: 0 };

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
    const res = await emit(mover, 'game:step', { from: pick.from, to: pick.to });
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
