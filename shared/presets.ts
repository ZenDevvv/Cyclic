// Time controls and room defaults shared by the lobby, the server and matchmaking.
import type { Side } from './engine.ts';

export type PresetId = 'blitz' | 'standard' | 'long';

export interface Preset {
  id: PresetId;
  name: string;
  gameMinutes: number;
  moveSeconds: number;
  blurb: string;
}

export const PRESETS: Record<PresetId, Preset> = {
  blitz: { id: 'blitz', name: 'Blitz', gameMinutes: 10, moveSeconds: 30, blurb: 'Fast and sharp' },
  standard: { id: 'standard', name: 'Standard', gameMinutes: 20, moveSeconds: 60, blurb: 'Classic Damath timing' },
  long: { id: 'long', name: 'Long', gameMinutes: 30, moveSeconds: 90, blurb: 'Time to do the maths' },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** 0 means no clock. */
export const GAME_MINUTES = [0, 10, 20, 30] as const;
export const MOVE_SECONDS = [0, 30, 60, 90] as const;

export type HostSide = Side | 'random';

export interface RoomSettings {
  gameMinutes: number;
  moveSeconds: number;
  rated: boolean;
  hostSide: HostSide;
  allowSpectators: boolean;
  maxCapture: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  gameMinutes: 20,
  moveSeconds: 60,
  rated: false,
  hostSide: 'random',
  allowSpectators: true,
  maxCapture: false,
};

export function timeControlLabel(s: Pick<RoomSettings, 'gameMinutes' | 'moveSeconds'>): string {
  if (!s.gameMinutes && !s.moveSeconds) return 'No clock';
  const parts: string[] = [];
  parts.push(s.gameMinutes ? `${s.gameMinutes} min` : 'no game clock');
  parts.push(s.moveSeconds ? `${s.moveSeconds} s a move` : 'no move clock');
  return parts.join(' · ');
}

export function presetFor(s: Pick<RoomSettings, 'gameMinutes' | 'moveSeconds'>): Preset | null {
  return Object.values(PRESETS).find((p) => p.gameMinutes === s.gameMinutes && p.moveSeconds === s.moveSeconds) ?? null;
}

/** Seconds a disconnected player has to come back before forfeiting a game in progress. */
export const RECONNECT_GRACE_SECONDS = 90;
