// Scidama rules engine. The only place the game rules live (see docs/RULES.md).
// Pure functions over plain data so the server, the client and the bot share one implementation.

export type Side = 'red' | 'blue';
export type Unit = 'P' | 'kWh' | 'sci' | 'pct' | 'F' | 'g' | 'C';
export type Op = 'add' | 'sub' | 'mul' | 'div';
/** A column on the score sheet. Humidity is scored in °F, so it has none; g·°C has no chip of its own. */
export type Column = Exclude<Unit, 'pct'> | 'gC';
export type Columns = Partial<Record<Column, number>>;
/** The unit a final score is written in. Grade 10's combines its columns into calories. */
export type ScoreUnit = Column | 'cal';

export interface Piece {
  id: string; // stable for the whole game, e.g. "r-P12", "b-kWh3"
  side: Side;
  unit: Unit;
  value: number;
  king: boolean;
}

export type Cell = Piece | null;

export interface Rules {
  grade: Grade;
  /** The "mayor" rules: a side must take the sequence with the most chips; on equal counts a dama goes first. */
  maxCapture: boolean;
}

export const DEFAULT_RULES: Rules = { grade: 7, maxCapture: true };

/** Pesos per kWh. It depends on the game maker; one value so a room setting can replace it later. */
export const KWH_RATE = 5;

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
  /** Score-sheet column the result goes in. */
  column: Column;
  /** The value that goes in the column, before any dama factor; null means no score (NS). */
  base: number | null;
  /** The arithmetic's own result when the grade converts it, such as 65% before it becomes 91°F. */
  converted?: Chip;
  /** ×2 for an attacking dama, ×2 for a captured dama. */
  kingFactor: number;
  /** What goes in the column: the base with the dama factors applied. */
  amount: number;
  /** Converts the column to the score, such as KWH_RATE for kWh; otherwise 1. */
  unitFactor: number;
  /** What this capture is worth in the score: the amount with the unit factor applied. */
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
  /** True when this capture was the only legal step. */
  forced: boolean;
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
  /** What the chips add to each column of the score sheet. */
  columns: Columns;
  total: number;
}

export interface GameResult {
  winner: Side | null; // null = draw
  reason: EndReason;
  /** Points for chips still on the board. */
  tally: Record<Side, Tally>;
  /** The grade's total of each side's columns, with the remaining chips added. */
  final: Record<Side, number>;
}

