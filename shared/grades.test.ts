// The rules that differ from grade to grade. Grade 7's own tests are in engine.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStep,
  endGame,
  GRADES,
  initialBoard,
  initialState,
  legalSteps,
  piecePoints,
  projectedFinals,
  remainingTally,
  replay,
  scoreCapture,
  sq,
  THI_TABLE,
  type Cell,
  type Columns,
  type GameState,
  type Grade,
  type Op,
  type Piece,
  type Side,
  type Unit,
} from './engine.ts';
import { encodeBoard, decodeBoard } from './codec.ts';
import { equationParts, equationText, finalText, scoreText, stepText } from './notation.ts';

const ALL: Grade[] = [7, 8, 9, 10];
const OPS: Op[] = ['add', 'sub', 'mul', 'div'];
const chip = (unit: Unit, value: number, king = false, side: Side = 'red'): Piece => ({ id: 'x', side, unit, value, king });
const values = (grade: Grade, unit: Unit) => GRADES[grade].chips.filter((c) => c.unit === unit).map((c) => c.value);

function position(grade: Grade, pieces: [x: number, y: number, piece: Piece][], columns?: Record<Side, Columns>): GameState {
  const board: Cell[] = new Array(64).fill(null);
  for (const [x, y, piece] of pieces) board[sq(x, y)] = piece;
  const s = { ...initialState({ grade }), board };
  return columns ? { ...s, columns } : s;
}

// ------------------------------------------------------------------ every grade

test('every grade has twelve different chips, and a game starts with them', () => {
  for (const grade of ALL) {
    const { chips } = GRADES[grade];
    assert.equal(chips.length, 12);
    assert.equal(new Set(chips.map((c) => `${c.unit}${c.value}`)).size, 12);
    const s = initialState({ grade });
    assert.equal(s.rules.grade, grade);
    assert.equal(s.board.filter(Boolean).length, 24);
    for (const side of ['red', 'blue'] as const) {
      const mine = s.board.filter((p) => p?.side === side).map((p) => `${p!.unit}${p!.value}`).sort();
      assert.deepEqual(mine, chips.map((c) => `${c.unit}${c.value}`).sort());
    }
    assert.equal(new Set(s.board.filter(Boolean).map((p) => p!.id)).size, 24, 'ids stay unique');
  }
});

test('blue mirrors red in every grade', () => {
  for (const grade of ALL) {
    const board = initialBoard(grade);
    board.forEach((p, i) => {
      if (p?.side !== 'red') return;
      assert.equal(board[63 - i]?.value, p.value);
      assert.equal(board[63 - i]?.unit, p.unit);
      assert.equal(board[63 - i]?.side, 'blue');
    });
  }
});

test('the board, the moves and the capture rules are the same in every grade', () => {
  const opening = legalSteps(initialState({ grade: 7 }));
  for (const grade of ALL) assert.deepEqual(legalSteps(initialState({ grade })), opening);
});

test('one game worked by hand: the same four moves in every grade', () => {
  const moves = [
    { from: sq(5, 2), to: sq(4, 3) },
    { from: sq(2, 5), to: sq(3, 4) },
    { from: sq(4, 3), to: sq(2, 5) }, // red's chip 2 takes blue's chip 2 on a + square
    { from: sq(1, 6), to: sq(3, 4) }, // blue's chip 8 takes red's chip 2 on a − square
  ];
  const expected: { grade: Grade; red: number; blue: number; winner: Side; text: [string, string] }[] = [
    // kWh 36 × ₱5 = ₱180, and ₱ 42 − 2 = ₱40, so ₱220 of chips each.
    { grade: 7, red: 224, blue: 226, winner: 'red', text: ['₱2 + ₱2 = ₱4', '₱8 − ₱2 = ₱6'] },
    // % chips left: 84 + 85 + 86 + 87 + 88 = 430°F, and °F chips 540°F, so 970°F each.
    { grade: 9, red: 1058, blue: 1051, winner: 'blue', text: ['25% + 25% = 50% → 88°F', '40% − 25% = 15% → 81°F'] },
    // g 108 each; °C left 137, so red (137 + 4) × 108 and blue (137 + 21) × 108.
    { grade: 10, red: 15228, blue: 17064, winner: 'red', text: ['2°C + 2°C = 4°C', '23°C − 2°C = 21°C'] },
  ];
  for (const { grade, red, blue, winner, text } of expected) {
    const { state, records } = replay(moves, { grade });
    assert.deepEqual([equationText(records[2].equation!), equationText(records[3].equation!)], text, `grade ${grade}`);
    const res = endGame(state, 'time').result!;
    assert.deepEqual(res.final, { red, blue }, `grade ${grade}`);
    assert.equal(res.winner, winner, `grade ${grade}`);
  }
  // Grade 8's chips differ by powers of ten, so compare the sheets and the winner.
  const { state } = replay(moves, { grade: 8 });
  assert.equal(state.columns.red.sci, 440);
  assert.equal(state.columns.blue.sci, 8.8e8 - 2.2e2);
  assert.equal(endGame(state, 'time').result?.winner, 'red');
});

