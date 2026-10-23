// Socket.IO wiring: authenticate the handshake, validate every payload, route to rooms and the queue.
import { z } from 'zod';
import { userForToken } from './auth.ts';
import { toSummary, type Repo } from './db.ts';
import { RateLimiter } from './limiter.ts';
import { RoomError, toAckError, type IO, type IOSocket, type RoomManager } from './rooms.ts';
import type { Matchmaker } from './matchmaking.ts';
import { GAME_MINUTES, MOVE_SECONDS, PRESET_IDS } from '../shared/presets.ts';
import type { AckResult } from '../shared/protocol.ts';

const settingsSchema = z
  .object({
    gameMinutes: z.number().refine((n) => (GAME_MINUTES as readonly number[]).includes(n)),
    moveSeconds: z.number().refine((n) => (MOVE_SECONDS as readonly number[]).includes(n)),
    rated: z.boolean(),
    hostSide: z.enum(['red', 'blue', 'random']),
    allowSpectators: z.boolean(),
    maxCapture: z.boolean(),
  })
  .partial()
  .strict();

const square = z.number().int().min(0).max(63);
const visibility = z.enum(['public', 'private']);

const schemas = {
  create: z.object({ visibility, settings: settingsSchema }),
  join: z.object({ code: z.string().trim().min(4).max(8).regex(/^[A-Za-z0-9]+$/), as: z.enum(['player', 'spectator']) }),
  settings: z.object({ settings: settingsSchema, visibility: visibility.optional() }),
  step: z.object({ from: square, to: square }),
  drawAnswer: z.object({ accept: z.boolean() }),
  rematch: z.object({ want: z.boolean() }),
  chat: z.object({ text: z.string().min(1).max(400) }),
  queue: z.object({ preset: z.enum(PRESET_IDS as [string, ...string[]]) }),
};

const invalid = (message = 'That request was not understood.'): AckResult => ({ ok: false, error: 'invalid', message });

export function attachSockets(io: IO, repo: Repo, rooms: RoomManager, queue: Matchmaker): void {
  const events = new RateLimiter(30, 15); // per socket, all events
  const chats = new RateLimiter(3, 1 / 0.7); // per user, chat

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown })?.token;
    const user = userForToken(repo, typeof token === 'string' ? token : null);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = toSummary(user);
    repo.touchUser(user.id);
    next();
  });

  io.on('connection', (raw) => {
    const socket = raw as IOSocket;
    rooms.onConnect(socket);
    queue.onConnect(socket);

    /** Wrap a handler: rate limit, validate, catch, always ack once. */
    const on = <S extends z.ZodType>(
      event: string,
      schema: S | null,
      handler: (input: z.infer<S>) => AckResult | void,
    ) => {
      socket.on(event as never, ((...args: unknown[]) => {
        const ack = typeof args[args.length - 1] === 'function' ? (args.pop() as (r: AckResult) => void) : () => {};
        if (!events.take(socket.id)) return ack({ ok: false, error: 'rate_limited', message: 'Slow down a little.' });
        let input: unknown = undefined;
        if (schema) {
          const parsed = schema.safeParse(args[0]);
          if (!parsed.success) return ack(invalid());
          input = parsed.data;
        }
        try {
          ack(handler(input as z.infer<S>) ?? { ok: true });
        } catch (err) {
          ack(toAckError(err));
        }
      }) as never);
    };

    socket.on('lobby:subscribe', () => {
      socket.join('lobby');
      socket.emit('lobby:state', rooms.lobbyState(queue.counts()));
    });
    socket.on('lobby:unsubscribe', () => {
      socket.leave('lobby');
    });

    on('room:create', schemas.create, (input) => {
      queue.leave(socket.data.user.id);
      const room = rooms.create(socket, input.visibility, input.settings);
      return { ok: true, code: room.code };
    });
    on('room:join', schemas.join, (input) => ({ ok: true, role: rooms.join(socket, input.code.toUpperCase(), input.as) }));
    on('room:leave', null, () => rooms.leave(socket));
    on('room:settings', schemas.settings, (input) => rooms.updateSettings(socket, input.settings, input.visibility));
    on('room:start', null, () => rooms.start(socket));
    on('room:sync', null, () => rooms.sync(socket));
    on('game:step', schemas.step, (input) => rooms.step(socket, input));
    on('game:resign', null, () => rooms.resign(socket));
    on('game:draw-offer', null, () => rooms.offerDraw(socket));
    on('game:draw-answer', schemas.drawAnswer, (input) => rooms.answerDraw(socket, input.accept));
    on('game:rematch', schemas.rematch, (input) => rooms.rematch(socket, input.want));
    on('chat:send', schemas.chat, (input) => {
      if (!chats.take(socket.data.user.id)) throw new RoomError('rate_limited', 'You are sending messages too fast.');
      rooms.chat(socket, input.text);
    });
    on('queue:join', schemas.queue, (input) => queue.join(socket, input.preset as never));
    on('queue:leave', null, () => queue.leave(socket.data.user.id));

    socket.on('disconnect', () => {
      rooms.onDisconnect(socket);
      queue.onDisconnect(socket);
    });
  });
}
