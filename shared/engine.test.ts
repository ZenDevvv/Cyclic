import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStep,
  countPieces,
  DEFAULT_RULES,
  endGame,
  forcedStep,
  IllegalStepError,
  initialState,
  legalSteps,
  mustCaptureSquares,
  OPERATORS,
  piecePoints,
  PLAYABLE,
  replay,
  scoreCapture,
  sq,
  yOf,
  type Cell,
  type GameState,
  type Piece,
  type Rules,
  type Side,
  type Unit,
} from './engine.ts';
import { equationText } from './notation.ts';

type Spec = [x: number, y: number, side: Side, unit: Unit, value: number, king?: boolean];

function make(specs: Spec[], turn: Side = 'red', rules: Partial<Rules> = {}): GameState {
  const board: Cell[] = new Array(64).fill(null);
  specs.forEach(([x, y, side, unit, value, king = false], n) => {
    assert.ok(PLAYABLE.includes(sq(x, y)), `test setup uses dead square (${x},${y})`);
    board[sq(x, y)] = { id: `${side[0]}${n}`, side, unit, value, king };
  });
  return { ...initialState(rules), board, turn };
}

const steps = (s: GameState) => legalSteps(s).map((m) => `${m.from}>${m.to}${m.capture !== null ? 'x' + m.capture : ''}`).sort();
const piece = (unit: Unit, value: number, king = false, side: Side = 'red'): Piece => ({ id: 'x', side, unit, value, king });

test('initial layout: 12 chips each, on playable squares, red moves first', () => {
  const s = initialState();
  assert.equal(countPieces(s.board, 'red'), 12);
  assert.equal(countPieces(s.board, 'blue'), 12);
  assert.equal(s.turn, 'red');
  s.board.forEach((p, i) => {
    if (!p) return;
    assert.ok(PLAYABLE.includes(i), `piece on dead square ${i}`);
    assert.ok(p.side === 'red' ? yOf(i) <= 2 : yOf(i) >= 5);
  });
  assert.deepEqual(s.board[sq(1, 0)], { id: 'r-P12', side: 'red', unit: 'P', value: 12, king: false });
  assert.deepEqual(s.board[sq(6, 7)], { id: 'b-P12', side: 'blue', unit: 'P', value: 12, king: false });
  assert.equal(s.board[sq(4, 1)]?.id, 'r-kWh11');
  assert.equal(s.board[sq(0, 5)]?.id, 'b-kWh5');
});

test('operators: 32 squares, matches the printed board, symmetric under a half turn', () => {
  assert.equal(OPERATORS.filter(Boolean).length, 32);
  assert.equal(OPERATORS[sq(0, 7)], 'mul');
  assert.equal(OPERATORS[sq(6, 7)], 'add');
  assert.equal(OPERATORS[sq(1, 0)], 'add');
  assert.equal(OPERATORS[sq(7, 0)], 'mul');
  assert.equal(OPERATORS[sq(3, 4)], 'sub');
  assert.equal(OPERATORS[sq(5, 4)], 'div');
  for (let i = 0; i < 64; i++) assert.equal(OPERATORS[i], OPERATORS[63 - i]);
});

test('opening: red has seven forward moves, blue answers forward', () => {
  const s = initialState();
  const legal = legalSteps(s);
  assert.equal(legal.length, 7);
  assert.ok(legal.every((m) => m.capture === null && yOf(m.to) === 3));
  const { state } = applyStep(s, { from: sq(1, 2), to: sq(0, 3) });
  assert.equal(state.turn, 'blue');
  assert.ok(legalSteps(state).every((m) => yOf(m.to) === 4));
});

test('chips do not move backward without a capture', () => {
  const s = make([[3, 4, 'red', 'P', 2], [0, 7, 'blue', 'P', 4]]);
  assert.deepEqual(steps(s), [`${sq(3, 4)}>${sq(2, 5)}`, `${sq(3, 4)}>${sq(4, 5)}`].sort());
});

test('capturing is mandatory', () => {
  const s = make([
    [2, 3, 'red', 'P', 2],
    [6, 1, 'red', 'P', 4],
    [3, 4, 'blue', 'P', 6],
  ]);
  assert.deepEqual(steps(s), [`${sq(2, 3)}>${sq(4, 5)}x${sq(3, 4)}`]);
  assert.deepEqual(mustCaptureSquares(s), [sq(2, 3)]);
  assert.throws(() => applyStep(s, { from: sq(6, 1), to: sq(5, 2) }), IllegalStepError);
});