test('random games in every grade keep the invariants', () => {
  let seed = 9;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const grade of ALL) {
    const rules = GRADES[grade];
    for (let g = 0; g < 120; g++) {
      const maxCapture = g % 2 === 0;
      let s = initialState({ grade, maxCapture });
      const played = [];
      for (let n = 0; n < 400 && !s.result; n++) {
        const legal = legalSteps(s);
        assert.ok(legal.length > 0);
        const step = legal[Math.floor(rand() * legal.length)];
        const before = s.scores;
        const { state, record } = applyStep(s, step);
        played.push({ from: step.from, to: step.to });
        if (record.equation) {
          assert.ok(Number.isFinite(record.equation.points), `grade ${grade}: ${stepText(record)}`);
          assert.ok(record.equation.points >= 0);
        }
        for (const side of ['red', 'blue'] as const) {
          assert.equal(state.scores[side], rules.total(state.columns[side]), 'the score is the sheet');
          assert.ok(state.scores[side] >= before[side], 'scores never go down');
        }
        s = state;
      }
      assert.deepEqual(replay(played, { grade, maxCapture }).state.board, s.board);
      const over = s.result ? s : endGame(s, 'time');
      const { final, winner, reason, tally } = over.result!;
      assert.ok(Number.isFinite(final.red) && Number.isFinite(final.blue));
      assert.deepEqual(final, projectedFinals(over));
      assert.ok(tally.red.items.every((i) => Number.isFinite(i.points)));
      if (['elimination', 'blocked', 'time'].includes(reason)) {
        assert.equal(winner, final.red === final.blue ? null : final.red < final.blue ? 'red' : 'blue', 'the lower final wins');
      }
      assert.deepEqual(decodeBoard(encodeBoard(over.board, grade), grade), over.board);
    }
  }
});

// ------------------------------------------------------------------ Grade 8

test('Grade 8: the published chips, odd exponents negative and even positive', () => {
  assert.equal(GRADES[8].name, 'Scientific Notation');
  assert.deepEqual(GRADES[8].chips.map((c) => c.value), [1.1e-1, 2.2e2, 3.3e-3, 4.4e4, 5.5e-5, 6.6e6, 7.7e-7, 8.8e8, 9.9e-9, 1.01e10, 1.111e-11, 1.212e12]);
  GRADES[8].chips.forEach((c, n) => assert.equal(c.value < 1, n % 2 === 0, `chip ${n + 1}`));
});

test('Grade 8: all four operators score, and below zero does not', () => {
  const a = chip('sci', 8.8e8);
  const b = chip('sci', 2.2e2);
  assert.equal(scoreCapture(a, b, 'add', 8).base, 8.8e8 + 2.2e2);
  assert.equal(scoreCapture(a, b, 'sub', 8).base, 8.8e8 - 2.2e2);
  assert.equal(scoreCapture(a, b, 'mul', 8).base, 8.8e8 * 2.2e2);
  assert.equal(scoreCapture(a, b, 'div', 8).base, 4e6);
  assert.equal(scoreCapture(b, a, 'sub', 8).base, null);
  assert.equal(equationParts(scoreCapture(b, a, 'sub', 8)).reason, 'Below zero');
  assert.equal(scoreCapture(a, a, 'sub', 8).base, 0, 'a chip minus its equal scores 0, not NS');
});

test('Grade 8: dama factors, and every pair of chips stays a finite number', () => {
  assert.equal(scoreCapture(chip('sci', 2.2e2, true), chip('sci', 4.4e4), 'mul', 8).amount, 2.2e2 * 4.4e4 * 2);
  assert.equal(scoreCapture(chip('sci', 2.2e2, true), chip('sci', 4.4e4, true), 'add', 8).amount, (2.2e2 + 4.4e4) * 4);
  for (const a of values(8, 'sci')) for (const b of values(8, 'sci')) for (const op of OPS) {
    const { base } = scoreCapture(chip('sci', a), chip('sci', b), op, 8);
    assert.ok(base === null || Number.isFinite(base));
  }
});

