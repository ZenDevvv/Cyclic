// REST API: sessions, profile, leaderboard, saved games, stats.
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { NameTakenError, toMe, type Repo, type User } from './db.ts';
import { hashPassword, hashToken, NAME_RULE, normaliseName, startSession, userForToken, verifyPassword } from './auth.ts';
import { guestName } from './names.ts';
import { RateLimiter } from './limiter.ts';
import type { ErrorBody, ErrorCode, SessionResponse, StatsResponse } from '../shared/protocol.ts';

export interface HttpDeps {
  repo: Repo;
  /** New guests per minute per IP (default 10). */
  guestsPerMinute?: number;
  presence: () => { online: number; playing: number };
  /** Called after a rename so live rooms show the new name. */
  onUserChanged: (user: User) => void;
}

type Authed = Request & { user?: User; token?: string };

const fail = (res: Response, status: number, error: ErrorCode, message: string) =>
  res.status(status).json({ ok: false, error, message } satisfies ErrorBody);

const bearer = (req: Request): string | null => {
  const h = req.header('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

export function apiRouter({ repo, presence, onUserChanged, guestsPerMinute = 10 }: HttpDeps): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '8kb' }));

  const guestLimiter = new RateLimiter(guestsPerMinute, guestsPerMinute / 60);
  const loginLimiter = new RateLimiter(8, 8 / 60);

  const requireUser = (req: Authed, res: Response, next: NextFunction) => {
    const token = bearer(req);
    const user = userForToken(repo, token);
    if (!user) return fail(res, 401, 'unauthorized', 'Your session has expired. Reload to start a new one.');
    req.user = user;
    req.token = token!;
    next();
  };

  r.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  r.post('/guest', (req, res) => {
    if (!guestLimiter.take(req.ip ?? 'unknown')) return fail(res, 429, 'rate_limited', 'Too many new players from here. Try again in a minute.');
    let user: User | null = null;
    for (let i = 0; i < 20 && !user; i++) {
      try {
        user = repo.createUser(guestName());
      } catch (err) {
        if (!(err instanceof NameTakenError)) throw err;
      }
    }
    if (!user) return fail(res, 500, 'server', 'Could not pick a free name. Try again.');
    const token = startSession(repo, user.id);
    res.json({ token, me: toMe(user) } satisfies SessionResponse);
  });

  r.get('/me', requireUser, (req: Authed, res) => {
    repo.touchUser(req.user!.id);
    res.json(toMe(req.user!));
  });

  r.patch('/me', requireUser, (req: Authed, res) => {
    const body = z.object({ name: z.string().max(60) }).safeParse(req.body);
    const name = body.success ? normaliseName(body.data.name) : null;
    if (!name) return fail(res, 400, 'invalid', NAME_RULE);
    try {
      const user = repo.renameUser(req.user!.id, name);
      onUserChanged(user);
      res.json(toMe(user));
    } catch (err) {
      if (err instanceof NameTakenError) return fail(res, 409, 'name_taken', `“${name}” is taken. Try another name.`);
      throw err;
    }
  });

  r.post('/me/password', requireUser, (req: Authed, res) => {
    const body = z.object({ password: z.string().min(8).max(128) }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'invalid', 'Passwords are 8–128 characters.');
    const user = repo.setPassword(req.user!.id, hashPassword(body.data.password));
    res.json(toMe(user));
  });

  r.post('/login', (req, res) => {
    if (!loginLimiter.take(req.ip ?? 'unknown')) return fail(res, 429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
    const body = z.object({ name: z.string().max(60), password: z.string().max(128) }).safeParse(req.body);
    if (!body.success) return fail(res, 400, 'invalid', 'Enter your name and password.');
    const user = repo.getUserByName(body.data.name.trim().replace(/\s+/g, ' '));
    if (!user?.passwordHash || !verifyPassword(body.data.password, user.passwordHash)) {
      return fail(res, 401, 'bad_credentials', 'That name and password do not match.');
    }
    const token = startSession(repo, user.id);
    res.json({ token, me: toMe(user) } satisfies SessionResponse);
  });

  r.post('/logout', requireUser, (req: Authed, res) => {
    repo.deleteSession(hashToken(req.token!));
    res.json({ ok: true });
  });

  r.get('/leaderboard', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    res.json(repo.leaderboard(limit));
  });

  r.get('/players/:id', (req, res) => {
    const profile = repo.profile(String(req.params.id));
    if (!profile) return fail(res, 404, 'not_found', 'No player with that id.');
    res.json(profile);
  });

  r.get('/games', (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    res.json(repo.latestGames(limit));
  });

  r.get('/games/:id', (req, res) => {
    const game = repo.getGame(String(req.params.id));
    if (!game) return fail(res, 404, 'not_found', 'No saved game with that id.');
    res.json(game);
  });

  r.get('/stats', (_req, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    res.json({ ...presence(), gamesToday: repo.gamesSince(startOfDay.getTime()), players: repo.countUsers() } satisfies StatsResponse);
  });

  r.use((_req, res) => {
    fail(res, 404, 'not_found', 'Unknown API route.');
  });

  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) return fail(res, 400, 'invalid', 'Malformed JSON.');
    console.error(err);
    fail(res, 500, 'server', 'Something went wrong on our side.');
  });

  return r;
}
