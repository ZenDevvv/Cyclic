// Live rooms: seats, spectators, the authoritative game, clocks, chat, rematch and reconnection.
import type { Server, Socket } from 'socket.io';
import { randomInt } from 'node:crypto';
import {
  applyStep,
  endGame,
  IllegalStepError,
  initialState,
  other,
  type EndReason,
  type GameState,
  type Side,
  type Step,
  type StepRecord,
} from '../shared/engine.ts';
import { encodeBoard } from '../shared/codec.ts';
import {
  DEFAULT_ROOM_SETTINGS,
  PRESETS,
  RECONNECT_GRACE_SECONDS,
  type PresetId,
  type RoomSettings,
} from '../shared/presets.ts';
import { rate } from '../shared/rating.ts';
import { END_REASON_TEXT, SIDE_NAME } from '../shared/notation.ts';
import type {
  AckResult,
  ChatMessage,
  ClientToServerEvents,
  ErrorCode,
  LiveGame,
  LobbyState,
  OpenRoom,
  RatingChange,
  RoomMode,
  RoomPhase,
  RoomSnapshot,
  ServerToClientEvents,
  UserSummary,
  Visibility,
} from '../shared/protocol.ts';
import { randomId, type Repo } from './db.ts';

export interface SocketData {
  user: UserSummary;
}
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export class RoomError extends Error {
  readonly code: ErrorCode;
  readonly roomCode?: string;
  constructor(code: ErrorCode, message: string, roomCode?: string) {
    super(message);
    this.code = code;
    this.roomCode = roomCode;
  }
}

interface Seat {
  user: UserSummary;
  sockets: Set<string>;
  /** When the last socket left, or null while connected. */
  goneSince: number | null;
  forfeitAt: number | null;
}

interface Watcher {
  user: UserSummary;
  sockets: Set<string>;
}

interface LiveGameState {
  state: GameState;
  records: StepRecord[];
  steps: Step[];
  startedAt: number;
  gameEndsAt: number | null;
  moveEndsAt: number | null;
  drawOfferBy: Side | null;
  /** Step count after which each side may offer a draw again. */
  drawCooldown: Record<Side, number>;
  rematch: Record<Side, boolean>;
  ratingChange: RatingChange | null;
  savedId: string | null;
  lastStep: StepRecord | null;
}

interface Room {
  code: string;
  visibility: Visibility;
  mode: RoomMode;
  hostId: string;
  settings: RoomSettings;
  phase: RoomPhase;
  seats: Record<Side, Seat | null>;
  watchers: Map<string, Watcher>;
  game: LiveGameState | null;
  chat: ChatMessage[];
  createdAt: number;
  endedAt: number | null;
  timers: { move?: NodeJS.Timeout; game?: NodeJS.Timeout; forfeit: Partial<Record<Side, NodeJS.Timeout>> };
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CHAT_KEEP = 50;
const WAITING_GRACE_MS = 60_000;
const ENDED_SWEEP_MS = 5 * 60_000;

export interface RoomManagerOptions {
  /** Multiplies every clock duration; tests use a small value. */
  timeScale?: number;
  now?: () => number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socket id → codes of rooms the socket is attached to */
  private socketRooms = new Map<string, Set<string>>();
  private lobbyTimer: NodeJS.Timeout | null = null;
  private presenceTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout;
  private io: IO;
  private repo: Repo;
  private timeScale: number;
  private now: () => number;
  private disposed = false;
  /** Called when a seat frees up, so matchmaking can drop queued users who sat down elsewhere. */
  onSeated: (userId: string) => void = () => {};

  constructor(io: IO, repo: Repo, opts: RoomManagerOptions = {}) {
    this.io = io;
    this.repo = repo;
    this.timeScale = opts.timeScale ?? 1;
    this.now = opts.now ?? Date.now;
    this.sweepTimer = setInterval(() => this.sweep(), 5_000);
    this.sweepTimer.unref();
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.sweepTimer);
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    for (const room of this.rooms.values()) this.clearTimers(room);
  }

  // ------------------------------------------------------------ queries

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** The unfinished room (waiting or playing) where this user holds a seat. */
  activeSeat(userId: string): { room: Room; side: Side } | null {
    for (const room of this.rooms.values()) {
      if (room.phase === 'ended') continue;
      const side = this.sideOf(room, userId);
      if (side) return { room, side };
    }
    return null;
  }

