// "Attract mode": the title screen's game plays itself, bot against bot, like an arcade cabinet.
// Pauses when it is off screen or the tab is hidden; under reduced motion it holds a still position.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { legalSteps, replay, type GameState, type Step, type StepRecord } from '../../../../shared/engine.ts';
import type { BotLevel } from '../../../../shared/bot.ts';
import { askBot } from '../../lib/bot.ts';

/** A few random plies so the first captures come quickly. */
function opening(plies: number): Step[] {
  let { state } = replay([]);
  const steps: Step[] = [];
  for (let i = 0; i < plies && !state.result; i++) {
    const legal = legalSteps(state);
    // Keep the opening quiet: prefer plain moves so the show starts with the first capture.
    const quiet = legal.filter((l) => l.capture === null);
    const pool = quiet.length ? quiet : legal;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    steps.push({ from: pick.from, to: pick.to });
    state = replay(steps).state;
  }
  return steps;
}

const STEP_MS = 850;
const TURN_PAUSE_MS = 650;
const RESULT_HOLD_MS = 4200;
const MAX_TURNS = 70;

export interface AttractGame {
  state: GameState;
  records: StepRecord[];
  steps: Step[];
  /** Steps up to the start of the current turn: a clean position to take over from. */
  takeoverSteps: Step[];
  running: boolean;
}

export function useAttractGame(container: RefObject<HTMLElement | null>): AttractGame {
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [steps, setSteps] = useState<Step[]>(() => opening(6));
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const round = useRef(0);

  const { state, records } = useMemo(() => {
    try {
      return replay(steps);
    } catch {
      return replay([]);
    }
  }, [steps]);

  useEffect(() => {
    const el = container.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [container]);

  useEffect(() => {
    const on = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const running = !reduced && visible && pageVisible;

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const done = !!state.result || state.turnNumber > MAX_TURNS;

    if (done) {
      // Hold the finished board, then deal a new game.
      timers.push(
        setTimeout(() => {
          round.current++;
          setSteps(opening(4 + (round.current % 5)));
        }, RESULT_HOLD_MS),
      );
      return () => timers.forEach(clearTimeout);
    }

    // Uneven sides make for livelier games: one side a little sharper than the other.
    const level: BotLevel = (state.turn === 'red') === (round.current % 2 === 0) ? 'medium' : 'easy';
    const job = askBot(state, level);
    void job.result.then((turn) => {
      if (!alive || !turn.length) return;
      turn.forEach((step, i) => {
        timers.push(
          setTimeout(() => {
            if (alive) setSteps((s) => [...s, step]);
          }, TURN_PAUSE_MS + i * STEP_MS),
        );
      });
    });
    return () => {
      alive = false;
      job.cancel();
      timers.forEach(clearTimeout);
    };
    // A new turn starts when the side to move changes or the game ends.
  }, [running, state.turnNumber, state.result]);

  const takeoverSteps = useMemo(() => {
    if (!state.jumper) return steps;
    const firstOfTurn = records.find((r) => r.turn === state.turnNumber);
    return firstOfTurn ? steps.slice(0, firstOfTurn.index) : steps;
  }, [steps, records, state.jumper, state.turnNumber]);

  return { state, records, steps, takeoverSteps, running };
}
