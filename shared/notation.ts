// Human-readable labels for chips, squares, operators and capture equations.
import type { EndReason, Equation, Op, Piece, Side, StepRecord, Unit } from './engine.ts';
import { xOf, yOf } from './engine.ts';

export const OP_SYMBOL: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
export const OP_NAME: Record<Op, string> = { add: 'plus', sub: 'minus', mul: 'times', div: 'divided by' };
export const SIDE_NAME: Record<Side, string> = { red: 'Red', blue: 'Blue' };

/** "₱8" or "11 kWh". */
export function quantity(unit: Unit, value: number): string {
  return unit === 'P' ? `₱${value}` : `${value} kWh`;
}

export const chipLabel = (p: Pick<Piece, 'unit' | 'value'>): string => quantity(p.unit, p.value);

/** "(x,y)" in red's frame, as printed on the board edges. */
export const coord = (square: number): string => `(${xOf(square)},${yOf(square)})`;

export interface EquationParts {
  /** "₱8 + ₱4" */
  left: string;
  /** "₱12", "8 kWh" or "NS" */
  result: string;
  /** e.g. ["×2 dama", "×3 ₱/kWh"]; empty when nothing scored */
  factors: string[];
  /** "₱24" or "₱0" */
  points: string;
  scored: boolean;
  /** Why it scored nothing, in words; null when it scored. */
  reason: string | null;
}

export function equationParts(eq: Equation): EquationParts {
  const left = `${quantity(eq.a.unit, eq.a.value)} ${OP_SYMBOL[eq.op]} ${quantity(eq.b.unit, eq.b.value)}`;
  const scored = eq.base !== null;
  const factors: string[] = [];
  if (scored) {
    if (eq.a.king) factors.push('×2 dama');
    if (eq.b.king) factors.push('×2 captured dama');
    if (eq.unitFactor === 3) factors.push('×3 ₱/kWh');
  }
  let reason: string | null = null;
  if (!eq.sameUnit) reason = 'Units differ';
  else if (eq.op === 'mul' || eq.op === 'div') reason = eq.a.unit === 'P' ? 'Not pesos' : 'Not energy';
  else if (eq.base === null) reason = 'Below zero';
  return {
    left,
    result: scored ? quantity(eq.a.unit, eq.base!) : 'NS',
    factors,
    points: `₱${eq.points}`,
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

export const END_REASON_TEXT: Record<EndReason, string> = {
  elimination: 'All chips captured',
  blocked: 'No moves left',
  time: 'Game clock ran out',
  timeout: 'Ran out of move time',
  resign: 'Resigned',
  agreement: 'Draw agreed',
  abandon: 'Left the game',
};