  private sideOf(room: Room, userId: string): Side | null {
    if (room.seats.red?.user.id === userId) return 'red';
    if (room.seats.blue?.user.id === userId) return 'blue';
    return null;
  }

  presence(): { online: number; playing: number } {
    const online = new Set<string>();
    for (const s of this.io.sockets.sockets.values()) online.add(s.data.user.id);
    let playing = 0;
    for (const room of this.rooms.values()) if (room.phase === 'playing') playing += 2;
    return { online: online.size, playing };
  }

  lobbyState(queue: Record<PresetId, number>): LobbyState {
    const open: OpenRoom[] = [];
    const live: LiveGame[] = [];
    for (const room of this.rooms.values()) {
      if (room.visibility !== 'public') continue;
      if (room.phase === 'waiting') {
        const host = room.seats.red?.user.id === room.hostId ? room.seats.red : room.seats.blue;
        const full = room.seats.red && room.seats.blue;
        if (!host || full || host.goneSince !== null) continue;
        const hostSide = this.sideOf(room, room.hostId)!;
        open.push({
          code: room.code,
          host: host.user,
          settings: room.settings,
          joinerSide: room.settings.hostSide === 'random' ? 'random' : other(hostSide),
          createdAt: room.createdAt,
        });
      } else if (room.phase === 'playing' && room.game && room.seats.red && room.seats.blue) {
        live.push({
          code: room.code,
          mode: room.mode,
          red: room.seats.red.user,
          blue: room.seats.blue.user,
          settings: room.settings,
          scores: room.game.state.scores,
          turn: room.game.state.turn,
          board: encodeBoard(room.game.state.board),
          spectators: room.watchers.size,
          startedAt: room.game.startedAt,
        });
      }
    }
    open.sort((a, b) => b.createdAt - a.createdAt);
    live.sort((a, b) => b.red.rating + b.blue.rating - (a.red.rating + a.blue.rating));
    return { open, live, ...this.presence(), queue };
  }

  // ------------------------------------------------------------ socket lifecycle

  /** A socket connected: re-attach it to the seat this user already holds. */
  onConnect(socket: IOSocket): void {
    const userId = socket.data.user.id;
    socket.join(`user:${userId}`);
    let seatCode: string | null = null;
    for (const room of this.rooms.values()) {
      const side = this.sideOf(room, userId);
      if (!side) continue;
      this.attach(socket, room);
      if (room.phase !== 'ended') seatCode = room.code;
    }
    socket.emit('session:seat', { code: seatCode });
    this.schedulePresence();
  }

  onDisconnect(socket: IOSocket): void {
    if (this.disposed) return;
    const codes = this.socketRooms.get(socket.id);
    this.socketRooms.delete(socket.id);
    for (const code of codes ?? []) {
      const room = this.rooms.get(code);
      if (room) this.detach(socket.id, room);
    }
    this.schedulePresence();
  }

  private attach(socket: IOSocket, room: Room): void {
    const user = socket.data.user;
    socket.join(`room:${room.code}`);
    let codes = this.socketRooms.get(socket.id);
    if (!codes) this.socketRooms.set(socket.id, (codes = new Set()));
    codes.add(room.code);
    const side = this.sideOf(room, user.id);
    if (side) {
      const seat = room.seats[side]!;
      const wasGone = seat.goneSince !== null;
      seat.sockets.add(socket.id);
      seat.goneSince = null;
      seat.forfeitAt = null;
      if (room.timers.forfeit[side]) {
        clearTimeout(room.timers.forfeit[side]);
        delete room.timers.forfeit[side];
      }
      if (wasGone && room.phase === 'playing') this.system(room, `${user.name} is back.`);
    } else {
      let w = room.watchers.get(user.id);
      if (!w) room.watchers.set(user.id, (w = { user, sockets: new Set() }));
      w.sockets.add(socket.id);
    }
    socket.emit('room:state', this.snapshot(room, true));
    socket.to(`room:${room.code}`).emit('room:state', this.snapshot(room, false));
  }

