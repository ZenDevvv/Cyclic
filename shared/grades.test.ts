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
  type Step,
  type Unit,
} from './engine.ts';
import { chooseTurn, evaluate, type BotLevel } from './bot.ts';
import { encodeBoard, decodeBoard } from './codec.ts';
import { chipFace, equationParts, equationText, finalText, gradeName, previewText, scoreText, scoringGuide, shortScore, stepText } from './notation.ts';

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

// ------------------------------------------------------------------ the bot

function lcg(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** One whole turn for the side to move, played by `pick`. */
function playTurn(s: GameState, pick: (s: GameState) => Step[]): GameState {
  let next = s;
  for (const step of pick(s)) next = applyStep(next, step).state;
  return next;
}

const randomTurn = (rng: () => number) => (s: GameState): Step[] => {
  const steps: Step[] = [];
  let cur = s;
  while (!cur.result && cur.turn === s.turn) {
    const legal = legalSteps(cur);
    const step = legal[Math.floor(rng() * legal.length)];
    steps.push({ from: step.from, to: step.to });
    cur = applyStep(cur, step).state;
  }
  return steps;
};

function playOut(grade: Grade, red: (s: GameState) => Step[], blue: (s: GameState) => Step[]): Side | null {
  let s = initialState({ grade });
  for (let turn = 0; turn < 200 && !s.result; turn++) s = playTurn(s, s.turn === 'red' ? red : blue);
  return endGame(s, 'time').result!.winner;
}

test('bot: a won game outranks any lead, even in Grade 8', () => {
  const live = position(8, [[1, 0, chip('sci', 2.2e2)], [6, 7, chip('sci', 1.212e12, false, 'blue')]]);
  assert.ok(evaluate(live, 'red') > 0, 'red is far ahead');
  const won = endGame({ ...live, columns: { red: {}, blue: { sci: 1 } } }, 'resign', 'red');
  assert.ok(evaluate(won, 'red') > evaluate(live, 'red'));
  const lost = endGame(live, 'resign', 'blue');
  assert.ok(evaluate(lost, 'red') < -evaluate(live, 'red'), 'a loss is worse than any deficit');
});

test('bot: a bigger gap is always better, in every grade', () => {
  const units: Record<Grade, { unit: Unit; column: keyof Columns; big: number; small: number }> = {
    7: { unit: 'P', column: 'P', big: 400, small: 40 },
    8: { unit: 'sci', column: 'sci', big: 1e20, small: 1e18 },
    9: { unit: 'F', column: 'F', big: 900, small: 90 },
    10: { unit: 'g', column: 'gC', big: 9000, small: 900 },
  };
  for (const grade of ALL) {
    const { column, big, small } = units[grade];
    const empty = position(grade, []);
    const lead = (points: number) => ({ ...empty, columns: { red: {}, blue: { [column]: points } } });
    assert.ok(evaluate(lead(big), 'red') > evaluate(lead(small), 'red'), `grade ${grade}`);
    assert.ok(evaluate(lead(small), 'red') > 0, `grade ${grade}`);
  }
});

test('bot: a position is worth exactly the opposite to the other side, as the search needs', () => {
  const rng = lcg(3);
  for (const grade of ALL) {
    for (let g = 0; g < 10; g++) {
      let s = initialState({ grade });
      for (let n = 0; n < 40 && !s.result; n++) {
        s = playTurn(s, randomTurn(rng));
        assert.equal(evaluate(s, 'red') + evaluate(s, 'blue'), 0);
        assert.ok(Number.isFinite(evaluate(s, 'red')));
      }
    }
  }
});

test('bot: Grade 10 is judged by its real final score, which multiplies columns', () => {
  // Adding columns would put red ahead on 20 to 51; the real finals are 100 calories to 50.
  const s = position(10, [], { red: { g: 10, C: 10 }, blue: { g: 1, C: 50 } });
  assert.deepEqual(projectedFinals(s), { red: 100, blue: 50 });
  assert.ok(evaluate(s, 'red') < 0);
});

test('bot: every level plays a legal, complete turn in every grade', () => {
  const rng = lcg(7);
  const levels: BotLevel[] = ['easy', 'medium', 'hard'];
  for (const grade of ALL) {
    for (let n = 0; n < 12; n++) {
      let s = initialState({ grade });
      for (let i = Math.floor(rng() * 30); i > 0 && !s.result; i--) s = playTurn(s, randomTurn(rng));
      if (s.result) continue;
      for (const level of levels) {
        const turn = chooseTurn(s, level, { rng, budgetMs: 10 });
        assert.ok(turn.length > 0, `grade ${grade}, ${level}`);
        const after = turn.reduce((cur, step) => applyStep(cur, step).state, s); // throws if illegal
        assert.ok(after.result || after.turn !== s.turn, 'a bot turn always completes');
      }
    }
  }
});

test('bot: medium beats random play in most of 20 games, in every grade', () => {
  for (const grade of ALL) {
    const rng = lcg(grade);
    const bot = (s: GameState) => chooseTurn(s, 'medium', { rng, budgetMs: 8 });
    let wins = 0;
    for (let g = 0; g < 20; g++) {
      const side: Side = g % 2 ? 'blue' : 'red';
      const random = randomTurn(rng);
      if (playOut(grade, side === 'red' ? bot : random, side === 'blue' ? bot : random) === side) wins++;
    }
    assert.ok(wins >= 16, `grade ${grade}: medium won ${wins} of 20`);
  }
});

test('bot: skill decides every grade, so medium beats easy', () => {
  for (const grade of ALL) {
    const rng = lcg(grade + 40);
    const medium = (s: GameState) => chooseTurn(s, 'medium', { rng, budgetMs: 8 });
    const easy = (s: GameState) => chooseTurn(s, 'easy', { rng, budgetMs: 4 });
    let wins = 0;
    for (let g = 0; g < 8; g++) {
      const side: Side = g % 2 ? 'blue' : 'red';
      if (playOut(grade, side === 'red' ? medium : easy, side === 'blue' ? medium : easy) === side) wins++;
    }
    assert.ok(wins >= 6, `grade ${grade}: medium won ${wins} of 8`);
  }
});

// ------------------------------------------------------------------ what players read

test('chips print a figure and, when it will not fit beside it, a unit underneath', () => {
  assert.deepEqual(chipFace({ unit: 'P', value: 12 }), { main: '₱12', sub: null });
  assert.deepEqual(chipFace({ unit: 'kWh', value: 11 }), { main: '11', sub: 'kWh' });
  assert.deepEqual(chipFace({ unit: 'sci', value: 1.212e12 }), { main: '1.212', sub: '×10¹²' });
  assert.deepEqual(chipFace({ unit: 'sci', value: 1.1e-1 }), { main: '1.1', sub: '×10⁻¹' });
  assert.deepEqual(chipFace({ unit: 'pct', value: 25 }), { main: '25%', sub: null });
  assert.deepEqual(chipFace({ unit: 'F', value: 120 }), { main: '120', sub: '°F' });
  assert.deepEqual(chipFace({ unit: 'g', value: 37 }), { main: '37', sub: 'g' });
  assert.deepEqual(chipFace({ unit: 'C', value: 55 }), { main: '55', sub: '°C' });
});

test('every chip in every grade fits the chip face', () => {
  for (const grade of ALL) {
    for (const c of GRADES[grade].chips) {
      const { main, sub } = chipFace(c);
      assert.ok(main.length <= 5, `${main} is too long`);
      assert.ok((sub ?? '').length <= 6, `${sub} is too long`);
    }
  }
});

test('tight spaces get a shorter score, so a player name still fits', () => {
  assert.equal(shortScore(1240, 7), '₱1,240');
  assert.equal(shortScore(1.23456e24, 8), '1.23 × 10²⁴');
  assert.equal(shortScore(0, 8), '0');
  assert.equal(shortScore(1620, 9), '1620°F');
  assert.equal(shortScore(444500, 10), '444,500 cal');
  assert.ok(shortScore(444500, 10).length < scoreText(444500, 10).length);
});

test('grades are named the same way everywhere', () => {
  assert.equal(gradeName(7), 'Grade 7 · Electro');
  assert.equal(gradeName(8), 'Grade 8 · Scientific Notation');
  assert.equal(gradeName(9), 'Grade 9 · THI');
  assert.equal(gradeName(10), 'Grade 10 · Thermo');
});

test('landing squares show a short preview in each grade', () => {
  assert.equal(previewText(scoreCapture(chip('P', 8), chip('P', 4), 'add', 7)), '+₱12');
  assert.equal(previewText(scoreCapture(chip('kWh', 5), chip('kWh', 3), 'add', 7)), '+₱40');
  assert.equal(previewText(scoreCapture(chip('P', 8), chip('P', 4), 'mul', 7)), 'NS');
  assert.equal(previewText(scoreCapture(chip('sci', 1.212e12), chip('sci', 8.8e8), 'mul', 8)), '+1.1×10²¹');
  assert.equal(previewText(scoreCapture(chip('sci', 2.2e2), chip('sci', 2.2e2), 'sub', 8)), '+0');
  assert.equal(previewText(scoreCapture(chip('pct', 25), chip('pct', 40), 'add', 9)), '+91°F');
  assert.equal(previewText(scoreCapture(chip('g', 37), chip('C', 11), 'mul', 10)), '+407 g·°C');
});

test('the scoring guide is worked by the engine, and shows scoring and non-scoring captures', () => {
  for (const grade of ALL) {
    const { equations, note } = scoringGuide(grade);
    assert.ok(note.length > 0);
    assert.ok(equations.length >= 4, `grade ${grade}`);
    assert.ok(equations.some((eq) => eq.base !== null), `grade ${grade} shows a score`);
    assert.ok(equations.some((eq) => eq.base === null), `grade ${grade} shows no score`);
    for (const eq of equations) {
      const parts = equationParts(eq);
      assert.ok(parts.scored || parts.reason, `grade ${grade}: ${parts.left} needs a reason`);
    }
    for (const eq of equations) {
      const allowed = GRADES[grade].chips.some((c) => c.unit === eq.a.unit);
      assert.ok(allowed, `grade ${grade} uses its own units`);
    }
  }
  assert.equal(equationText(scoringGuide(7).equations[2]), '5 kWh + 3 kWh = 8 kWh · ×5 ₱/kWh = ₱40');
  assert.equal(equationText(scoringGuide(9).equations[0]), '25% + 40% = 65% → 91°F');
  assert.equal(equationText(scoringGuide(10).equations[2]), '37 g × 11°C = 407 g·°C');
});
