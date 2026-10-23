// The original Cyclic sound effects, mapped to what happened on the board.
import type { StepRecord } from '../../../shared/engine.ts';
import { usePrefs } from '../store/prefs.ts';

const FILES = {
  move: 'move_normal001',
  kingMove: 'move_king001',
  capture: 'move_attack001',
  combo: 'move_attackcombo001',
  kingCapture: 'move_kingattack001',
  crown: 'move_promotion001',
  illegal: 'move_illegal001',
  win: 'endgame_win001',
  lose: 'endgame_lose001',
  draw: 'endgame_win002',
} as const;

type SoundName = keyof typeof FILES;

const cache = new Map<SoundName, HTMLAudioElement>();

export function play(name: SoundName): void {
  const { sound, volume } = usePrefs.getState();
  if (!sound || typeof Audio === 'undefined') return;
  let base = cache.get(name);
  if (!base) {
    base = new Audio(`/sfx/${FILES[name]}.mp3`);
    base.preload = 'auto';
    cache.set(name, base);
  }
  // Clone so quick successive sounds overlap instead of cutting each other off.
  const a = base.cloneNode(true) as HTMLAudioElement;
  a.volume = Math.max(0, Math.min(1, volume));
  void a.play().catch(() => {});
}

export function playStep(r: StepRecord): void {
  if (r.crowned) return play('crown');
  if (r.captured) return play(r.piece.king ? 'kingCapture' : r.continues ? 'combo' : 'capture');
  play(r.piece.king ? 'kingMove' : 'move');
}

export const playEnd = (outcome: 'win' | 'lose' | 'draw') => play(outcome);
export const playIllegal = () => play('illegal');
