// Compact board strings (32 chars, one per playable square) for lobby thumbnails.
import { DEFAULT_RULES, GRADES, PLAYABLE, pieceId, type Cell, type Grade, type Side } from './engine.ts';

const LOWER = 'abcdefghijklmnopqrstuvwx'; // 24 chips: red's chips 1 to 12, then blue's
const UPPER = LOWER.toUpperCase(); // the same chips crowned

export function encodeBoard(board: readonly Cell[], grade: Grade = DEFAULT_RULES.grade): string {
  const { chips } = GRADES[grade];
  return PLAYABLE.map((i) => {
    const p = board[i];
    if (!p) return '.';
    const chip = chips.findIndex((c) => c.unit === p.unit && c.value === p.value);
    if (chip < 0) return '.';
    const k = (p.side === 'red' ? 0 : 12) + chip;
    return p.king ? UPPER[k] : LOWER[k];
  }).join('');
}

export function decodeBoard(code: string, grade: Grade = DEFAULT_RULES.grade): Cell[] {
  const { chips } = GRADES[grade];
  const board: Cell[] = new Array(64).fill(null);
  PLAYABLE.forEach((square, n) => {
    const ch = code[n] ?? '.';
    const king = UPPER.includes(ch);
    const k = (king ? UPPER : LOWER).indexOf(ch);
    if (k < 0) return;
    const side: Side = k < 12 ? 'red' : 'blue';
    const { unit, value } = chips[k % 12];
    board[square] = { id: pieceId(side, unit, value), side, unit, value, king };
  });
  return board;
}