export interface GameState {
  board: Cell[]; // 64 squares, index = y * 8 + x
  turn: Side;
  /** Each side's score sheet. */
  columns: Record<Side, Columns>;
  /** Each side's score so far: always the grade's total of its columns. */
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

// ---------------------------------------------------------------- grades

export interface Chip {
  unit: Unit;
  value: number;
}

/** Everything that differs from one grade to the next. The board and the moves are shared. */
export interface GradeRules {
  name: string;
  /** Chips 1 to 12, as the published boards number them. Index 0 is chip 1. */
  chips: readonly Chip[];
  /** The score sheet's columns, in print order. */
  columns: readonly Column[];
  /** The unit a final score is written in. */
  scoreUnit: ScoreUnit;
  /** The arithmetic of a capture, before any dama factor. A null base is no score (NS). */
  capture(attacker: Piece, captured: Piece, op: Op): { column: Column; base: number | null; converted?: Chip };
  /** Where a chip left on the board goes on the sheet, before any dama factor. */
  remaining(piece: Piece): { column: Column; amount: number };
  /** Converts a column to the score, for grades that add their columns up. */
  unitFactor(column: Column): number;
  /** The score a sheet comes to. The lower score wins in every grade. */
  total(columns: Columns): number;
}

/** Adding or subtracting like quantities, the arithmetic every grade shares. Below zero is no score. */
function likeUnits(attacker: Piece, captured: Piece, op: Op): number | null {
  if (op === 'add') return attacker.value + captured.value;
  if (op !== 'sub') return null;
  const diff = attacker.value - captured.value;
  return diff >= 0 ? diff : null;
}

const electroColumn = (unit: Unit): Column => (unit === 'kWh' ? 'kWh' : 'P');

const ELECTRO: GradeRules = {
  name: 'Electro',
  chips: [
    { unit: 'kWh', value: 1 }, { unit: 'P', value: 2 }, { unit: 'kWh', value: 3 }, { unit: 'P', value: 4 },
    { unit: 'kWh', value: 5 }, { unit: 'P', value: 6 }, { unit: 'kWh', value: 7 }, { unit: 'P', value: 8 },
    { unit: 'kWh', value: 9 }, { unit: 'P', value: 10 }, { unit: 'kWh', value: 11 }, { unit: 'P', value: 12 },
  ],
  columns: ['kWh', 'P'],
  scoreUnit: 'P',
  capture(attacker, captured, op) {
    const column = electroColumn(attacker.unit);
    return { column, base: attacker.unit === captured.unit ? likeUnits(attacker, captured, op) : null };
  },
  remaining: (piece) => ({ column: electroColumn(piece.unit), amount: piece.value }),
  unitFactor: (column) => (column === 'kWh' ? KWH_RATE : 1),
  total: (columns) => (columns.kWh ?? 0) * KWH_RATE + (columns.P ?? 0),
};

const sci = (value: number): Chip => ({ unit: 'sci', value });

/** No units to mismatch, so all four operators score. The sources give no scoring for this grade: see RULES.md. */
const SCIENTIFIC_NOTATION: GradeRules = {
  name: 'Scientific Notation',
  chips: [
    sci(1.1e-1), sci(2.2e2), sci(3.3e-3), sci(4.4e4), sci(5.5e-5), sci(6.6e6),
    sci(7.7e-7), sci(8.8e8), sci(9.9e-9), sci(1.01e10), sci(1.111e-11), sci(1.212e12),
  ],
  columns: ['sci'],
  scoreUnit: 'sci',
  capture(attacker, captured, op) {
    if (op === 'mul') return { column: 'sci', base: attacker.value * captured.value };
    if (op === 'div') return { column: 'sci', base: attacker.value / captured.value };
    return { column: 'sci', base: likeUnits(attacker, captured, op) };
  },
  remaining: (piece) => ({ column: 'sci', amount: piece.value }),
  unitFactor: () => 1,
  total: (columns) => columns.sci ?? 0,
};

/** The published table: relative humidity (%) to temperature humidity index (°F). */
export const THI_TABLE: Readonly<Record<number, number>> = {
  0: 78, 5: 79, 10: 80, 15: 81, 20: 82, 25: 83, 30: 84, 35: 85, 40: 86, 45: 87, 50: 88,
  55: 89, 60: 90, 65: 91, 70: 93, 75: 95, 80: 97, 85: 99, 90: 102, 95: 105, 100: 108,
};

const THI: GradeRules = {
  name: 'THI',
  chips: [
    { unit: 'F', value: 70 }, { unit: 'pct', value: 25 }, { unit: 'F', value: 75 }, { unit: 'pct', value: 30 },
    { unit: 'F', value: 80 }, { unit: 'pct', value: 35 }, { unit: 'F', value: 85 }, { unit: 'pct', value: 40 },
    { unit: 'F', value: 110 }, { unit: 'pct', value: 45 }, { unit: 'F', value: 120 }, { unit: 'pct', value: 50 },
  ],
  columns: ['F'],
  scoreUnit: 'F',
  capture(attacker, captured, op) {
    if (attacker.unit !== captured.unit) return { column: 'F', base: null };
    const result = likeUnits(attacker, captured, op);
    if (result === null || attacker.unit === 'F') return { column: 'F', base: result };
    return { column: 'F', base: THI_TABLE[result], converted: { unit: 'pct', value: result } };
  },
  // Each humidity chip is looked up alone: summed chips could pass 100%, beyond the table.
  remaining: (piece) => ({ column: 'F', amount: piece.unit === 'pct' ? THI_TABLE[piece.value] : piece.value }),
  unitFactor: () => 1,
  total: (columns) => columns.F ?? 0,
};

const thermoColumn = (unit: Unit): Column => (unit === 'g' ? 'g' : 'C');

const THERMO: GradeRules = {
  name: 'Thermo',
  chips: [
    { unit: 'g', value: 3 }, { unit: 'C', value: 2 }, { unit: 'g', value: 7 }, { unit: 'C', value: 11 },
    { unit: 'g', value: 13 }, { unit: 'C', value: 17 }, { unit: 'g', value: 19 }, { unit: 'C', value: 23 },
    { unit: 'g', value: 29 }, { unit: 'C', value: 31 }, { unit: 'g', value: 37 }, { unit: 'C', value: 55 },
  ],
  columns: ['g', 'C', 'gC'],
  scoreUnit: 'cal',
  capture(attacker, captured, op) {
    if (attacker.unit === captured.unit) return { column: thermoColumn(attacker.unit), base: likeUnits(attacker, captured, op) };
    return { column: 'gC', base: op === 'mul' ? attacker.value * captured.value : null };
  },
  remaining: (piece) => ({ column: thermoColumn(piece.unit), amount: piece.value }),
  unitFactor: () => 1,
  total: (columns) => (columns.g ?? 0) * (columns.C ?? 0) + (columns.gC ?? 0),
};

export const GRADES = { 7: ELECTRO, 8: SCIENTIFIC_NOTATION, 9: THI, 10: THERMO } as const satisfies Record<number, GradeRules>;

export type Grade = keyof typeof GRADES;

export const GRADE_IDS = Object.keys(GRADES).map(Number) as Grade[];

function addToColumn(columns: Columns, column: Column, amount: number): Columns {
  return { ...columns, [column]: (columns[column] ?? 0) + amount };
}

// ---------------------------------------------------------------- setup

/** Red's squares for chips 1 to 12, the same in every grade. Blue mirrors them under a 180° turn. */
const START_SQUARES: readonly (readonly [x: number, y: number])[] = [
  [0, 1], [5, 2], [7, 0], [2, 1], [7, 2], [5, 0], [3, 2], [6, 1], [3, 0], [1, 2], [4, 1], [1, 0],
];

export const pieceId = (side: Side, unit: Unit, value: number): string => `${side[0]}-${unit}${value}`;

export function initialBoard(grade: Grade = DEFAULT_RULES.grade): Cell[] {
  const board: Cell[] = new Array(64).fill(null);
  GRADES[grade].chips.forEach(({ unit, value }, n) => {
    const [x, y] = START_SQUARES[n];
    board[sq(x, y)] = { id: pieceId('red', unit, value), side: 'red', unit, value, king: false };
    board[sq(7 - x, 7 - y)] = { id: pieceId('blue', unit, value), side: 'blue', unit, value, king: false };
  });
  return board;
}

export function initialState(rules: Partial<Rules> = {}): GameState {
  const merged = { ...DEFAULT_RULES, ...rules };
  return {
    board: initialBoard(merged.grade),
    turn: 'red',
    columns: { red: {}, blue: {} },
    scores: { red: 0, blue: 0 },
    jumper: null,
    rules: merged,
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

/** The "mayor" rules: most chips first, then a dama over an ordinary chip on equal counts. */
function keepPriority(board: readonly Cell[], steps: LegalStep[]): LegalStep[] {
  const scored = steps.map((s) => ({ s, n: 1 + longestChain(jumpBoard(board, s), s.to) }));
  const max = Math.max(...scored.map((x) => x.n));
  const longest = scored.filter((x) => x.n === max).map((x) => x.s);
  const damas = longest.filter((s) => board[s.from]?.king);
  return damas.length ? damas : longest;
}

export function legalSteps(state: GameState): LegalStep[] {
  if (state.result) return [];
  const { board } = state;
  if (state.jumper !== null) {
    const caps = capturesFrom(board, state.jumper);
    return state.rules.maxCapture && caps.length ? keepPriority(board, caps) : caps;
  }
  const captures: LegalStep[] = [];
  for (const i of PLAYABLE) {
    if (board[i]?.side === state.turn) captures.push(...capturesFrom(board, i));
  }
  if (captures.length) return state.rules.maxCapture ? keepPriority(board, captures) : captures;
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

/** The capture a side has no choice about: the only legal step. Null when there is a choice or no capture. */
export function forcedStep(state: GameState): LegalStep | null {
  const steps = legalSteps(state);
  return steps.length === 1 && steps[0].capture !== null ? steps[0] : null;
}

// ---------------------------------------------------------------- scoring

export function scoreCapture(attacker: Piece, captured: Piece, op: Op, grade: Grade = DEFAULT_RULES.grade): Equation {
  const rules = GRADES[grade];
  const { column, base, converted } = rules.capture(attacker, captured, op);
  const kingFactor = (attacker.king ? 2 : 1) * (captured.king ? 2 : 1);
  const unitFactor = rules.unitFactor(column);
  const amount = base === null ? 0 : base * kingFactor;
  return {
    op,
    a: { unit: attacker.unit, value: attacker.value, king: attacker.king },
    b: { unit: captured.unit, value: captured.value, king: captured.king },
    sameUnit: attacker.unit === captured.unit,
    column,
    base,
    ...(converted && { converted }),
    kingFactor,
    amount,
    unitFactor,
    points: amount * unitFactor,
  };
}

/** What a chip adds to its column when it is still on the board at the end. */
function pieceAmount(piece: Piece, grade: Grade): { column: Column; amount: number } {
  const { column, amount } = GRADES[grade].remaining(piece);
  return { column, amount: amount * (piece.king ? 2 : 1) };
}

/** What a chip is worth when it is still on the board at the end. */
export function piecePoints(piece: Piece, grade: Grade = DEFAULT_RULES.grade): number {
  const { column, amount } = pieceAmount(piece, grade);
  return amount * GRADES[grade].unitFactor(column);
}

export function remainingTally(board: readonly Cell[], grade: Grade = DEFAULT_RULES.grade): Record<Side, Tally> {
  const tally: Record<Side, Tally> = { red: { items: [], columns: {}, total: 0 }, blue: { items: [], columns: {}, total: 0 } };
  board.forEach((piece, square) => {
    if (!piece) return;
    const side = tally[piece.side];
    const { column, amount } = pieceAmount(piece, grade);
    side.items.push({ piece, square, points: piecePoints(piece, grade) });
    side.columns = addToColumn(side.columns, column, amount);
  });
  for (const side of [tally.red, tally.blue]) side.total = GRADES[grade].total(side.columns);
  return tally;
}

/** What each side would finish on if the game stopped here: its sheet with the remaining chips added. */
export function projectedFinals(state: GameState, tally = remainingTally(state.board, state.rules.grade)): Record<Side, number> {
  const rules = GRADES[state.rules.grade];
  const final = (side: Side): number => {
    let columns = state.columns[side];
    for (const column of rules.columns) {
      const amount = tally[side].columns[column];
      if (amount) columns = addToColumn(columns, column, amount);
    }
    return rules.total(columns);
  };
  return { red: final('red'), blue: final('blue') };
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
  const steps = legalSteps(state);
  const legal = steps.find((s) => s.from === step.from && s.to === step.to);
  if (!legal) throw new IllegalStepError(`Illegal step ${step.from}→${step.to}`);
  return applyLegalStep(state, legal, steps.length === 1 && legal.capture !== null);
}

/** Apply a step already known to be legal (used by the bot's search). */
export function applyLegalStep(state: GameState, legal: LegalStep, forced = false): { state: GameState; record: StepRecord } {
  const board = state.board.slice();
  const piece = board[legal.from]!;
  const side = piece.side;
  board[legal.from] = null;

  const captured = legal.capture !== null ? board[legal.capture] : null;
  if (legal.capture !== null) board[legal.capture] = null;

  const op = OPERATORS[legal.to]!;
  const { grade } = state.rules;
  const equation = captured ? scoreCapture(piece, captured, op, grade) : null;
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

  const sheet = equation?.amount ? addToColumn(state.columns[side], equation.column, equation.amount) : state.columns[side];
  let next: GameState = {
    ...state,
    board,
    columns: { ...state.columns, [side]: sheet },
    scores: { ...state.scores, [side]: GRADES[grade].total(sheet) },
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
    forced,
  };

  if (!continues) {
    if (countPieces(board, other(side)) === 0) next = endGame(next, 'elimination');
    else if (legalSteps(next).length === 0) next = endGame(next, 'blocked');
  }
  return { state: next, record };
}

/**
 * Finish the game. For elimination, blocked and time, the lower final score wins.
 * For timeout, resign and abandon pass the winner; agreement is a draw.
 */
export function endGame(state: GameState, reason: EndReason, winner?: Side | null): GameState {
  if (state.result) return state;
  const tally = remainingTally(state.board, state.rules.grade);
  const final = projectedFinals(state, tally);
  let w: Side | null;
  if (reason === 'agreement') w = null;
  else if (winner !== undefined) w = winner;
  else w = final.red === final.blue ? null : final.red < final.blue ? 'red' : 'blue';
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