test('Grade 8: full precision underneath, five figures on screen', () => {
  const eq = scoreCapture(chip('sci', 1.1e-1), chip('sci', 2.2e2), 'add', 8);
  assert.equal(eq.base, 0.11 + 220);
  assert.equal(equationText(eq), '1.1 × 10⁻¹ + 2.2 × 10² = 2.2011 × 10²');
  assert.equal(scoreText(1.212e12, 8), '1.212 × 10¹²');
  assert.equal(equationText(scoreCapture(chip('sci', 4.4e4, true), chip('sci', 2.2e2), 'div', 8)), '4.4 × 10⁴ ÷ 2.2 × 10² = 2 × 10² · ×2 dama = 4 × 10²');
});

// ------------------------------------------------------------------ Grade 9

test('Grade 9: the published chips and table', () => {
  assert.equal(GRADES[9].name, 'THI');
  assert.deepEqual(values(9, 'F'), [70, 75, 80, 85, 110, 120]);
  assert.deepEqual(values(9, 'pct'), [25, 30, 35, 40, 45, 50]);
  const printed = [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 93, 95, 97, 99, 102, 105, 108];
  assert.deepEqual(printed.map((_, i) => THI_TABLE[i * 5]), printed);
});

test('Grade 9: the published examples, with their running total', () => {
  const rows: [number, Op, number, number | null][] = [[25, 'add', 40, 91], [50, 'sub', 25, 83], [45, 'sub', 30, 81], [25, 'sub', 40, null]];
  let total = 0;
  for (const [a, op, b, thi] of rows) {
    const eq = scoreCapture(chip('pct', a), chip('pct', b), op, 9);
    assert.equal(eq.base, thi);
    total += eq.amount;
  }
  assert.equal(total, 255);
});

test('Grade 9: temperature chips add straight to the sheet', () => {
  const eq = scoreCapture(chip('F', 120), chip('F', 110), 'add', 9);
  assert.equal(eq.base, 230);
  assert.equal(eq.converted, undefined);
  assert.equal(equationText(eq), '120°F + 110°F = 230°F');
  assert.equal(scoreCapture(chip('F', 80), chip('F', 70), 'sub', 9).base, 10);
  assert.equal(scoreCapture(chip('F', 70), chip('F', 80), 'sub', 9).base, null);
});

test('Grade 9: × and ÷ and mixed units never score, for any pair of chips', () => {
  const chips = GRADES[9].chips;
  for (const a of chips) for (const b of chips) {
    for (const op of ['mul', 'div'] as Op[]) assert.equal(scoreCapture(chip(a.unit, a.value), chip(b.unit, b.value), op, 9).base, null);
    if (a.unit !== b.unit) for (const op of OPS) assert.equal(scoreCapture(chip(a.unit, a.value), chip(b.unit, b.value), op, 9).base, null);
  }
  assert.equal(equationParts(scoreCapture(chip('pct', 25), chip('pct', 40), 'mul', 9)).reason, 'Not humidity');
  assert.equal(equationParts(scoreCapture(chip('F', 70), chip('F', 80), 'div', 9)).reason, 'Not temperature');
  assert.equal(equationParts(scoreCapture(chip('pct', 25), chip('F', 70), 'add', 9)).reason, 'Units differ');
});

test('Grade 9: every humidity sum and difference is on the table', () => {
  for (const a of values(9, 'pct')) for (const b of values(9, 'pct')) for (const op of ['add', 'sub'] as Op[]) {
    const eq = scoreCapture(chip('pct', a), chip('pct', b), op, 9);
    if (op === 'sub' && a < b) assert.equal(eq.base, null);
    else assert.ok(Number.isInteger(eq.base), `${a} ${op} ${b}`);
  }
});

test('Grade 9: exactly 0% is a score of 78°F, not no score', () => {
  const eq = scoreCapture(chip('pct', 25), chip('pct', 25), 'sub', 9);
  assert.equal(eq.base, 78);
  assert.deepEqual(eq.converted, { unit: 'pct', value: 0 });
});

test('Grade 9: a dama multiplies after the table', () => {
  const eq = scoreCapture(chip('pct', 25, true), chip('pct', 40), 'add', 9);
  assert.equal(eq.base, 91);
  assert.equal(eq.amount, 182);
  assert.equal(equationText(eq), '25% + 40% = 65% → 91°F · ×2 dama = 182°F');
});

test('Grade 9: chips left on the board are looked up one at a time', () => {
  assert.equal(piecePoints(chip('pct', 50), 9), 88);
  assert.equal(piecePoints(chip('pct', 50, true), 9), 176);
  assert.equal(piecePoints(chip('F', 120), 9), 120);
  const { red } = remainingTally(initialBoard(9), 9);
  assert.equal(red.total, 540 + 83 + 84 + 85 + 86 + 87 + 88, 'all six humidity chips would pass 100% if summed first');
});

