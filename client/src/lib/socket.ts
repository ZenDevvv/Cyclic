// One socket per tab. Every server event is written into a store here; components read stores.
import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol.ts';
import { useLobby } from '../store/lobby.ts';
import { addChat, applySnapshot, useRoom } from '../store/room.ts';
import { onTokenChange, useSession } from '../store/session.ts';
import { getToken } from './api.ts';
import { playEnd, playStep } from './sound.ts';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;
let lobbyWanted = false;
/** Set by the Room page while the chat tab is visible, so unread counts stay right. */
export const chatVisibility = { visible: false };

type Listener = (event: string, payload: unknown) => void;
const listeners = new Set<Listener>();
/** Subscribe to raw events (used for queue:matched navigation). */
export function onServerEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (event: string, payload: unknown) => listeners.forEach((fn) => fn(event, payload));

function connect(token: string): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  useLobby.setState({ connection: 'connecting' });
  const s: ClientSocket = io({ auth: { token }, transports: ['websocket', 'polling'] });
  socket = s;

  s.on('connect', () => {
    useLobby.setState({ connection: 'online' });
    if (lobbyWanted) s.emit('lobby:subscribe');
    // Re-attach to the room this tab shows (players are re-seated by the server anyway).
    const code = useRoom.getState().code;
    if (code) joinRoom(code, useRoom.getState().role === 'spectator' ? 'spectator' : 'player');
  });
  s.on('disconnect', () => useLobby.setState({ connection: 'offline' }));
  s.on('connect_error', (err) => {
    useLobby.setState({ connection: 'offline' });
    if (err.message === 'unauthorized') void useSession.getState().bootstrap();
  });

  s.on('lobby:state', (lobby) => useLobby.setState({ lobby, presence: { online: lobby.online, playing: lobby.playing } }));
  s.on('presence', (presence) => useLobby.setState({ presence }));
  s.on('queue:state', (queue) => useLobby.setState({ queue }));
  s.on('queue:matched', (info) => notify('queue:matched', info));
  s.on('session:seat', ({ code }) => useLobby.setState({ seatCode: code }));

  s.on('room:state', (snap) => {
    useLobby.setState({ offset: snap.serverNow - Date.now() });
    const prev = useRoom.getState();
    const wasSteps = prev.snap?.code === snap.code ? prev.snap?.game?.state.stepCount ?? 0 : null;
    if (!applySnapshot(snap)) s.emit('room:sync', () => {});
    const me = useSession.getState().me;
    const seated = me && (snap.seats.red?.user.id === me.id || snap.seats.blue?.user.id === me.id);
    if (snap.code === useRoom.getState().code) {
      useRoom.setState({ role: seated ? 'player' : 'spectator' });
    }
    if (seated && snap.phase !== 'ended') useLobby.setState({ seatCode: snap.code });
    else if (useLobby.getState().seatCode === snap.code) useLobby.setState({ seatCode: null });
    // Sounds: each new step once, and the ending once (it can come without a step: resign, clocks).
    const step = snap.game?.lastStep;
    if (step && wasSteps !== null && snap.game!.state.stepCount === wasSteps + 1) playStep(step);
    if (prev.snap?.code === snap.code && prev.snap.phase === 'playing' && snap.phase === 'ended') {
      const result = snap.game?.state.result;
      const mine = seatedSide(snap, me?.id);
      playEnd(!result || result.winner === null || !mine ? 'draw' : result.winner === mine ? 'win' : 'lose');
    }
  });
  s.on('room:closed', ({ code, reason }) => {
    if (useRoom.getState().code === code) useRoom.setState({ closed: reason });
    if (useLobby.getState().seatCode === code) useLobby.setState({ seatCode: null });
  });
  s.on('chat:message', (msg) => addChat(msg, chatVisibility.visible));
}

function seatedSide(snap: { seats: { red: { user: { id: string } } | null; blue: { user: { id: string } } | null } }, id?: string) {
  if (!id) return null;
  if (snap.seats.red?.user.id === id) return 'red';
  if (snap.seats.blue?.user.id === id) return 'blue';
  return null;
}

onTokenChange((token) => connect(token));

export function startSocket(): void {
  const token = getToken();
  if (token && !socket) connect(token);
}

/** Emit with an acknowledgement, resolving to a typed result (never rejects). */
export function request<T extends object = object>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'server', message: 'Not connected. Reconnecting…' });
      return;
    }
    const timer = setTimeout(() => resolve({ ok: false, error: 'server', message: 'The server did not answer. Try again.' }), 8000);
    (socket.emit as (...a: unknown[]) => void)(event, ...args, (res: AckResult<T>) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export function subscribeLobby(on: boolean): void {
  lobbyWanted = on;
  if (!socket?.connected) return;
  socket.emit(on ? 'lobby:subscribe' : 'lobby:unsubscribe');
}

export async function joinRoom(code: string, as: 'player' | 'spectator'): Promise<void> {
  const res = await request<{ role: 'player' | 'spectator' }>('room:join', { code, as });
  if (useRoom.getState().code !== code) return;
  if (res.ok) useRoom.setState({ role: res.role, error: null });
  else useRoom.setState({ error: { code: res.error, message: res.message, roomCode: res.code } });
}
