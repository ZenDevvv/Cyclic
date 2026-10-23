// Computer opponent. Searches whole turns (a multi-capture is one decision) with alpha-beta.
import {
  applyLegalStep,
  legalSteps,
  other,
  remainingTally,
  yOf,
  type GameState,
  type Side,
  type Step,
} from './engine.ts';

export type BotLevel = 'easy' | 'medium' | 'hard';

export const BOT_LEVELS: { id: BotLevel; name: string; description: string }[] = [
  { id: 'easy', name: 'Easy', description: 'Looks one turn ahead and often misses things.' },
  { id: 'medium', name: 'Medium', description: 'Looks three turns ahead.' },
  { id: 'hard', name: 'Hard', description: 'Thinks for up to a second, often six or more turns ahead.' },
];

interface Turn {
  steps: Step[];
  state: GameState;
}

const MAX_TURNS = 400; // guards pathological capture trees

/** Every complete turn available to the side to move. */
export function turnsFrom(state: GameState): Turn[] {
  const out: Turn[] = [];
  const walk = (s: GameState, path: Step[]) => {
    if (out.length >= MAX_TURNS) return;
    for (const legal of legalSteps(s)) {
      const { state: next, record } = applyLegalStep(s, legal);
      const steps = [...path, { from: legal.from, to: legal.to }];
      if (record.continues && !next.result) walk(next, steps);
      else out.push({ steps, state: next });
    }
  };
  walk(state, []);
  return out;
}

const WIN = 100_000;

/** Static evaluation from `side`'s point of view, in pesos. */
export function evaluate(state: GameState, side: Side): number {
  if (state.result) {
    const { winner } = state.result;
    if (winner === null) return 0;
    return winner === side ? WIN : -WIN;
  }
  const tally = remainingTally(state.board);
  const opp = other(side);
  // Projected final score difference: captured points plus chips still standing.
  let score = state.scores[side] + tally[side].total - (state.scores[opp] + tally[opp].total);
  // Small positional terms: advance toward crowning, keep damas.
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const sign = p.side === side ? 1 : -1;
    if (p.king) score += sign * 6;
    else score += sign * 0.6 * (p.side === 'red' ? yOf(i) : 7 - yOf(i));
  }
  return score;
}

interface SearchCtx {
  deadline: number;
  nodes: number;
  aborted: boolean;
}

function negamax(state: GameState, depth: number, alpha: number, beta: number, ctx: SearchCtx): number {
  const side = state.turn;
  if (depth === 0 || state.result) return evaluate(state, side);
  if ((++ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) ctx.aborted = true;
  if (ctx.aborted) return evaluate(state, side);
  const turns = turnsFrom(state);
  if (!turns.length) return evaluate(state, side);
  order(turns, side);
  let best = -Infinity;
  for (const t of turns) {
    // Scores are from the mover's view; a turn always hands over to the other side.
    const v = -negamax(t.state, depth - 1, -beta, -alpha, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Captures and big immediate gains first, which makes alpha-beta cut far more. */
function order(turns: Turn[], side: Side): void {
  const gain = (t: Turn) => t.state.scores[side] * 4 + t.steps.length * 3;
  turns.sort((a, b) => gain(b) - gain(a));
}

export interface ChooseOptions {
  rng?: () => number;
  /** Milliseconds the search may use (hard level). */
  budgetMs?: number;
}

/** Pick a full turn (one or more steps) for the side to move. Returns [] if there is nothing to play. */
export function chooseTurn(state: GameState, level: BotLevel, opts: ChooseOptions = {}): Step[] {
  const rng = opts.rng ?? Math.random;
  const side = state.turn;
  const turns = turnsFrom(state);
  if (!turns.length) return [];
  if (turns.length === 1) return turns[0].steps;

  const depth = level === 'easy' ? 1 : level === 'medium' ? 3 : 8;
  const budget = opts.budgetMs ?? (level === 'hard' ? 900 : 300);
  const ctx: SearchCtx = { deadline: Date.now() + budget, nodes: 0, aborted: false };

  // Iterative deepening so the hard level always has an answer when time runs out.
  let scored = turns.map((t) => ({ t, v: evaluate(t.state, side) }));
  for (let d = 1; d <= depth; d++) {
    const pass = turns.map((t) => ({ t, v: -negamax(t.state, d - 1, -Infinity, Infinity, ctx) }));
    if (ctx.aborted) break;
    scored = pass;
  }

  scored.sort((a, b) => b.v - a.v);
  if (level === 'easy') {
    // Plays loosely: a random pick among the better half, and sometimes any move at all.
    if (rng() < 0.25) return turns[Math.floor(rng() * turns.length)].steps;
    const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    return pool[Math.floor(rng() * pool.length)].t.steps;
  }
  // Break ties randomly so games differ.
  const top = scored.filter((s) => s.v >= scored[0].v - (level === 'medium' ? 1 : 0.01));
  return top[Math.floor(rng() * top.length)].t.steps;
}