test('Grade 9: final scores show °C, and the order is the same as in °F', () => {
  assert.equal(finalText(399, 9), '399°F (203.9°C)');
  assert.equal(finalText(32, 9), '32°F (0°C)');
  assert.equal(finalText(1240), '₱1,240', 'other grades show their score');
});

// ------------------------------------------------------------------ Grade 10

test('Grade 10: the published chips', () => {
  assert.equal(GRADES[10].name, 'Thermo');
  assert.deepEqual(values(10, 'g'), [3, 7, 13, 19, 29, 37]);
  assert.deepEqual(values(10, 'C'), [2, 11, 17, 23, 31, 55]);
});

test('Grade 10: the published examples', () => {
  const add = scoreCapture(chip('g', 37), chip('g', 19), 'add', 10);
  assert.equal(add.base, 56);
  assert.equal(add.column, 'g');
  assert.equal(scoreCapture(chip('C', 50), chip('C', 69), 'sub', 10).base, null);
  const product = scoreCapture(chip('C', 37), chip('g', 10), 'mul', 10);
  assert.equal(product.base, 370);
  assert.equal(product.column, 'gC');
  assert.equal(equationText(product), '37°C × 10 g = 370 g·°C');
  assert.equal(scoreCapture(chip('g', 2), chip('C', 7), 'mul', 10).base, 14, 'the order does not matter');
  assert.equal(scoreCapture(chip('C', 29), chip('g', 13), 'mul', 10).base, 377);
});

test('Grade 10: different units only score with ×, and like units never do', () => {
  for (const op of ['add', 'sub', 'div'] as Op[]) {
    const eq = scoreCapture(chip('g', 19), chip('C', 2), op, 10);
    assert.equal(eq.base, null);
    assert.equal(equationParts(eq).reason, 'Units differ');
  }
  for (const op of ['mul', 'div'] as Op[]) {
    assert.equal(scoreCapture(chip('g', 19), chip('g', 3), op, 10).base, null);
    assert.equal(scoreCapture(chip('C', 23), chip('C', 2), op, 10).base, null);
  }
  assert.equal(equationParts(scoreCapture(chip('g', 19), chip('g', 3), 'mul', 10)).reason, 'Not mass');
  assert.equal(equationParts(scoreCapture(chip('C', 23), chip('C', 2), 'div', 10)).reason, 'Not temperature');
  assert.equal(equationParts(scoreCapture(chip('g', 3), chip('C', 2), 'mul', 10)).reason, null);
});

test('Grade 10: captures fill their own columns', () => {
  const capture = (a: Piece, b: Piece, x: number, y: number) =>
    applyStep(position(10, [[x, y, a], [x + 1, y + 1, { ...b, side: 'blue' }], [7, 6, chip('g', 3, false, 'blue')]]), { from: sq(x, y), to: sq(x + 2, y + 2) }).state.columns.red;
  assert.deepEqual(capture(chip('g', 7), chip('g', 3), 0, 3), { g: 10 }); // lands on (2,5), +
  assert.deepEqual(capture(chip('C', 11), chip('C', 2), 0, 3), { C: 13 });
  assert.deepEqual(capture(chip('C', 11), chip('g', 3), 2, 3), { gC: 33 }); // lands on (4,5), ×
});

test('Grade 10: the published sample comes to 4576 calories', () => {
  const s = position(
    10,
    [
      [0, 1, chip('g', 5)], [2, 1, chip('g', 13)],
      [4, 1, chip('C', 29)], [6, 1, chip('C', 17)], [1, 2, chip('C', 3)],
      [7, 6, chip('g', 3, false, 'blue')],
    ],
    { red: { g: 27, C: 44, gC: 391 }, blue: {} },
  );
  const final = endGame(s, 'time').result!.final;
  assert.equal(final.red, 45 * 93 + 391);
  assert.equal(final.red, 4576);
  assert.equal(scoreText(final.red, 10), '4,576 calories');
});

test('Grade 10: an empty column leaves only the other terms', () => {
  assert.equal(GRADES[10].total({ C: 50 }), 0, 'no grams means nothing to multiply');
  assert.equal(GRADES[10].total({ g: 10, C: 5 }), 50);
  assert.equal(GRADES[10].total({ gC: 370 }), 370);
  assert.equal(GRADES[10].total({}), 0);
});

test('Grade 10: dama factors apply in every column, and on chips left on the board', () => {
  assert.equal(scoreCapture(chip('g', 7, true), chip('g', 3), 'add', 10).amount, 20);
  assert.equal(scoreCapture(chip('C', 11, true), chip('g', 3, true), 'mul', 10).amount, 132);
  const { red } = remainingTally(position(10, [[0, 1, chip('g', 7, true)], [2, 1, chip('C', 11, true)]]).board, 10);
  assert.deepEqual(red.columns, { g: 14, C: 22 });
});