test('chips capture backward', () => {
  const s = make([[3, 4, 'red', 'P', 2], [2, 3, 'blue', 'P', 6]]);
  assert.deepEqual(steps(s), [`${sq(3, 4)}>${sq(1, 2)}x${sq(2, 3)}`]);
});

test('multi-capture keeps the turn and locks the jumper', () => {
  const s = make([
    [2, 1, 'red', 'P', 8],
    [7, 0, 'red', 'P', 2],
    [3, 2, 'blue', 'P', 4],
    [3, 4, 'blue', 'P', 6],
    [6, 1, 'blue', 'P', 10],
  ]);
  // Both red chips can capture; take the one that can continue.
  const first = applyStep(s, { from: sq(2, 1), to: sq(4, 3) });
  assert.equal(first.record.continues, true);
  assert.equal(first.state.turn, 'red');
  assert.equal(first.state.jumper, sq(4, 3));
  assert.equal(first.state.turnNumber, 1);
  assert.deepEqual(steps(first.state), [`${sq(4, 3)}>${sq(2, 5)}x${sq(3, 4)}`]);
  const second = applyStep(first.state, { from: sq(4, 3), to: sq(2, 5) });
  assert.equal(second.record.continues, false);
  assert.equal(second.record.turn, 1);
  assert.equal(second.state.turn, 'blue');
  assert.equal(second.state.turnNumber, 2);
});

test('dama flies along open diagonals', () => {
  const s = make([[0, 1, 'red', 'P', 2, true], [7, 6, 'blue', 'P', 4]]);
  const targets = legalSteps(s).map((m) => m.to).sort((a, b) => a - b);
  assert.deepEqual(targets, [sq(1, 0), sq(1, 2), sq(2, 3), sq(3, 4), sq(4, 5), sq(5, 6), sq(6, 7)].sort((a, b) => a - b));
});

test('dama captures at range and lands anywhere beyond, but not over two in a row', () => {
  const open = make([[0, 1, 'red', 'P', 2, true], [3, 4, 'blue', 'P', 4]]);
  assert.deepEqual(steps(open), [sq(4, 5), sq(5, 6), sq(6, 7)].map((t) => `${sq(0, 1)}>${t}x${sq(3, 4)}`).sort());
  const blocked = make([[0, 1, 'red', 'P', 2, true], [3, 4, 'blue', 'P', 4], [4, 5, 'blue', 'P', 6]]);
  assert.ok(legalSteps(blocked).every((m) => m.capture === null));
  const ownInWay = make([[0, 1, 'red', 'P', 2, true], [2, 3, 'red', 'P', 8], [3, 4, 'blue', 'P', 4]]);
  assert.ok(!legalSteps(ownInWay).some((m) => m.from === sq(0, 1) && m.capture !== null));
});

test('crowning on the far row at the end of a turn', () => {
  const s = make([[1, 6, 'red', 'kWh', 3], [0, 3, 'blue', 'P', 2]]);
  const { state, record } = applyStep(s, { from: sq(1, 6), to: sq(2, 7) });
  assert.equal(record.crowned, true);
  assert.equal(state.board[sq(2, 7)]?.king, true);
  const b = make([[6, 1, 'blue', 'P', 4], [0, 7, 'red', 'P', 2]], 'blue');
  const r = applyStep(b, { from: sq(6, 1), to: sq(5, 0) });
  assert.equal(r.record.crowned, true);
});

test('a chip passing the far row mid-sequence is not crowned until it stops there', () => {
  const s = make([
    [2, 5, 'red', 'P', 8],
    [3, 6, 'blue', 'P', 2],
    [5, 6, 'blue', 'P', 4],
    [1, 0, 'blue', 'P', 6], // a spare blue chip
  ]);
  const a = applyStep(s, { from: sq(2, 5), to: sq(4, 7) });
  assert.equal(a.record.continues, true);
  assert.equal(a.record.crowned, false);
  assert.equal(a.state.board[sq(4, 7)]?.king, false);
  const b = applyStep(a.state, { from: sq(4, 7), to: sq(6, 5) });
  assert.equal(b.record.crowned, false);
  assert.equal(b.state.board[sq(6, 5)]?.king, false);
});

