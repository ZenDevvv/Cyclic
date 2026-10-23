// Runs the bot in a Web Worker so the board never freezes while it thinks.
import type { BotLevel } from '../../../shared/bot.ts';
import type { GameState, Step } from '../../../shared/engine.ts';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (steps: Step[]) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; steps: Step[] }>) => {
      pending.get(e.data.id)?.(e.data.steps);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

/** Ask the bot for a full turn. Resolves with [] if cancelled via the returned function. */
export function askBot(state: GameState, level: BotLevel): { result: Promise<Step[]>; cancel: () => void } {
  const id = ++seq;
  let cancel = () => {};
  const result = new Promise<Step[]>((resolve) => {
    pending.set(id, resolve);
    cancel = () => {
      pending.delete(id);
      resolve([]);
    };
    getWorker().postMessage({ id, state, level });
  });
  return { result, cancel };
}