  private detach(socketId: string, room: Room): void {
    for (const side of ['red', 'blue'] as const) {
      const seat = room.seats[side];
      if (!seat?.sockets.delete(socketId) || seat.sockets.size) continue;
      seat.goneSince = this.now();
      if (room.phase === 'playing') {
        const grace = RECONNECT_GRACE_SECONDS * 1000 * this.timeScale;
        seat.forfeitAt = this.now() + grace;
        room.timers.forfeit[side] = setTimeout(() => this.onForfeit(room, side), grace);
        this.system(room, `${seat.user.name} disconnected. They have ${RECONNECT_GRACE_SECONDS} seconds to return.`);
      }
    }
    for (const [id, w] of room.watchers) {
      if (w.sockets.delete(socketId) && !w.sockets.size) room.watchers.delete(id);
    }
    this.broadcast(room);
  }

  // ------------------------------------------------------------ room lifecycle

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private makeRoom(visibility: Visibility, mode: RoomMode, hostId: string, settings: RoomSettings): Room {
    const room: Room = {
      code: this.newCode(),
      visibility,
      mode,
      hostId,
      settings,
      phase: 'waiting',
      seats: { red: null, blue: null },
      watchers: new Map(),
      game: null,
      chat: [],
      createdAt: this.now(),
      endedAt: null,
      timers: { forfeit: {} },
    };
    this.rooms.set(room.code, room);
    return room;
  }

  /** Leave whatever this user sits in, unless it is a game in progress (then refuse). */
  private releaseSeat(userId: string, keepCode?: string): void {
    for (const room of [...this.rooms.values()]) {
      if (room.code === keepCode) continue;
      const side = this.sideOf(room, userId);
      if (!side) continue;
      if (room.phase === 'playing') {
        throw new RoomError('already_seated', 'You are in a game right now. Finish or resign it first.', room.code);
      }
      this.vacate(room, side);
    }
  }

  create(socket: IOSocket, visibility: Visibility, partial: Partial<RoomSettings>): Room {
    const user = socket.data.user;
    this.releaseSeat(user.id);
    const settings = { ...DEFAULT_ROOM_SETTINGS, ...partial };
    const room = this.makeRoom(visibility, 'custom', user.id, settings);
    const hostSide: Side = settings.hostSide === 'blue' ? 'blue' : 'red';
    room.seats[hostSide] = { user, sockets: new Set(), goneSince: null, forfeitAt: null };
    this.attach(socket, room);
    this.onSeated(user.id);
    this.scheduleLobby();
    return room;
  }

