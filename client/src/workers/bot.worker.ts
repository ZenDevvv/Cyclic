/// <reference lib="webworker" />
import { chooseTurn, type BotLevel } from '../../../shared/bot.ts';
import type { GameState } from '../../../shared/engine.ts';

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; level: BotLevel }>) => {
  const { id, state, level } = e.data;
  const steps = chooseTurn(state, level);
  (self as unknown as Worker).postMessage({ id, steps });
};
