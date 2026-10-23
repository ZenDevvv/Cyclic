// Fills a running dev server with demo players, finished rated games, two live games and two open rooms,
// so the lobby, Watch, Leaderboard and profiles have something to show. Keeps its sockets open (Ctrl+C
// to stop; the live games and open rooms disappear with it). Local development only.
//
//   npm run dev            # in one terminal
//   npm run seed           # in another (or: node scripts/seed-demo.ts http://localhost:5500)
import { io, type Socket } from 'socket.io-client';
import { legalSteps, type GameState } from '../shared/engine.ts';
import type { AckResult, ClientToServerEvents, RoomSnapshot, ServerToClientEvents, SessionResponse } from '../shared/protocol.ts';

const base = process.argv[2] ?? 'http://localhost:5500';
const NAMES = ['Mara Santos', 'Joaquin Cruz', 'Lia Ramos', 'Paolo Garcia', 'Bea Mendoza', 'Rafa Villanueva', 'Nina Torres', 'Iggy Bautista'];

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
interface Player {
  name: string;
  socket: Client;
  room: RoomSnapshot | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ack = (p: Player, event: keyof ClientToServerEvents, ...args: unknown[]) =>
  new Promise<AckResult<{ code?: string }>>((resolve) => (p.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
async function until(cond: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(10);
  }
}

async function player(name: string): Promise<Player> {
  const session = (await (await fetch(`${base}/api/guest`, { method: 'POST' })).json()) as SessionResponse;
  await fetch(`${base}/api/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name }),
  });
  const socket: Client = io(base, { auth: { token: session.token }, transports: ['websocket'] });
  const p: Player = { name, socket, room: null };
  socket.on('room:state', (r) => (p.room = r));
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  return p;
}

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

async function game(red: Player, blue: Player, opts: { finish: boolean; steps?: number }) {
  const created = await ack(red, 'room:create', { visibility: 'public', settings: { hostSide: 'red', gameMinutes: 0, moveSeconds: 0, rated: true } });
  if (!created.ok || !created.code) throw new Error(created.ok ? 'no code' : created.message);
  await ack(blue, 'room:join', { code: created.code, as: 'player' });
  await ack(red, 'room:start');
  await until(() => red.room?.phase === 'playing');
  const bySide = { red, blue };
  for (let n = 0; red.room!.phase === 'playing' && n < (opts.steps ?? 999); n++) {
    const state: GameState = red.room!.game!.state;
    const legal = legalSteps(state);
    const pick = legal[Math.floor(rand() * legal.length)];
    await sleep(90); // stay under the per-connection rate limit
    await ack(bySide[state.turn], 'game:step', { from: pick.from, to: pick.to });
    await until(() => red.room!.game!.state.stepCount > state.stepCount || red.room!.phase !== 'playing');
  }
  if (!opts.finish) return;
  if (red.room!.phase === 'playing') await ack(rand() < 0.5 ? red : blue, 'game:resign');
  await until(() => red.room!.phase === 'ended');
  await ack(red, 'room:leave');
  await ack(blue, 'room:leave');
}

const players = await Promise.all(NAMES.map(player));
for (const [a, b] of [[0, 1], [2, 3], [0, 2], [1, 3], [4, 5], [0, 4], [6, 7], [2, 5], [0, 3]]) {
  await game(players[a], players[b], { finish: true });
}
await game(players[0], players[1], { finish: false, steps: 14 });
await game(players[2], players[3], { finish: false, steps: 9 });
await ack(players[4], 'room:create', { visibility: 'public', settings: { gameMinutes: 20, moveSeconds: 60, rated: true } });
await ack(players[6], 'room:create', { visibility: 'public', settings: { gameMinutes: 10, moveSeconds: 30, hostSide: 'blue', maxCapture: true } });
console.log(`Seeded ${base}: 9 finished games, 2 live games, 2 open rooms. Ctrl+C to stop.`);
