// Compact board strings (32 chars, one per playable square) for lobby thumbnails.
import { PLAYABLE, pieceId, type Cell, type Side, type Unit } from './engine.ts';

const VALUES: Record<Unit, number[]> = { P: [2, 4, 6, 8, 10, 12], kWh: [1, 3, 5, 7, 9, 11] };
const LOWER = 'abcdefghijklmnopqrstuvwx'; // 24 chips: red P, red kWh, blue P, blue kWh
const UPPER = LOWER.toUpperCase(); // the same chips crowned

function chipIndex(side: Side, unit: Unit, value: number): number {
  return (side === 'red' ? 0 : 12) + (unit === 'P' ? 0 : 6) + VALUES[unit].indexOf(value);
}

export function encodeBoard(board: readonly Cell[]): string {
  return PLAYABLE.map((i) => {
    const p = board[i];
    if (!p) return '.';
    const k = chipIndex(p.side, p.unit, p.value);
    return k < 0 || k >= 24 ? '.' : p.king ? UPPER[k] : LOWER[k];
  }).join('');
}

export function decodeBoard(code: string): Cell[] {
  const board: Cell[] = new Array(64).fill(null);
  PLAYABLE.forEach((square, n) => {
    const ch = code[n] ?? '.';
    const king = UPPER.includes(ch);
    const k = (king ? UPPER : LOWER).indexOf(ch);
    if (k < 0) return;
    const side: Side = k < 12 ? 'red' : 'blue';
    const unit: Unit = k % 12 < 6 ? 'P' : 'kWh';
    const value = VALUES[unit][k % 6];
    board[square] = { id: pieceId(side, unit, value), side, unit, value, king };
  });
  return board;
}
