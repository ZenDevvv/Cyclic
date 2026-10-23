// Per-device preferences, kept in localStorage.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BotLevel } from '../../../shared/bot.ts';
import type { Side } from '../../../shared/engine.ts';

export type BoardTheme = 'felt' | 'slate' | 'paper';
export type PieceSet = 'flat' | 'classic';

export interface Prefs {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  sound: boolean;
  volume: number; // 0..1
  hints: boolean;
  coordinates: boolean;
  motion: boolean;
  confirmResign: boolean;
  botLevel: BotLevel;
  botSide: Side | 'random';
  localAutoFlip: boolean;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      boardTheme: 'felt',
      pieceSet: 'flat',
      sound: true,
      volume: 0.6,
      hints: true,
      coordinates: true,
      motion: true,
      confirmResign: true,
      botLevel: 'medium',
      botSide: 'red',
      localAutoFlip: false,
      set: (patch) => set(patch),
    }),
    { name: 'scidama.prefs', version: 1 },
  ),
);