  /** Matchmaking: a rated public room that starts at once. */
  createQuick(a: UserSummary, b: UserSummary, preset: PresetId): Room {
    const p = PRESETS[preset];
    const settings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      gameMinutes: p.gameMinutes,
      moveSeconds: p.moveSeconds,
      rated: true,
      hostSide: 'random',
    };
    this.releaseSeat(a.id);
    this.releaseSeat(b.id);
    const room = this.makeRoom('public', 'quick', a.id, settings);
    const [red, blue] = randomInt(2) ? [a, b] : [b, a];
    room.seats.red = { user: red, sockets: new Set(), goneSince: null, forfeitAt: null };
    room.seats.blue = { user: blue, sockets: new Set(), goneSince: null, forfeitAt: null };
    for (const u of [a, b]) {
      for (const s of this.io.sockets.sockets.values()) {
        if (s.data.user.id === u.id) this.attach(s as IOSocket, room);
      }
    }
    this.startGame(room, false);
    return room;
  }

  join(socket: IOSocket, code: string, as: 'player' | 'spectator'): 'player' | 'spectator' {
    const room = this.get(code);
    if (!room) throw new RoomError('not_found', 'That room does not exist or has closed.');
    const user = socket.data.user;
    const seated = this.sideOf(room, user.id);
    if (seated) {
      this.attach(socket, room);
      return 'player';
    }
    const freeSide: Side | null = room.seats.red ? (room.seats.blue ? null : 'blue') : 'red';
    if (as === 'player' && room.phase === 'waiting' && freeSide) {
      this.releaseSeat(user.id, room.code);
      room.seats[freeSide] = { user, sockets: new Set(), goneSince: null, forfeitAt: null };
      room.watchers.delete(user.id);
      this.attach(socket, room);
      this.system(room, `${user.name} took a seat.`);
      this.onSeated(user.id);
      this.scheduleLobby();
      return 'player';
    }
    if (!room.settings.allowSpectators) {
      throw new RoomError(as === 'player' ? 'room_full' : 'spectators_off', as === 'player' ? 'This room is full and closed to spectators.' : 'This room is closed to spectators.');
    }
    this.attach(socket, room);
    return 'spectator';
  }

  leave(socket: IOSocket): void {
    const user = socket.data.user;
    for (const code of [...(this.socketRooms.get(socket.id) ?? [])]) {
      const room = this.rooms.get(code);
      if (!room) continue;
      const side = this.sideOf(room, user.id);
      if (side) {
        if (room.phase === 'playing') this.finish(room, endGame(room.game!.state, 'abandon', other(side)));
        this.vacate(room, side);
      } else {
        room.watchers.delete(user.id);
      }
      // Detach every socket of this user from the room.
      for (const s of this.io.sockets.sockets.values()) {
        if (s.data.user.id !== user.id) continue;
        s.leave(`room:${code}`);
        this.socketRooms.get(s.id)?.delete(code);
      }
      if (this.rooms.has(code)) this.broadcast(room);
    }
  }

  private vacate(room: Room, side: Side): void {
    const seat = room.seats[side];
    if (!seat) return;
    room.seats[side] = null;
    if (room.timers.forfeit[side]) {
      clearTimeout(room.timers.forfeit[side]);
      delete room.timers.forfeit[side];
    }
    for (const s of this.io.sockets.sockets.values()) {
      if (s.data.user.id === seat.user.id) {
        s.leave(`room:${room.code}`);
        this.socketRooms.get(s.id)?.delete(room.code);
      }
    }
    if (room.game) room.game.rematch = { red: false, blue: false };
    const remaining = room.seats[other(side)];
    if (!remaining) {
      this.close(room, room.phase === 'ended' ? 'Both players left.' : 'The host left.');
      return;
    }
    if (room.hostId === seat.user.id) room.hostId = remaining.user.id;
    this.system(room, `${seat.user.name} left.`);
    this.scheduleLobby();
    this.broadcast(room);
  }

  private close(room: Room, reason: string): void {
    this.clearTimers(room);
    this.rooms.delete(room.code);
    this.io.to(`room:${room.code}`).emit('room:closed', { code: room.code, reason });
    this.io.in(`room:${room.code}`).socketsLeave(`room:${room.code}`);
    for (const codes of this.socketRooms.values()) codes.delete(room.code);
    this.scheduleLobby();
  }

  updateSettings(socket: IOSocket, partial: Partial<RoomSettings>, visibility?: Visibility): void {
    const room = this.roomOf(socket);
    if (room.hostId !== socket.data.user.id) throw new RoomError('not_host', 'Only the host can change the settings.');
    if (room.phase !== 'waiting') throw new RoomError('not_ready', 'Settings are fixed once the game starts.');
    if (room.mode === 'quick') throw new RoomError('forbidden', 'Quick-match rooms use fixed settings.');
    room.settings = { ...room.settings, ...partial };
    if (visibility) room.visibility = visibility;
    // Move the host to the side they asked for.
    const hostSide = this.sideOf(room, room.hostId)!;
    const want = room.settings.hostSide;
    if (want !== 'random' && want !== hostSide) {
      [room.seats.red, room.seats.blue] = [room.seats.blue, room.seats.red];
    }
    this.scheduleLobby();
    this.broadcast(room);
  }

  start(socket: IOSocket): void {
    const room = this.roomOf(socket);
    if (room.hostId !== socket.data.user.id) throw new RoomError('not_host', 'Only the host can start the game.');
    if (room.phase !== 'waiting') throw new RoomError('not_ready', 'The game has already started.');
    if (!room.seats.red || !room.seats.blue) throw new RoomError('not_ready', 'Wait for an opponent to take the other seat.');
    if (room.settings.hostSide === 'random' && randomInt(2)) {
      [room.seats.red, room.seats.blue] = [room.seats.blue, room.seats.red];
    }
    this.startGame(room, false);
  }

  private startGame(room: Room, swap: boolean): void {
    if (swap) [room.seats.red, room.seats.blue] = [room.seats.blue, room.seats.red];
    const now = this.now();
    room.phase = 'playing';
    room.endedAt = null;
    room.game = {
      state: initialState({ maxCapture: room.settings.maxCapture }),
      records: [],
      steps: [],
      startedAt: now,
      gameEndsAt: null,
      moveEndsAt: null,
      drawOfferBy: null,
      drawCooldown: { red: 0, blue: 0 },
      rematch: { red: false, blue: false },
      ratingChange: null,
      savedId: null,
      lastStep: null,
    };
    if (room.settings.gameMinutes) {
      const ms = room.settings.gameMinutes * 60_000 * this.timeScale;
      room.game.gameEndsAt = now + ms;
      room.timers.game = setTimeout(() => this.onGameTimeout(room), ms);
    }
    this.resetMoveClock(room);
    this.system(room, `Game on. ${room.seats.red!.user.name} plays red and moves first.`);
    this.io.to(`room:${room.code}`).emit('room:state', this.snapshot(room, true));
    this.scheduleLobby();
  }

  private resetMoveClock(room: Room): void {
    const g = room.game!;
    if (room.timers.move) clearTimeout(room.timers.move);
    if (!room.settings.moveSeconds || g.state.result) {
      g.moveEndsAt = null;
      return;
    }
    const ms = room.settings.moveSeconds * 1000 * this.timeScale;
    g.moveEndsAt = this.now() + ms;
    room.timers.move = setTimeout(() => this.onMoveTimeout(room), ms);
  }

  // ------------------------------------------------------------ game actions

  step(socket: IOSocket, step: Step): void {
    const { room, side, game } = this.playing(socket);
    if (game.state.turn !== side) throw new RoomError('not_your_turn', 'Wait for your turn.');
    let applied;
    try {
      applied = applyStep(game.state, step);
    } catch (err) {
      if (err instanceof IllegalStepError) throw new RoomError('illegal', 'That move is not allowed.');
      throw err;
    }
    game.state = applied.state;
    game.records.push(applied.record);
    game.steps.push({ from: step.from, to: step.to });
    game.lastStep = applied.record;
    if (game.drawOfferBy && game.drawOfferBy !== side) game.drawOfferBy = null; // moving declines
    if (game.state.result) {
      this.finish(room, game.state);
      return;
    }
    this.resetMoveClock(room);
    this.broadcast(room);
    this.scheduleLobby();
  }

  resign(socket: IOSocket): void {
    const { room, side, game } = this.playing(socket);
    this.finish(room, endGame(game.state, 'resign', other(side)));
  }

  offerDraw(socket: IOSocket): void {
    const { room, side, game } = this.playing(socket);
    if (game.drawOfferBy === other(side)) {
      this.finish(room, endGame(game.state, 'agreement'));
      return;
    }
    if (game.drawOfferBy === side) return;
    if (game.state.stepCount < game.drawCooldown[side]) {
      throw new RoomError('rate_limited', 'You offered a draw recently. Play a few more moves first.');
    }
    game.drawOfferBy = side;
    this.system(room, `${room.seats[side]!.user.name} offers a draw.`);
    this.broadcast(room);
  }

  answerDraw(socket: IOSocket, accept: boolean): void {
    const { room, side, game } = this.playing(socket);
    if (game.drawOfferBy !== other(side)) throw new RoomError('invalid', 'There is no draw offer to answer.');
    if (accept) {
      this.finish(room, endGame(game.state, 'agreement'));
      return;
    }
    game.drawCooldown[other(side)] = game.state.stepCount + 4;
    game.drawOfferBy = null;
    this.system(room, `${room.seats[side]!.user.name} declines the draw.`);
    this.broadcast(room);
  }

  rematch(socket: IOSocket, want: boolean): void {
    const room = this.roomOf(socket);
    const side = this.sideOf(room, socket.data.user.id);
    if (!side) throw new RoomError('forbidden', 'Only the players can ask for a rematch.');
    if (room.phase !== 'ended' || !room.game) throw new RoomError('not_ready', 'The game is not over yet.');
    if (!room.seats.red || !room.seats.blue) throw new RoomError('not_ready', 'Your opponent has left.');
    room.game.rematch[side] = want;
    if (room.game.rematch.red && room.game.rematch.blue) {
      this.system(room, 'Rematch. Sides swap.');
      this.startGame(room, true);
      return;
    }
    if (want) this.system(room, `${room.seats[side]!.user.name} wants a rematch.`);
    this.broadcast(room);
  }

  chat(socket: IOSocket, text: string): ChatMessage {
    const room = this.roomOf(socket);
    const user = socket.data.user;
    const side = this.sideOf(room, user.id);
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (!clean) throw new RoomError('invalid', 'Say something first.');
    const msg: ChatMessage = { id: randomId(8), at: this.now(), user, role: side ?? 'spectator', text: clean };
    this.pushChat(room, msg);
    return msg;
  }

  private system(room: Room, text: string): void {
    this.pushChat(room, { id: randomId(8), at: this.now(), user: { id: 'system', name: 'Scidama', rating: 0 }, role: 'system', text });
  }

  private pushChat(room: Room, msg: ChatMessage): void {
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    this.io.to(`room:${room.code}`).emit('chat:message', msg);
  }

  // ------------------------------------------------------------ clocks and endings

  private onMoveTimeout(room: Room): void {
    const g = room.game;
    if (!g || room.phase !== 'playing') return;
    this.finish(room, endGame(g.state, 'timeout', other(g.state.turn)));
  }

  private onGameTimeout(room: Room): void {
    const g = room.game;
    if (!g || room.phase !== 'playing') return;
    this.finish(room, endGame(g.state, 'time'));
  }

  private onForfeit(room: Room, side: Side): void {
    delete room.timers.forfeit[side];
    const g = room.game;
    if (!g || room.phase !== 'playing' || room.seats[side]?.goneSince === null) return;
    this.finish(room, endGame(g.state, 'abandon', other(side)));
  }

  private finish(room: Room, state: GameState): void {
    const g = room.game!;
    const result = state.result!;
    g.state = state;
    g.moveEndsAt = null;
    g.drawOfferBy = null;
    room.phase = 'ended';
    room.endedAt = this.now();
    this.clearTimers(room);
    for (const seat of [room.seats.red, room.seats.blue]) if (seat) seat.forfeitAt = null;

    const red = room.seats.red!.user;
    const blue = room.seats.blue!.user;
    // Games that end before both sides have moved never count for ratings.
    const rated = room.settings.rated && g.state.turnNumber > 2;
    if (rated) {
      const r = this.repo.getUser(red.id);
      const b = this.repo.getUser(blue.id);
      if (r && b) {
        const score = result.winner === 'red' ? 1 : result.winner === 'blue' ? 0 : 0.5;
        const next = rate({ rating: r.rating, games: r.ratedGames }, { rating: b.rating, games: b.ratedGames }, score);
        g.ratingChange = { red: { before: r.rating, after: next.a }, blue: { before: b.rating, after: next.b } };
        room.seats.red!.user = { ...red, rating: next.a };
        room.seats.blue!.user = { ...blue, rating: next.b };
      }
    }
    try {
      g.savedId = this.repo.saveGame({
        roomCode: room.code,
        mode: room.mode,
        rated: g.ratingChange !== null,
        red,
        blue,
        ratingChange: g.ratingChange,
        settings: room.settings,
        steps: g.steps,
        scores: result.final,
        winner: result.winner,
        reason: result.reason,
        startedAt: g.startedAt,
        endedAt: room.endedAt,
      });
    } catch (err) {
      console.error('saving game failed', err);
    }
    this.system(room, this.resultLine(room, result.winner, result.reason));
    this.broadcast(room);
    this.scheduleLobby();
  }

  private resultLine(room: Room, winner: Side | null, reason: EndReason): string {
    if (!winner) return `Draw. ${END_REASON_TEXT[reason]}.`;
    const loser = room.seats[other(winner)]?.user.name ?? SIDE_NAME[other(winner)];
    const how: Partial<Record<EndReason, string>> = {
      timeout: `${loser} ran out of move time`,
      resign: `${loser} resigned`,
      abandon: `${loser} left the game`,
    };
    return `${room.seats[winner]?.user.name ?? SIDE_NAME[winner]} wins. ${how[reason] ?? END_REASON_TEXT[reason]}.`;
  }

  private clearTimers(room: Room): void {
    if (room.timers.move) clearTimeout(room.timers.move);
    if (room.timers.game) clearTimeout(room.timers.game);
    for (const t of Object.values(room.timers.forfeit)) clearTimeout(t);
    room.timers = { forfeit: {} };
  }

  /** Close abandoned waiting rooms and idle finished rooms. */
  private sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (room.phase === 'waiting') {
        for (const side of ['red', 'blue'] as const) {
          const seat = room.seats[side];
          if (seat?.goneSince != null && now - seat.goneSince > WAITING_GRACE_MS * this.timeScale) {
            this.vacate(room, side);
            if (!this.rooms.has(room.code)) break;
          }
        }
      } else if (room.phase === 'ended') {
        const anyone =
          [room.seats.red, room.seats.blue].some((s) => s && s.sockets.size) ||
          [...room.watchers.values()].some((w) => w.sockets.size);
        if (!anyone && now - (room.endedAt ?? now) > ENDED_SWEEP_MS * this.timeScale) this.close(room, 'Room closed.');
      }
    }
  }

  // ------------------------------------------------------------ helpers

  private roomOf(socket: IOSocket): Room {
    const userId = socket.data.user.id;
    // Prefer a room this user is seated in, then any room the socket watches.
    for (const code of this.socketRooms.get(socket.id) ?? []) {
      const room = this.rooms.get(code);
      if (room && this.sideOf(room, userId)) return room;
    }
    for (const code of this.socketRooms.get(socket.id) ?? []) {
      const room = this.rooms.get(code);
      if (room) return room;
    }
    throw new RoomError('not_found', 'You are not in a room.');
  }

  private playing(socket: IOSocket): { room: Room; side: Side; game: LiveGameState } {
    const room = this.roomOf(socket);
    const side = this.sideOf(room, socket.data.user.id);
    if (!side) throw new RoomError('forbidden', 'Spectators cannot move.');
    if (room.phase !== 'playing' || !room.game) throw new RoomError('not_playing', 'The game is not in progress.');
    return { room, side, game: room.game };
  }

  updateUser(user: UserSummary): void {
    for (const room of this.rooms.values()) {
      for (const side of ['red', 'blue'] as const) {
        const seat = room.seats[side];
        if (seat?.user.id === user.id) seat.user = { ...user };
      }
      const w = room.watchers.get(user.id);
      if (w) w.user = { ...user };
      if (this.sideOf(room, user.id) || w) this.broadcast(room);
    }
    for (const s of this.io.sockets.sockets.values()) if (s.data.user.id === user.id) s.data.user = { ...user };
    this.scheduleLobby();
  }

  snapshot(room: Room, full: boolean): RoomSnapshot {
    const seat = (s: Seat | null) =>
      s ? { user: s.user, connected: s.sockets.size > 0, forfeitAt: s.forfeitAt } : null;
    const g = room.game;
    return {
      code: room.code,
      visibility: room.visibility,
      mode: room.mode,
      hostId: room.hostId,
      settings: room.settings,
      phase: room.phase,
      seats: { red: seat(room.seats.red), blue: seat(room.seats.blue) },
      spectators: [...room.watchers.values()].map((w) => w.user),
      game: g
        ? {
            state: g.state,
            lastStep: g.lastStep,
            records: full ? g.records : undefined,
            clock: { gameEndsAt: g.gameEndsAt, moveEndsAt: g.moveEndsAt },
            drawOfferBy: g.drawOfferBy,
            rematch: g.rematch,
            ratingChange: g.ratingChange,
            savedId: g.savedId,
          }
        : null,
      serverNow: this.now(),
      full,
      chat: full ? room.chat : undefined,
      createdAt: room.createdAt,
    };
  }

  private broadcast(room: Room): void {
    if (!this.rooms.has(room.code)) return;
    this.io.to(`room:${room.code}`).emit('room:state', this.snapshot(room, false));
  }

  sync(socket: IOSocket): void {
    socket.emit('room:state', this.snapshot(this.roomOf(socket), true));
  }

  /** Lobby and presence are broadcast at most every 300 ms / 1 s. */
  onLobbyChange: () => void = () => {};

  scheduleLobby(): void {
    if (this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      this.onLobbyChange();
    }, 300);
  }

  private schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.io.emit('presence', this.presence());
      this.onLobbyChange();
    }, 1000);
  }
}

export function toAckError(err: unknown): AckResult {
  if (err instanceof RoomError) return { ok: false, error: err.code, message: err.message, code: err.roomCode };
  console.error(err);
  return { ok: false, error: 'server', message: 'Something went wrong on our side.' };
}
