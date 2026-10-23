// Builds the whole server (HTTP + sockets + DB). index.ts runs it; tests create their own.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { openRepo, toSummary } from './db.ts';
import { apiRouter } from './http.ts';
import { RoomManager, type IO } from './rooms.ts';
import { Matchmaker, type MatchmakerOptions } from './matchmaking.ts';
import { attachSockets } from './sockets.ts';

export interface ServerOptions {
  port: number;
  dbPath: string;
  corsOrigins?: string[];
  clientDist?: string | null;
  production?: boolean;
  timeScale?: number;
  matchmaking?: MatchmakerOptions;
  guestsPerMinute?: number;
  trustProxy?: number | boolean;
}

export async function createServer(opts: ServerOptions) {
  const repo = openRepo(opts.dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? false);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (opts.production) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; media-src 'self'; frame-ancestors 'none'",
      );
    }
    next();
  });

  const httpServer = http.createServer(app);
  const io: IO = new Server(httpServer, {
    cors: opts.corsOrigins?.length ? { origin: opts.corsOrigins } : undefined,
    maxHttpBufferSize: 16_384,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  const rooms = new RoomManager(io, repo, { timeScale: opts.timeScale });
  const queue = new Matchmaker(io, rooms, opts.matchmaking);
  rooms.onSeated = (userId) => queue.leave(userId);
  rooms.onLobbyChange = () => io.to('lobby').emit('lobby:state', rooms.lobbyState(queue.counts()));

  app.use(
    '/api',
    apiRouter({
      repo,
      guestsPerMinute: opts.guestsPerMinute,
      presence: () => rooms.presence(),
      onUserChanged: (user) => rooms.updateUser(toSummary(user)),
    }),
  );

  const dist = opts.clientDist;
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  attachSockets(io, repo, rooms, queue);

  await new Promise<void>((resolve) => httpServer.listen(opts.port, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    url: `http://localhost:${port}`,
    io,
    repo,
    rooms,
    queue,
    async close() {
      // Stop accepting events first, then drop sockets, then timers, then the database.
      rooms.dispose();
      queue.dispose();
      await io.close();
      repo.close();
    },
  };
}
