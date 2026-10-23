// Quick match: one queue per time-control preset, paired by closest rating with a widening window.
import { PRESET_IDS, type PresetId } from '../shared/presets.ts';
import type { UserSummary } from '../shared/protocol.ts';
import { RoomError, type IO, type IOSocket, type RoomManager } from './rooms.ts';

interface Entry {
  user: UserSummary;
  preset: PresetId;
  since: number;
}

export interface MatchmakerOptions {
  /** Rating window starts at `baseWindow` and widens by `widenBy` every `widenEveryMs`. */
  baseWindow?: number;
  widenBy?: number;
  widenEveryMs?: number;
  now?: () => number;
}

export class Matchmaker {
  private entries = new Map<string, Entry>();
  private io: IO;
  private rooms: RoomManager;
  private timer: NodeJS.Timeout;
  private baseWindow: number;
  private widenBy: number;
  private widenEveryMs: number;
  private now: () => number;

  constructor(io: IO, rooms: RoomManager, opts: MatchmakerOptions = {}) {
    this.io = io;
    this.rooms = rooms;
    this.baseWindow = opts.baseWindow ?? 100;
    this.widenBy = opts.widenBy ?? 100;
    this.widenEveryMs = opts.widenEveryMs ?? 5000;
    this.now = opts.now ?? Date.now;
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  counts(): Record<PresetId, number> {
    const out = Object.fromEntries(PRESET_IDS.map((p) => [p, 0])) as Record<PresetId, number>;
    for (const e of this.entries.values()) out[e.preset]++;
    return out;
  }

  join(socket: IOSocket, preset: PresetId): void {
    const user = socket.data.user;
    const seat = this.rooms.activeSeat(user.id);
    if (seat?.room.phase === 'playing') {
      throw new RoomError('already_seated', 'You are in a game right now.', seat.room.code);
    }
    const existing = this.entries.get(user.id);
    this.entries.set(user.id, { user, preset, since: existing?.preset === preset ? existing.since : this.now() });
    this.match(preset);
    this.emitAll();
    this.rooms.scheduleLobby();
  }

  leave(userId: string): void {
    if (!this.entries.delete(userId)) return;
    this.io.to(`user:${userId}`).emit('queue:state', { preset: null, since: null, waiting: 0 });
    this.emitAll();
    this.rooms.scheduleLobby();
  }

  onConnect(socket: IOSocket): void {
    const e = this.entries.get(socket.data.user.id);
    if (e) socket.emit('queue:state', this.stateFor(e));
  }

  onDisconnect(socket: IOSocket): void {
    const userId = socket.data.user.id;
    for (const s of this.io.sockets.sockets.values()) {
      if (s.id !== socket.id && s.data.user.id === userId) return; // still connected elsewhere
    }
    this.leave(userId);
  }

  private window(e: Entry): number {
    return this.baseWindow + this.widenBy * Math.floor((this.now() - e.since) / this.widenEveryMs);
  }

  private match(preset: PresetId): void {
    const waiting = [...this.entries.values()].filter((e) => e.preset === preset).sort((a, b) => a.since - b.since);
    const taken = new Set<string>();
    for (const a of waiting) {
      if (taken.has(a.user.id)) continue;
      let best: Entry | null = null;
      for (const b of waiting) {
        if (b.user.id === a.user.id || taken.has(b.user.id)) continue;
        const gap = Math.abs(a.user.rating - b.user.rating);
        if (gap > Math.max(this.window(a), this.window(b))) continue;
        if (!best || gap < Math.abs(a.user.rating - best.user.rating)) best = b;
      }
      if (!best) continue;
      taken.add(a.user.id);
      taken.add(best.user.id);
      this.entries.delete(a.user.id);
      this.entries.delete(best.user.id);
      try {
        const room = this.rooms.createQuick(a.user, best.user, preset);
        for (const u of [a.user, best.user]) {
          this.io.to(`user:${u.id}`).emit('queue:state', { preset: null, since: null, waiting: 0 });
          this.io.to(`user:${u.id}`).emit('queue:matched', { code: room.code });
        }
      } catch (err) {
        // One of them sat down in a game meanwhile; put the other back in line.
        console.warn('quick match failed', err);
        for (const e of [a, best]) if (!this.rooms.activeSeat(e.user.id)) this.entries.set(e.user.id, e);
      }
    }
  }

  private tick(): void {
    if (!this.entries.size) return;
    for (const p of PRESET_IDS) this.match(p);
    this.emitAll();
  }

  private stateFor(e: Entry) {
    return { preset: e.preset, since: e.since, waiting: this.counts()[e.preset] };
  }

  private emitAll(): void {
    for (const e of this.entries.values()) this.io.to(`user:${e.user.id}`).emit('queue:state', this.stateFor(e));
  }
}
