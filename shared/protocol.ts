// The contract between server and client: REST payloads, socket events and room snapshots.
// Change an event here first; both sides import these types.
import type { EndReason, GameState, Side, Step, StepRecord } from './engine.ts';
import type { PresetId, RoomSettings } from './presets.ts';

// ---------------------------------------------------------------- people

export interface UserSummary {
  id: string;
  name: string;
  rating: number;
}

export interface Me extends UserSummary {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  hasPassword: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------- errors

export type ErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'room_full'
  | 'already_seated'
  | 'not_host'
  | 'not_ready'
  | 'not_playing'
  | 'not_your_turn'
  | 'illegal'
  | 'rate_limited'
  | 'name_taken'
  | 'bad_credentials'
  | 'spectators_off'
  | 'server';

export interface ErrorBody {
  ok: false;
  error: ErrorCode;
  message: string;
  /** For already_seated: the room the user is sitting in. */
  code?: string;
}

export type AckResult<T extends object = object> = ({ ok: true } & T) | ErrorBody;
export type Ack<T extends object = object> = (res: AckResult<T>) => void;

// ---------------------------------------------------------------- rooms

export type Visibility = 'public' | 'private';
export type RoomMode = 'custom' | 'quick';
export type RoomPhase = 'waiting' | 'playing' | 'ended';

export interface SeatView {
  user: UserSummary;
  connected: boolean;
  /** Epoch ms when a disconnected player forfeits (game in progress only). */
  forfeitAt: number | null;
}

export interface ClockView {
  /** Epoch ms (server clock) when the game clock hits zero; null if no game clock. */
  gameEndsAt: number | null;
  /** Epoch ms when the current move clock hits zero; null if no move clock. */
  moveEndsAt: number | null;
}

export interface RatingChange {
  red: { before: number; after: number };
  blue: { before: number; after: number };
}

export interface GameView {
  state: GameState;
  /** The step that produced this state (for animation and sound); null at the start. */
  lastStep: StepRecord | null;
  /** Full step history. Present on full snapshots only; otherwise append `lastStep`. */
  records?: StepRecord[];
  clock: ClockView;
  drawOfferBy: Side | null;
  rematch: { red: boolean; blue: boolean };
  ratingChange: RatingChange | null;
  /** Saved game id once the game has ended (for the replay link). */
  savedId: string | null;
}

export interface ChatMessage {
  id: string;
  at: number;
  user: UserSummary;
  role: 'red' | 'blue' | 'spectator' | 'system';
  text: string;
}

export interface RoomSnapshot {
  code: string;
  visibility: Visibility;
  mode: RoomMode;
  hostId: string;
  settings: RoomSettings;
  phase: RoomPhase;
  seats: Record<Side, SeatView | null>;
  spectators: UserSummary[];
  game: GameView | null;
  /** Server time when the snapshot was made, for clock offset. */
  serverNow: number;
  /** True when `game.records` and `chat` are complete (join, reconnect, new game). */
  full: boolean;
  chat?: ChatMessage[];
  createdAt: number;
}

// ---------------------------------------------------------------- lobby

export interface OpenRoom {
  code: string;
  host: UserSummary;
  settings: RoomSettings;
  /** Side the joiner gets, or 'random'. */
  joinerSide: Side | 'random';
  createdAt: number;
}

export interface LiveGame {
  code: string;
  mode: RoomMode;
  red: UserSummary;
  blue: UserSummary;
  settings: RoomSettings;
  scores: Record<Side, number>;
  turn: Side;
  /** codec.encodeBoard string */
  board: string;
  spectators: number;
  startedAt: number;
}

export interface LobbyState {
  open: OpenRoom[];
  live: LiveGame[];
  online: number;
  playing: number;
  queue: Record<PresetId, number>;
}

export interface QueueState {
  preset: PresetId | null;
  since: number | null;
  waiting: number;
}

// ---------------------------------------------------------------- socket events

export interface CreateRoomInput {
  visibility: Visibility;
  settings: Partial<RoomSettings>;
}

export interface ClientToServerEvents {
  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
  'room:create': (input: CreateRoomInput, ack: Ack<{ code: string }>) => void;
  'room:join': (input: { code: string; as: 'player' | 'spectator' }, ack: Ack<{ role: 'player' | 'spectator' }>) => void;
  'room:leave': (ack: Ack) => void;
  'room:settings': (input: { settings: Partial<RoomSettings>; visibility?: Visibility }, ack: Ack) => void;
  'room:start': (ack: Ack) => void;
  'room:sync': (ack: Ack) => void;
  'game:step': (input: Step, ack: Ack) => void;
  'game:resign': (ack: Ack) => void;
  'game:draw-offer': (ack: Ack) => void;
  'game:draw-answer': (input: { accept: boolean }, ack: Ack) => void;
  'game:rematch': (input: { want: boolean }, ack: Ack) => void;
  'chat:send': (input: { text: string }, ack: Ack) => void;
  'queue:join': (input: { preset: PresetId }, ack: Ack) => void;
  'queue:leave': (ack: Ack) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (state: LobbyState) => void;
  'room:state': (room: RoomSnapshot) => void;
  'room:closed': (info: { code: string; reason: string }) => void;
  'chat:message': (msg: ChatMessage) => void;
  'queue:state': (state: QueueState) => void;
  'queue:matched': (info: { code: string }) => void;
  presence: (info: { online: number; playing: number }) => void;
  /** The user's current seat, sent on connect so a reload can return to the game. */
  'session:seat': (info: { code: string | null }) => void;
}

// ---------------------------------------------------------------- REST

export interface SessionResponse {
  token: string;
  me: Me;
}

export interface GameSummary {
  id: string;
  roomCode: string;
  mode: RoomMode;
  rated: boolean;
  red: UserSummary;
  blue: UserSummary;
  ratingChange: RatingChange | null;
  scores: Record<Side, number>;
  winner: Side | null;
  reason: EndReason;
  stepCount: number;
  startedAt: number;
  endedAt: number;
}

export interface GameDetail extends GameSummary {
  settings: RoomSettings;
  steps: Step[];
}

export interface PlayerProfile {
  user: UserSummary & { games: number; wins: number; losses: number; draws: number; createdAt: number; lastSeenAt: number };
  recent: GameSummary[];
  /** Rating after each rated game, oldest first (starts with the 1200 baseline). */
  history: { at: number; rating: number }[];
}

export interface LeaderboardRow {
  rank: number;
  user: UserSummary;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface StatsResponse {
  online: number;
  playing: number;
  gamesToday: number;
  players: number;
}
