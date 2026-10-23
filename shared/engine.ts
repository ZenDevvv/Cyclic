// Scidama rules engine. The only place the game rules live (see docs/RULES.md).
// Pure functions over plain data so the server, the client and the bot share one implementation.

export type Side = 'red' | 'blue';
export type Unit = 'P' | 'kWh';
export type Op = 'add' | 'sub' | 'mul' | 'div';

export interface Piece {
  id: string; // stable for the whole game, e.g. "r-P12", "b-kWh3"
  side: Side;
  unit: Unit;
  value: number;
  king: boolean;
}

export type Cell = Piece | null;

export interface Rules {
  /** Official Damath rule: a side must take the sequence that captures the most chips. */
  maxCapture: boolean;
}

export const DEFAULT_RULES: Rules = { maxCapture: false };

/** A step is one plain move or one jump. A multi-capture is several steps by the same side. */
export interface Step {
  from: number;
  to: number;
}

export interface LegalStep extends Step {
  /** Square of the chip this step captures, or null for a plain move. */
  capture: number | null;
}

export interface Equation {
  op: Op;
  a: { unit: Unit; value: number; king: boolean };
  b: { unit: Unit; value: number; king: boolean };
  sameUnit: boolean;
  /** Result of the arithmetic in the attacker's unit; null means no score (NS). */
  base: number | null;
  /** ×2 for an attacking dama, ×2 for a captured dama. */
  kingFactor: number;
  /** ×3 when the result is in kWh (₱3 per kWh). */
  unitFactor: number;
  /** Pesos added to the attacker's score. */
  points: number;
}

export interface StepRecord {
  index: number; // 0-based step number in the game
  turn: number; // 1-based turn number; a multi-capture shares one turn
  side: Side;
  piece: Piece; // the chip as it was before the step
  from: number;
  to: number;
  op: Op; // operator on the landing square
  captured: Piece | null;
  captureSquare: number | null;
  equation: Equation | null;
  points: number;
  crowned: boolean;
  /** True when the same chip must capture again (the turn is not over). */
  continues: boolean;
}

export type EndReason =
  | 'elimination' // a side has no chips
  | 'blocked' // the side to move has no legal step
  | 'time' // the game clock ran out
  | 'timeout' // a player's move clock ran out
  | 'resign'
  | 'agreement'
  | 'abandon';

export interface TallyItem {
  piece: Piece;
  square: number;
  points: number;
}

export interface Tally {
  items: TallyItem[];
  total: number;
}

export interface GameResult {
  winner: Side | null; // null = draw
  reason: EndReason;
  /** Points for chips still on the board. */
  tally: Record<Side, Tally>;
  /** Capture points + remaining-chip tally. */
  final: Record<Side, number>;
}

export interface GameState {
  board: Cell[]; // 64 squares, index = y * 8 + x
  turn: Side;
  scores: Record<Side, number>;
  /** Square of the chip that must keep capturing, or null at the start of a turn. */
  jumper: number | null;
  rules: Rules;
  stepCount: number;
  turnNumber: number;
  result: GameResult | null;
}

// ---------------------------------------------------------------- board geometry

export const SIZE = 8;

export const sq = (x: number, y: number): number => y * SIZE + x;
export const xOf = (i: number): number => i % SIZE;
export const yOf = (i: number): number => Math.floor(i / SIZE);
export const onBoard = (x: number, y: number): boolean => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
export const isPlayable = (i: number): boolean => (xOf(i) + yOf(i)) % 2 === 1;
export const other = (side: Side): Side => (side === 'red' ? 'blue' : 'red');

/** The 32 playable squares in index order. */
export const PLAYABLE: readonly number[] = Array.from({ length: 64 }, (_, i) => i).filter(isPlayable);