test('scoring table: like units add and subtract; × and ÷ and mixed units score nothing', () => {
  assert.equal(scoreCapture(piece('P', 8), piece('P', 4), 'add').points, 12);
  assert.equal(scoreCapture(piece('P', 8), piece('P', 4), 'sub').points, 4);
  assert.equal(scoreCapture(piece('P', 4), piece('P', 4), 'sub').points, 0);
  const neg = scoreCapture(piece('P', 2), piece('P', 8), 'sub');
  assert.equal(neg.base, null);
  assert.equal(neg.points, 0);
  assert.equal(scoreCapture(piece('P', 8), piece('P', 4), 'mul').points, 0);
  assert.equal(scoreCapture(piece('P', 8), piece('P', 4), 'div').points, 0);
  assert.equal(scoreCapture(piece('P', 8), piece('kWh', 3), 'add').points, 0);
  assert.equal(scoreCapture(piece('kWh', 3), piece('P', 8), 'sub').points, 0);
});

test('scoring multipliers: dama ×2 each side, kWh converted at ₱5', () => {
  assert.equal(scoreCapture(piece('kWh', 5), piece('kWh', 3), 'add').points, 40); // 8 kWh × 5
  assert.equal(scoreCapture(piece('P', 8, true), piece('P', 4), 'add').points, 24);
  assert.equal(scoreCapture(piece('P', 8), piece('P', 4, true), 'add').points, 24);
  assert.equal(scoreCapture(piece('P', 8, true), piece('P', 4, true), 'add').points, 48);
  assert.equal(scoreCapture(piece('kWh', 9, true), piece('kWh', 1, true), 'sub').points, 8 * 4 * 5);
  assert.equal(equationText(scoreCapture(piece('P', 8, true), piece('P', 4), 'add')), '₱8 + ₱4 = ₱12 · ×2 dama = ₱24');
  assert.equal(equationText(scoreCapture(piece('kWh', 5), piece('kWh', 3), 'mul')), '5 kWh × 3 kWh = NS');
  assert.equal(equationText(scoreCapture(piece('kWh', 5), piece('kWh', 3), 'add')), '5 kWh + 3 kWh = 8 kWh · ×5 ₱/kWh = ₱40');
});

test('the Electro sample score sheet comes to ₱126', () => {
  const scored = [
    scoreCapture(piece('kWh', 7), piece('kWh', 1), 'add'),
    scoreCapture(piece('kWh', 5), piece('kWh', 1), 'sub'),
    scoreCapture(piece('kWh', 7), piece('kWh', 11), 'sub'), // NS
    scoreCapture(piece('kWh', 3), piece('kWh', 3), 'mul'), // NS
    scoreCapture(piece('P', 2), piece('P', 10), 'add'),
    scoreCapture(piece('P', 12), piece('P', 6), 'sub'),
    scoreCapture(piece('P', 10), piece('P', 4), 'mul'), // NS
    scoreCapture(piece('P', 12), piece('P', 2), 'div'), // NS
  ].reduce((sum, eq) => sum + eq.points, 0);
  const remaining = [piece('kWh', 5), piece('kWh', 1), piece('P', 2), piece('P', 6), piece('P', 10)].reduce((sum, p) => sum + piecePoints(p), 0);
  assert.equal(scored + remaining, 126);
});

test('a capture adds its points to the capturing side', () => {
  // (4,5) is ×, (0,5) is −. Red ₱8 jumps blue ₱6 from (2,3) over (1,4) to (0,5).
  const s = make([[2, 3, 'red', 'P', 8], [1, 4, 'blue', 'P', 6], [7, 6, 'blue', 'P', 2]]);
  const { state, record } = applyStep(s, { from: sq(2, 3), to: sq(0, 5) });
  assert.equal(record.op, 'sub');
  assert.equal(record.points, 2);
  assert.deepEqual(state.scores, { red: 2, blue: 0 });
});

test('elimination ends the game; remaining chips are tallied and the lower score wins', () => {
  // Red ₱2 takes blue's last chip (a ₱12 dama) landing on ÷, which scores nothing.
  const s = make([[4, 3, 'red', 'P', 2], [5, 4, 'blue', 'P', 12, true]]);
  assert.equal(OPERATORS[sq(6, 5)], 'div');
  const r = applyStep(s, { from: sq(4, 3), to: sq(6, 5) });
  const res = r.state.result!;
  assert.equal(res.reason, 'elimination');
  assert.equal(res.tally.red.total, 2);
  assert.equal(res.final.red, 0 + 2);
  assert.equal(res.final.blue, 0);
  assert.equal(res.winner, 'blue', 'the side that lost every chip finished lower');
  assert.deepEqual(legalSteps(r.state), []);
});

