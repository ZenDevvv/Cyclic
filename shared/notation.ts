// Human-readable labels for chips, squares, operators and capture equations.
import type { EndReason, Equation, GameState, Grade, Op, Piece, ScoreUnit, Side, StepRecord, Unit } from './engine.ts';
import { capturesFrom, DEFAULT_RULES, forcedStep, GRADES, legalSteps, mustCaptureSquares, PLAYABLE, xOf, yOf } from './engine.ts';

export const OP_SYMBOL: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
export const OP_NAME: Record<Op, string> = { add: 'plus', sub: 'minus', mul: 'times', div: 'divided by' };
export const SIDE_NAME: Record<Side, string> = { red: 'Red', blue: 'Blue' };

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** "2.2011 × 10²": at most five significant figures, however long the number behind it. */
export function scientific(value: number): string {
  if (value === 0) return '0';
  const [mantissa, exponent] = value.toExponential(4).split('e');
  const figures = mantissa.replace(/\.?0+$/, '');
  return `${figures} × 10${[...String(Number(exponent))].map((c) => SUPERSCRIPT[c]).join('')}`;
}

/** Any amount in its unit, e.g. "₱8", "11 kWh", "1.1 × 10⁻¹", "25%", "91°F", "37 g", "37°C", "370 g·°C" or "4,576 calories". */
export function quantity(unit: Unit | ScoreUnit, value: number): string {
  switch (unit) {
    case 'P':
      return `₱${value.toLocaleString('en-US')}`;
    case 'kWh':
      return `${value} kWh`;
    case 'sci':
      return scientific(value);
    case 'pct':
      return `${value}%`;
    case 'F':
      return `${value}°F`;
    case 'g':
      return `${value} g`;
    case 'C':
      return `${value}°C`;
    case 'gC':
      return `${value} g·°C`;
    case 'cal':
      return `${value.toLocaleString('en-US')} calories`;
  }
}

export const chipLabel = (p: Pick<Piece, 'unit' | 'value'>): string => quantity(p.unit, p.value);

/** A score or total in the grade's own unit, e.g. "₱1,240". */
export const scoreText = (value: number, grade: Grade = DEFAULT_RULES.grade): string => quantity(GRADES[grade].scoreUnit, value);

/** A final score. Grade 9 compares totals in °C, the same order as °F, so it shows both. */
export function finalText(value: number, grade: Grade = DEFAULT_RULES.grade): string {
  if (grade !== 9) return scoreText(value, grade);
  const celsius = Math.round(((value - 32) * 5) / 9 * 10) / 10;
  return `${scoreText(value, grade)} (${quantity('C', celsius)})`;
}

/** "(x,y)" in red's frame, as printed on the board edges. */
export const coord = (square: number): string => `(${xOf(square)},${yOf(square)})`;

export interface EquationParts {
  /** "₱8 + ₱4" */
  left: string;
  /** "₱12", "8 kWh", "65% → 91°F" or "NS" */
  result: string;
  /** e.g. ["×2 dama", "×5 ₱/kWh"]; empty when nothing scored */
  factors: string[];
  /** "₱24" or "₱0" */
  points: string;
  scored: boolean;
  /** Why it scored nothing, in words; null when it scored. */
  reason: string | null;
}

const NOT_A: Partial<Record<Unit, string>> = {
  P: 'Not pesos',
  kWh: 'Not energy',
  pct: 'Not humidity',
  F: 'Not temperature',
  g: 'Not mass',
  C: 'Not temperature',
};

export function equationParts(eq: Equation): EquationParts {
  const left = `${quantity(eq.a.unit, eq.a.value)} ${OP_SYMBOL[eq.op]} ${quantity(eq.b.unit, eq.b.value)}`;
  const scored = eq.base !== null;
  const factors: string[] = [];
  if (scored) {
    if (eq.a.king) factors.push('×2 dama');
    if (eq.b.king) factors.push('×2 captured dama');
    if (eq.unitFactor !== 1) factors.push(`×${eq.unitFactor} ₱/kWh`);
  }
  let reason: string | null = null;
  if (!scored && !eq.sameUnit) reason = 'Units differ';
  else if (!scored && (eq.op === 'mul' || eq.op === 'div')) reason = NOT_A[eq.a.unit] ?? null;
  else if (!scored) reason = 'Below zero';
  const value = scored ? quantity(eq.column, eq.base!) : 'NS';
  return {
    left,
    result: scored && eq.converted ? `${quantity(eq.converted.unit, eq.converted.value)} → ${value}` : value,
    factors,
    points: quantity(eq.column === 'kWh' ? 'P' : eq.column, eq.points),
    scored,
    reason,
  };
}

/** One-line equation, e.g. "₱8 + ₱4 = ₱12 · ×2 dama = ₱24" or "5 kWh × 3 kWh = NS". */
export function equationText(eq: Equation): string {
  const p = equationParts(eq);
  if (!p.scored) return `${p.left} = NS`;
  const tail = p.factors.length ? ` · ${p.factors.join(' · ')} = ${p.points}` : '';
  return `${p.left} = ${p.result}${tail}`;
}

/** "₱8 (6,1)→(5,2)" plus the equation for a capture. */
export function stepText(r: StepRecord): string {
  const move = `${chipLabel(r.piece)} ${coord(r.from)}→${coord(r.to)}`;
  const parts = [move];
  if (r.equation) parts.push(equationText(r.equation));
  if (r.crowned) parts.push('crowned');
  return parts.join(' · ');
}

export interface NoticeOptions {
  /** Forced captures play themselves in this game. */
  autoCapture: boolean;
  /** The side reading the message; null for spectators. */
  viewer: Side | null;
}

/** Plain-words message about a capture the side to move cannot avoid. Null when there is nothing to say. */
export function captureNotice(state: GameState, last: StepRecord | null, { autoCapture, viewer }: NoticeOptions): string | null {
  if (state.result) return null;
  const owner = (side: Side) => (side === viewer ? 'your' : `${SIDE_NAME[side]}'s`);
  const forced = forcedStep(state);
  if (forced) {
    const taker = chipLabel(state.board[forced.from]!);
    const taken = chipLabel(state.board[forced.capture!]!);
    return `${autoCapture ? 'Auto-capture' : 'Forced capture'}: ${owner(state.turn)} ${taker} must take ${taken}.`;
  }
  if (viewer === state.turn && mustCaptureSquares(state).length) {
    if (state.jumper !== null) return 'Keep capturing with this chip.';
    let every = 0;
    for (const i of PLAYABLE) if (state.board[i]?.side === state.turn) every += capturesFrom(state.board, i).length;
    return every > legalSteps(state).length ? 'You must capture. The most chips come first, then a dama.' : 'You must capture. Choose your capture.';
  }
  if (autoCapture && last?.forced && last.captured) {
    return `Auto-capture: ${owner(last.side)} ${chipLabel(last.piece)} took ${chipLabel(last.captured)}.`;
  }
  return null;
}

export const END_REASON_TEXT: Record<EndReason, string> = {
  elimination: 'All chips captured',
  blocked: 'No moves left',
  time: 'Game clock ran out',
  timeout: 'Ran out of move time',
  resign: 'Resigned',
  agreement: 'Draw agreed',
  abandon: 'Left the game',
};
