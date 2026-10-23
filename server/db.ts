// SQLite persistence through Node's built-in node:sqlite. This file is the only DB surface:
// swap it for another database by keeping the Repo interface.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { EndReason, Side, Step } from '../shared/engine.ts';
import type { RoomSettings } from '../shared/presets.ts';
import type {
  GameDetail,
  GameSummary,
  LeaderboardRow,
  Me,
  PlayerProfile,
  RatingChange,
  RoomMode,
  UserSummary,
} from '../shared/protocol.ts';
import { START_RATING } from '../shared/rating.ts';

/** Append-only. Never edit a migration that has shipped; add a new entry. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    rating INTEGER NOT NULL DEFAULT ${START_RATING},
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    rated_games INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    mode TEXT NOT NULL,
    rated INTEGER NOT NULL,
    red_id TEXT NOT NULL,
    blue_id TEXT NOT NULL,
    red_name TEXT NOT NULL,
    blue_name TEXT NOT NULL,
    red_rating_before INTEGER NOT NULL,
    blue_rating_before INTEGER NOT NULL,
    red_rating_after INTEGER,
    blue_rating_after INTEGER,
    settings_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    step_count INTEGER NOT NULL,
    red_score INTEGER NOT NULL,
    blue_score INTEGER NOT NULL,
    winner TEXT,
    reason TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL
  );
  CREATE INDEX games_red ON games(red_id, ended_at);
  CREATE INDEX games_blue ON games(blue_id, ended_at);
  CREATE INDEX games_ended ON games(ended_at);
  `,
];

export const randomId = (len = 10): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

interface UserRow {
  id: string;
  name: string;
  password_hash: string | null;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rated_games: number;
  created_at: number;
  last_seen_at: number;
}

interface GameRow {
  id: string;
  room_code: string;
  mode: string;
  rated: number;
  red_id: string;
  blue_id: string;
  red_name: string;
  blue_name: string;
  red_rating_before: number;
  blue_rating_before: number;
  red_rating_after: number | null;
  blue_rating_after: number | null;
  settings_json: string;
  steps_json: string;
  step_count: number;
  red_score: number;
  blue_score: number;
  winner: string | null;
  reason: string;
  started_at: number;
  ended_at: number;
}

export interface User extends Me {
  passwordHash: string | null;
  lastSeenAt: number;
  ratedGames: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  rating: r.rating,
  games: r.games,
  wins: r.wins,
  losses: r.losses,
  draws: r.draws,
  hasPassword: r.password_hash !== null,
  passwordHash: r.password_hash,
  ratedGames: r.rated_games,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
});

export const toMe = (u: User): Me => ({
  id: u.id,
  name: u.name,
  rating: u.rating,
  games: u.games,
  wins: u.wins,
  losses: u.losses,
  draws: u.draws,
  hasPassword: u.hasPassword,
  createdAt: u.createdAt,
});

export const toSummary = (u: Pick<User, 'id' | 'name' | 'rating'>): UserSummary => ({ id: u.id, name: u.name, rating: u.rating });

function toGameSummary(r: GameRow): GameSummary {
  const ratingChange: RatingChange | null =
    r.red_rating_after !== null && r.blue_rating_after !== null
      ? {
          red: { before: r.red_rating_before, after: r.red_rating_after },
          blue: { before: r.blue_rating_before, after: r.blue_rating_after },
        }
      : null;
  return {
    id: r.id,
    roomCode: r.room_code,
    mode: r.mode as RoomMode,
    rated: r.rated === 1,
    red: { id: r.red_id, name: r.red_name, rating: r.red_rating_before },
    blue: { id: r.blue_id, name: r.blue_name, rating: r.blue_rating_before },
    ratingChange,
    scores: { red: r.red_score, blue: r.blue_score },
    winner: (r.winner as Side | null) ?? null,
    reason: r.reason as EndReason,
    stepCount: r.step_count,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  };
}

export interface SaveGameInput {
  roomCode: string;
  mode: RoomMode;
  rated: boolean;
  red: UserSummary;
  blue: UserSummary;
  ratingChange: RatingChange | null;
  settings: RoomSettings;
  steps: Step[];
  scores: Record<Side, number>;
  winner: Side | null;
  reason: EndReason;
  startedAt: number;
  endedAt: number;
}

export class NameTakenError extends Error {}

export type Repo = ReturnType<typeof openRepo>;

export function openRepo(dbPath: string) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT * FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (id, name, created_at, last_seen_at) VALUES (?, ?, ?, ?)'),
    renameUser: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    touchUser: db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used_at) VALUES (?, ?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    applyResult: db.prepare(
      'UPDATE users SET rating = ?, games = games + 1, rated_games = rated_games + ?, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?',
    ),
    insertGame: db.prepare(`INSERT INTO games (id, room_code, mode, rated, red_id, blue_id, red_name, blue_name,
      red_rating_before, blue_rating_before, red_rating_after, blue_rating_after, settings_json, steps_json, step_count,
      red_score, blue_score, winner, reason, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    gameById: db.prepare('SELECT * FROM games WHERE id = ?'),
    recentForUser: db.prepare(
      'SELECT * FROM games WHERE red_id = ? OR blue_id = ? ORDER BY ended_at DESC LIMIT ?',
    ),
    ratedForUser: db.prepare(
      'SELECT * FROM games WHERE rated = 1 AND (red_id = ? OR blue_id = ?) ORDER BY ended_at ASC',
    ),
    leaderboard: db.prepare('SELECT * FROM users WHERE rated_games > 0 ORDER BY rating DESC, wins DESC, name ASC LIMIT ?'),
    gamesSince: db.prepare('SELECT COUNT(*) AS n FROM games WHERE ended_at >= ?'),
    latestGames: db.prepare('SELECT * FROM games ORDER BY ended_at DESC LIMIT ?'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  };

  const getUser = (id: string): User | null => {
    const r = q.userById.get(id) as UserRow | undefined;
    return r ? toUser(r) : null;
  };

  return {
    db,
    close: () => db.close(),

    getUser,

    getUserByName(name: string): User | null {
      const r = q.userByName.get(name) as UserRow | undefined;
      return r ? toUser(r) : null;
    },

    createUser(name: string, now = Date.now()): User {
      if (q.userByName.get(name)) throw new NameTakenError(name);
      const id = randomId(10);
      q.insertUser.run(id, name, now, now);
      return getUser(id)!;
    },

    renameUser(id: string, name: string): User {
      const existing = q.userByName.get(name) as UserRow | undefined;
      if (existing && existing.id !== id) throw new NameTakenError(name);
      q.renameUser.run(name, id);
      return getUser(id)!;
    },

    setPassword(id: string, hash: string): User {
      q.setPassword.run(hash, id);
      return getUser(id)!;
    },

    touchUser(id: string, now = Date.now()): void {
      q.touchUser.run(now, id);
    },

    createSession(userId: string, tokenHash: string, now = Date.now()): void {
      q.insertSession.run(tokenHash, userId, now, now);
    },

    userForSession(tokenHash: string, now = Date.now()): User | null {
      const r = q.sessionUser.get(tokenHash) as UserRow | undefined;
      if (!r) return null;
      q.touchSession.run(now, tokenHash);
      return toUser(r);
    },

    deleteSession(tokenHash: string): void {
      q.deleteSession.run(tokenHash);
    },

    /** Store a finished game and, for rated games, update both players' records. */
    saveGame(input: SaveGameInput): string {
      const id = randomId(10);
      tx(() => {
        q.insertGame.run(
          id,
          input.roomCode,
          input.mode,
          input.rated ? 1 : 0,
          input.red.id,
          input.blue.id,
          input.red.name,
          input.blue.name,
          input.ratingChange?.red.before ?? input.red.rating,
          input.ratingChange?.blue.before ?? input.blue.rating,
          input.ratingChange?.red.after ?? null,
          input.ratingChange?.blue.after ?? null,
          JSON.stringify(input.settings),
          JSON.stringify(input.steps.map((s) => [s.from, s.to])),
          input.steps.length,
          input.scores.red,
          input.scores.blue,
          input.winner,
          input.reason,
          input.startedAt,
          input.endedAt,
        );
        for (const side of ['red', 'blue'] as const) {
          const player = input[side];
          const current = getUser(player.id);
          if (!current) continue;
          const rating = input.ratingChange ? input.ratingChange[side].after : current.rating;
          const win = input.winner === side ? 1 : 0;
          const loss = input.winner !== null && input.winner !== side ? 1 : 0;
          const draw = input.winner === null ? 1 : 0;
          q.applyResult.run(rating, input.rated ? 1 : 0, win, loss, draw, player.id);
        }
      });
      return id;
    },

    getGame(id: string): GameDetail | null {
      const r = q.gameById.get(id) as GameRow | undefined;
      if (!r) return null;
      const steps = (JSON.parse(r.steps_json) as [number, number][]).map(([from, to]) => ({ from, to }));
      return { ...toGameSummary(r), settings: JSON.parse(r.settings_json) as RoomSettings, steps };
    },

    recentGames(userId: string, limit = 20): GameSummary[] {
      return (q.recentForUser.all(userId, userId, limit) as unknown as GameRow[]).map(toGameSummary);
    },

    profile(userId: string): PlayerProfile | null {
      const u = getUser(userId);
      if (!u) return null;
      const rated = q.ratedForUser.all(userId, userId) as unknown as GameRow[];
      const history = [{ at: u.createdAt, rating: START_RATING }];
      for (const g of rated) {
        const after = g.red_id === userId ? g.red_rating_after : g.blue_rating_after;
        if (after !== null) history.push({ at: g.ended_at, rating: after });
      }
      return {
        user: {
          id: u.id,
          name: u.name,
          rating: u.rating,
          games: u.games,
          wins: u.wins,
          losses: u.losses,
          draws: u.draws,
          createdAt: u.createdAt,
          lastSeenAt: u.lastSeenAt,
        },
        recent: (q.recentForUser.all(userId, userId, 20) as unknown as GameRow[]).map(toGameSummary),
        history,
      };
    },

    leaderboard(limit = 50): LeaderboardRow[] {
      return (q.leaderboard.all(limit) as unknown as UserRow[]).map((r, i) => ({
        rank: i + 1,
        user: { id: r.id, name: r.name, rating: r.rating },
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      }));
    },

    latestGames(limit = 10): GameSummary[] {
      return (q.latestGames.all(limit) as unknown as GameRow[]).map(toGameSummary);
    },

    gamesSince(ts: number): number {
      return (q.gamesSince.get(ts) as { n: number }).n;
    },

    countUsers(): number {
      return (q.countUsers.get() as { n: number }).n;
    },
  };
}