test('score decides, whoever was eliminated', () => {
  const board = make([[4, 3, 'red', 'P', 2], [5, 4, 'blue', 'P', 4]]);
  const end = (scores: Record<Side, number>) => applyStep({ ...board, scores }, { from: sq(4, 3), to: sq(6, 5) }).state.result;
  assert.equal(end({ red: 0, blue: 50 })?.winner, 'red', 'the eliminated side scored more, so it loses');
  assert.equal(end({ red: 50, blue: 0 })?.winner, 'blue', 'the eliminated side scored less, so it wins');
  assert.equal(end({ red: 0, blue: 2 })?.winner, null, 'level finals are a draw');
});

test('a side with no legal move ends the game (blocked)', () => {
  // Blue ₱2 on (0,1) can only step to (1,0), which red holds, and the jump would leave the board.
  const s = make([
    [1, 0, 'red', 'P', 12],
    [0, 1, 'blue', 'P', 2],
    [7, 4, 'red', 'P', 8],
  ]);
  assert.ok(legalSteps(s).every((m) => m.capture === null));
  const r = applyStep(s, { from: sq(7, 4), to: sq(6, 5) });
  assert.equal(r.state.result?.reason, 'blocked');
  assert.equal(r.state.result?.final.red, 12 + 8);
  assert.equal(r.state.result?.final.blue, 2);
  assert.equal(r.state.result?.winner, 'blue');
});

test('endGame: timeout and resign take a winner, agreement is a draw, time is by score', () => {
  const s = { ...initialState(), scores: { red: 10, blue: 0 } };
  assert.equal(endGame(s, 'timeout', 'blue').result?.winner, 'blue');
  assert.equal(endGame(s, 'agreement').result?.winner, null);
  const t = endGame(s, 'time').result!;
  assert.equal(t.tally.red.total, t.tally.blue.total); // symmetric start
  assert.equal(t.winner, 'blue', 'red scored more, so blue wins on time');
  const level = endGame(initialState(), 'time').result!;
  assert.equal(level.winner, null);
  assert.equal(endGame(endGame(s, 'resign', 'red'), 'resign', 'blue').result?.winner, 'red', 'first result sticks');
});

test('maxCapture rule keeps only the longest sequences', () => {
  const specs: Spec[] = [
    [0, 1, 'red', 'P', 2], // single capture available
    [5, 2, 'red', 'P', 4], // double capture available
    [1, 2, 'blue', 'P', 6],
    [6, 3, 'blue', 'P', 8],
    [6, 5, 'blue', 'P', 10],
    [0, 7, 'blue', 'P', 12],
  ];
  const free = make(specs, 'red', { maxCapture: false });
  assert.equal(new Set(legalSteps(free).map((m) => m.from)).size, 2);
  assert.deepEqual(steps(make(specs)), [`${sq(5, 2)}>${sq(7, 4)}x${sq(6, 3)}`], 'on by default');
});

test('the most-chips rule is on by default', () => {
  assert.equal(DEFAULT_RULES.maxCapture, true);
  assert.equal(initialState().rules.maxCapture, true);
  assert.equal(initialState({ maxCapture: false }).rules.maxCapture, false);
});

test('capture priority: on equal counts a dama goes before a chip', () => {
  const specs: Spec[] = [
    [0, 1, 'red', 'P', 2], // chip takes one
    [7, 2, 'red', 'P', 4, true], // dama takes one
    [1, 2, 'blue', 'P', 6],
    [5, 4, 'blue', 'P', 8],
    [0, 7, 'blue', 'P', 12],
  ];
  assert.deepEqual([...new Set(legalSteps(make(specs)).map((m) => m.from))], [sq(7, 2)]);
  const free = make(specs, 'red', { maxCapture: false });
  assert.deepEqual([...new Set(legalSteps(free).map((m) => m.from))].sort((a, b) => a - b), [sq(0, 1), sq(7, 2)]);
});

// The dama on (7,4) can take (6,5) and then nothing: (2,3) stops it jumping (3,4) afterwards.
const twoOverOne = (king: boolean): Spec[] => [
  [2, 1, 'red', 'P', 4, king], // takes (3,2), then (3,4)
  [7, 4, 'red', 'P', 2, true],
  [3, 2, 'blue', 'P', 6],
  [3, 4, 'blue', 'P', 8],
  [2, 3, 'blue', 'P', 12],
  [6, 5, 'blue', 'P', 10],
];

test('capture priority: a chip taking two beats a dama taking one', () => {
  assert.deepEqual([...new Set(legalSteps(make(twoOverOne(false))).map((m) => m.from))], [sq(2, 1)]);
});

test('capture priority: a dama taking two beats a dama taking one', () => {
  assert.deepEqual([...new Set(legalSteps(make(twoOverOne(true))).map((m) => m.from))], [sq(2, 1)]);
});

