// Per-device preferences, kept in localStorage.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BotLevel } from '../../../shared/bot.ts';
import type { Grade, Side } from '../../../shared/engine.ts';

/** The colours a board can be drawn in. */
export type BoardColours = 'felt' | 'slate' | 'paper' | 'chalk' | 'sky' | 'clay';
/** The player's choice: follow the game's grade, or one look for everything. */
export type BoardTheme = 'grade' | 'felt' | 'slate' | 'paper';
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
  /** Bot and pass-and-play games; online, the room's host decides. */
  autoCapture: boolean;
  /** The grade last chosen, used for the next quick match, room or local game. */
  grade: Grade;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      boardTheme: 'grade',
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
      autoCapture: true,
      grade: 7,
      set: (patch) => set(patch),
    }),
    {
      name: 'scidama.prefs',
      version: 2,
      // Felt was the old default, not a choice, so those players get the new default. It looks the same in Grade 7.
      migrate: (saved, version) => {
        const prefs = saved as Prefs;
        return version < 2 && prefs.boardTheme === 'felt' ? { ...prefs, boardTheme: 'grade' } : prefs;
      },
    },
  ),
);