const OP_ROWS: Record<number, Op[]> = {
  // row y → operators on its playable squares, left to right (see docs/RULES.md)
  7: ['mul', 'div', 'sub', 'add'],
  6: ['div', 'mul', 'add', 'sub'],
  5: ['sub', 'add', 'mul', 'div'],
  4: ['add', 'sub', 'div', 'mul'],
  3: ['mul', 'div', 'sub', 'add'],
  2: ['div', 'mul', 'add', 'sub'],
  1: ['sub', 'add', 'mul', 'div'],
  0: ['add', 'sub', 'div', 'mul'],
};

/** Operator on each square (null on squares that are not playable). */
export const OPERATORS: readonly (Op | null)[] = Array.from({ length: 64 }, (_, i) => {
  if (!isPlayable(i)) return null;
  const y = yOf(i);
  const rowSquares = PLAYABLE.filter((p) => yOf(p) === y);
  return OP_ROWS[y][rowSquares.indexOf(i)];
});

const DIRS: readonly [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

const forward = (side: Side): number => (side === 'red' ? 1 : -1);
const farRow = (side: Side): number => (side === 'red' ? SIZE - 1 : 0);

// ---------------------------------------------------------------- setup

type Seed = [x: number, y: number, unit: Unit, value: number];

const RED_START: Seed[] = [
  [1, 0, 'P', 12], [3, 0, 'kWh', 9], [5, 0, 'P', 6], [7, 0, 'kWh', 3],
  [0, 1, 'kWh', 1], [2, 1, 'P', 4], [4, 1, 'kWh', 11], [6, 1, 'P', 8],
  [1, 2, 'P', 10], [3, 2, 'kWh', 7], [5, 2, 'P', 2], [7, 2, 'kWh', 5],
];

export const pieceId = (side: Side, unit: Unit, value: number): string => `${side[0]}-${unit}${value}`;

export function initialBoard(): Cell[] {
  const board: Cell[] = new Array(64).fill(null);
  for (const [x, y, unit, value] of RED_START) {
    board[sq(x, y)] = { id: pieceId('red', unit, value), side: 'red', unit, value, king: false };
    // Blue mirrors red under a 180° turn.
    board[sq(7 - x, 7 - y)] = { id: pieceId('blue', unit, value), side: 'blue', unit, value, king: false };
  }
  return board;
}

export function initialState(rules: Partial<Rules> = {}): GameState {
  return {
    board: initialBoard(),
    turn: 'red',
    scores: { red: 0, blue: 0 },
    jumper: null,
    rules: { ...DEFAULT_RULES, ...rules },
    stepCount: 0,
    turnNumber: 1,
    result: null,
  };
}

// ---------------------------------------------------------------- move generation

/** Captures available to the chip on `from` (one jump each). */
export function capturesFrom(board: readonly Cell[], from: number): LegalStep[] {
  const piece = board[from];
  if (!piece) return [];
  const out: LegalStep[] = [];
  const x = xOf(from);
  const y = yOf(from);
  for (const [dx, dy] of DIRS) {
    if (!piece.king) {
      const mx = x + dx, my = y + dy, lx = x + 2 * dx, ly = y + 2 * dy;
      if (!onBoard(lx, ly)) continue;
      const mid = board[sq(mx, my)];
      if (mid && mid.side !== piece.side && !board[sq(lx, ly)]) {
        out.push({ from, to: sq(lx, ly), capture: sq(mx, my) });
      }
      continue;
    }
    // Flying dama: slide over empties, jump exactly one opponent, land anywhere beyond.
    let cx = x + dx, cy = y + dy;
    while (onBoard(cx, cy) && !board[sq(cx, cy)]) {
      cx += dx;
      cy += dy;
    }
    if (!onBoard(cx, cy)) continue;
    const target = board[sq(cx, cy)];
    if (!target || target.side === piece.side) continue;
    let lx = cx + dx, ly = cy + dy;
    while (onBoard(lx, ly) && !board[sq(lx, ly)]) {
      out.push({ from, to: sq(lx, ly), capture: sq(cx, cy) });
      lx += dx;
      ly += dy;
    }
  }
  return out;
}

/** Plain (non-capturing) moves for the chip on `from`. */
export function plainMovesFrom(board: readonly Cell[], from: number): LegalStep[] {
  const piece = board[from];
  if (!piece) return [];
  const out: LegalStep[] = [];
  const x = xOf(from);
  const y = yOf(from);
  for (const [dx, dy] of DIRS) {
    if (!piece.king) {
      if (dy !== forward(piece.side)) continue;
      const tx = x + dx, ty = y + dy;
      if (onBoard(tx, ty) && !board[sq(tx, ty)]) out.push({ from, to: sq(tx, ty), capture: null });
      continue;
    }
    let tx = x + dx, ty = y + dy;
    while (onBoard(tx, ty) && !board[sq(tx, ty)]) {
      out.push({ from, to: sq(tx, ty), capture: null });
      tx += dx;
      ty += dy;
    }
  }
  return out;
}

/** Board after one jump, for capture-chain search. Crowning waits for the end of the sequence. */
function jumpBoard(board: readonly Cell[], step: LegalStep): Cell[] {
  const next = board.slice();
  next[step.to] = next[step.from];
  next[step.from] = null;
  if (step.capture !== null) next[step.capture] = null;
  return next;
}

/** Most chips the chip on `from` can still capture in one sequence. */
export function longestChain(board: readonly Cell[], from: number, depth = 0): number {
  if (depth > 12) return 0;
  let best = 0;
  for (const step of capturesFrom(board, from)) {
    best = Math.max(best, 1 + longestChain(jumpBoard(board, step), step.to, depth + 1));
  }
  return best;
}

function keepLongest(board: readonly Cell[], steps: LegalStep[]): LegalStep[] {
  const scored = steps.map((s) => ({ s, n: 1 + longestChain(jumpBoard(board, s), s.to) }));
  const max = Math.max(...scored.map((x) => x.n));
  return scored.filter((x) => x.n === max).map((x) => x.s);
}

export function legalSteps(state: GameState): LegalStep[] {
  if (state.result) return [];
  const { board } = state;
  if (state.jumper !== null) {
    const caps = capturesFrom(board, state.jumper);
    return state.rules.maxCapture && caps.length ? keepLongest(board, caps) : caps;
  }
  const captures: LegalStep[] = [];
  for (const i of PLAYABLE) {
    if (board[i]?.side === state.turn) captures.push(...capturesFrom(board, i));
  }
  if (captures.length) return state.rules.maxCapture ? keepLongest(board, captures) : captures;
  const moves: LegalStep[] = [];
  for (const i of PLAYABLE) {
    if (board[i]?.side === state.turn) moves.push(...plainMovesFrom(board, i));
  }
  return moves;
}

/** Squares of chips that are obliged to capture this step (empty when no capture is available). */
export function mustCaptureSquares(state: GameState): number[] {
  const steps = legalSteps(state);
  if (!steps.length || steps[0].capture === null) return [];
  return [...new Set(steps.map((s) => s.from))];
}

// ---------------------------------------------------------------- scoring

export function scoreCapture(attacker: Piece, captured: Piece, op: Op): Equation {
  const sameUnit = attacker.unit === captured.unit;
  let base: number | null = null;
  if (sameUnit && op === 'add') base = attacker.value + captured.value;
  if (sameUnit && op === 'sub') {
    const diff = attacker.value - captured.value;
    base = diff >= 0 ? diff : null;
  }
  const kingFactor = (attacker.king ? 2 : 1) * (captured.king ? 2 : 1);
  const unitFactor = attacker.unit === 'kWh' ? 3 : 1;
  return {
    op,
    a: { unit: attacker.unit, value: attacker.value, king: attacker.king },
    b: { unit: captured.unit, value: captured.value, king: captured.king },
    sameUnit,
    base,
    kingFactor,
    unitFactor,
    points: base === null ? 0 : base * kingFactor * unitFactor,
  };
}

/** Pesos a chip is worth when it is still on the board at the end. */
export const piecePoints = (p: Piece): number => p.value * (p.king ? 2 : 1) * (p.unit === 'kWh' ? 3 : 1);

export function remainingTally(board: readonly Cell[]): Record<Side, Tally> {
  const tally: Record<Side, Tally> = { red: { items: [], total: 0 }, blue: { items: [], total: 0 } };
  board.forEach((piece, square) => {
    if (!piece) return;
    const points = piecePoints(piece);
    tally[piece.side].items.push({ piece, square, points });
    tally[piece.side].total += points;
  });
  return tally;
}

// ---------------------------------------------------------------- applying steps

export const countPieces = (board: readonly Cell[], side: Side): number =>
  board.reduce((n, p) => n + (p?.side === side ? 1 : 0), 0);

export class IllegalStepError extends Error {}

/**
 * Apply one step. Throws IllegalStepError when the step is not legal in this state.
 * Ends the game (elimination or blocked) when the turn passes to a side that cannot continue.
 */
export function applyStep(state: GameState, step: Step): { state: GameState; record: StepRecord } {
  const legal = legalSteps(state).find((s) => s.from === step.from && s.to === step.to);
  if (!legal) throw new IllegalStepError(`Illegal step ${step.from}→${step.to}`);
  return applyLegalStep(state, legal);
}

/** Apply a step already known to be legal (used by the bot's search). */
export function applyLegalStep(state: GameState, legal: LegalStep): { state: GameState; record: StepRecord } {
  const board = state.board.slice();
  const piece = board[legal.from]!;
  const side = piece.side;
  board[legal.from] = null;

  const captured = legal.capture !== null ? board[legal.capture] : null;
  if (legal.capture !== null) board[legal.capture] = null;

  const op = OPERATORS[legal.to]!;
  const equation = captured ? scoreCapture(piece, captured, op) : null;
  const points = equation?.points ?? 0;

  let moved: Piece = piece;
  board[legal.to] = moved;

  const continues = captured !== null && capturesFrom(board, legal.to).length > 0;
  let crowned = false;
  if (!continues && !piece.king && yOf(legal.to) === farRow(side)) {
    moved = { ...piece, king: true };
    board[legal.to] = moved;
    crowned = true;
  }

  const scores = { ...state.scores, [side]: state.scores[side] + points };
  let next: GameState = {
    ...state,
    board,
    scores,
    jumper: continues ? legal.to : null,
    turn: continues ? side : other(side),
    stepCount: state.stepCount + 1,
    turnNumber: continues ? state.turnNumber : state.turnNumber + 1,
  };

  const record: StepRecord = {
    index: state.stepCount,
    turn: state.turnNumber,
    side,
    piece,
    from: legal.from,
    to: legal.to,
    op,
    captured,
    captureSquare: legal.capture,
    equation,
    points,
    crowned,
    continues,
  };

  if (!continues) {
    if (countPieces(board, other(side)) === 0) next = endGame(next, 'elimination');
    else if (legalSteps(next).length === 0) next = endGame(next, 'blocked');
  }
  return { state: next, record };
}

/**
 * Finish the game. For elimination, blocked and time, the higher final score wins.
 * For timeout, resign and abandon pass the winner; agreement is a draw.
 */
export function endGame(state: GameState, reason: EndReason, winner?: Side | null): GameState {
  if (state.result) return state;
  const tally = remainingTally(state.board);
  const final = {
    red: state.scores.red + tally.red.total,
    blue: state.scores.blue + tally.blue.total,
  };
  let w: Side | null;
  if (reason === 'agreement') w = null;
  else if (winner !== undefined) w = winner;
  else w = final.red === final.blue ? null : final.red > final.blue ? 'red' : 'blue';
  return { ...state, jumper: null, result: { winner: w, reason, tally, final } };
}

/** Replay a list of steps from the start (used for replays and for restoring rooms). */
export function replay(steps: readonly Step[], rules: Partial<Rules> = {}): { state: GameState; records: StepRecord[] } {
  let state = initialState(rules);
  const records: StepRecord[] = [];
  for (const s of steps) {
    const r = applyStep(state, s);
    state = r.state;
    records.push(r.record);
  }
  return { state, records };
}