test('forcedStep: only a capture that is the single legal step', () => {
  const one = make([[2, 3, 'red', 'P', 8], [3, 4, 'blue', 'P', 4], [7, 6, 'blue', 'P', 2]]);
  assert.deepEqual(forcedStep(one), { from: sq(2, 3), to: sq(4, 5), capture: sq(3, 4) });

  assert.equal(forcedStep(initialState()), null, 'plain moves are never forced');
  const lonePlain = make([[0, 1, 'red', 'P', 8], [7, 6, 'blue', 'P', 2]]);
  assert.equal(legalSteps(lonePlain).length, 1);
  assert.equal(forcedStep(lonePlain), null, 'a single plain move is still the player\'s to make');

  const twoTargets = make([[3, 2, 'red', 'P', 8], [2, 3, 'blue', 'P', 4], [4, 3, 'blue', 'P', 6], [7, 6, 'blue', 'P', 2]]);
  assert.equal(legalSteps(twoTargets).length, 2);
  assert.equal(forcedStep(twoTargets), null, 'two captures are a choice');

  const landings = make([[0, 1, 'red', 'P', 8, true], [2, 3, 'blue', 'P', 4], [7, 6, 'blue', 'P', 2]]);
  assert.ok(legalSteps(landings).length > 1);
  assert.equal(forcedStep(landings), null, 'a dama choosing where to land is a choice');

  assert.equal(forcedStep(endGame(one, 'resign', 'blue')), null, 'nothing is forced once the game is over');
});

test('forcedStep follows a chain one jump at a time', () => {
  const s = make([[2, 1, 'red', 'P', 8], [3, 2, 'blue', 'P', 4], [3, 4, 'blue', 'P', 6], [0, 7, 'blue', 'P', 2]]);
  const first = forcedStep(s);
  assert.equal(first?.capture, sq(3, 2));
  const mid = applyStep(s, first!).state;
  assert.equal(mid.jumper, sq(4, 3));
  assert.equal(forcedStep(mid)?.capture, sq(3, 4));
});

test('step records say whether a capture was forced, and a replay agrees', () => {
  const forced = make([[2, 3, 'red', 'P', 8], [3, 4, 'blue', 'P', 4], [7, 6, 'blue', 'P', 2]]);
  assert.equal(applyStep(forced, { from: sq(2, 3), to: sq(4, 5) }).record.forced, true);
  const choice = make([[3, 2, 'red', 'P', 8], [2, 3, 'blue', 'P', 4], [4, 3, 'blue', 'P', 6], [7, 6, 'blue', 'P', 2]]);
  assert.equal(applyStep(choice, legalSteps(choice)[0]).record.forced, false);
  assert.equal(applyStep(initialState(), legalSteps(initialState())[0]).record.forced, false);

  const opening = [
    { from: sq(5, 2), to: sq(4, 3) },
    { from: sq(2, 5), to: sq(3, 4) },
    { from: sq(4, 3), to: sq(2, 5) },
  ];
  assert.deepEqual(replay(opening).records.map((r) => r.forced), [false, false, true]);
});

test('replay rebuilds the same state', () => {
  const s0 = initialState();
  const path = [
    { from: sq(1, 2), to: sq(0, 3) },
    { from: sq(4, 5), to: sq(3, 4) },
  ];
  const r = replay(path);
  let s = s0;
  for (const p of path) s = applyStep(s, p).state;
  assert.deepEqual(r.state, s);
  assert.equal(r.records.length, 2);
});

test('random playouts keep the invariants and always terminate', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let g = 0; g < 500; g++) {
    let s = initialState({ maxCapture: g % 2 === 1 });
    let n = 0;
    while (!s.result && n < 400) {
      const legal = legalSteps(s);
      assert.ok(legal.length > 0, 'a live game always has a legal step');
      const pick = legal[Math.floor(rand() * legal.length)];
      const before = { red: countPieces(s.board, 'red'), blue: countPieces(s.board, 'blue'), scores: { ...s.scores } };
      const { state, record } = applyStep(s, pick);
      assert.ok(countPieces(state.board, 'red') <= before.red);
      assert.ok(countPieces(state.board, 'blue') <= before.blue);
      assert.ok(state.scores.red >= before.scores.red && state.scores.blue >= before.scores.blue);
      if (record.continues) assert.equal(state.turn, record.side);
      s = state;
      n++;
    }
    if (!s.result) s = endGame(s, 'time');
    const res = s.result!;
    assert.equal(res.final.red, s.scores.red + res.tally.red.total);
    assert.equal(res.final.blue, s.scores.blue + res.tally.blue.total);
  }
});
