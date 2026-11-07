import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStep, endGame, GRADES, initialBoard, initialState, legalSteps, PLAYABLE, replay, scoreCapture, sq, type Cell, type GameState, type Side } from './engine.ts';
import { chooseTurn, evaluate, turnsFrom, type BotLevel } from './bot.ts';
import { rate, expectedScore } from './rating.ts';
import { decodeBoard, encodeBoard } from './codec.ts';
import { captureNotice, equationParts, quantity, scientific, scoreText } from './notation.ts';
import { DEFAULT_ROOM_SETTINGS } from './presets.ts';

function lcg(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function randomPosition(rng: () => number, plies: number): GameState {
  let s = initialState();
  for (let i = 0; i < plies && !s.result; i++) {
    const legal = legalSteps(s);
    s = applyStep(s, legal[Math.floor(rng() * legal.length)]).state;
  }
  return s;
}

test('bot turns are legal step sequences for every level', () => {
  const rng = lcg(7);
  const levels: BotLevel[] = ['easy', 'medium', 'hard'];
  for (let n = 0; n < 60; n++) {
    const s = randomPosition(rng, Math.floor(rng() * 40));
    if (s.result) continue;
    for (const level of levels) {
      const turn = chooseTurn(s, level, { rng, budgetMs: 40 });
      assert.ok(turn.length > 0);
      let cur = s;
      for (const step of turn) {
        assert.equal(cur.turn, s.turn, 'every step in a turn belongs to the same side');
        cur = applyStep(cur, step).state; // throws if illegal
      }
      assert.ok(cur.result || cur.turn !== s.turn, 'a bot turn always completes');
    }
  }
});

test('bot plays a mandatory capture', () => {
  const board: Cell[] = new Array(64).fill(null);
  board[sq(2, 3)] = { id: 'r1', side: 'red', unit: 'P', value: 8, king: false };
  board[sq(3, 4)] = { id: 'b1', side: 'blue', unit: 'P', value: 4, king: false };
  board[sq(7, 6)] = { id: 'b2', side: 'blue', unit: 'P', value: 2, king: false };
  const s: GameState = { ...initialState(), board };
  // Capturing is mandatory anyway; check the bot finds the turn and plays it.
  assert.deepEqual(chooseTurn(s, 'hard', { budgetMs: 100 }), [{ from: sq(2, 3), to: sq(4, 5) }]);
});

test('bot values a capture that scores nothing above one that scores, because points count against it', () => {
  const board: Cell[] = new Array(64).fill(null);
  board[sq(3, 2)] = { id: 'r1', side: 'red', unit: 'P', value: 8, king: false };
  board[sq(2, 3)] = { id: 'b1', side: 'blue', unit: 'P', value: 12, king: false }; // lands on (1,4) +: ₱20
  board[sq(4, 3)] = { id: 'b2', side: 'blue', unit: 'kWh', value: 5, king: false }; // mixed units: NS
  board[sq(0, 7)] = { id: 'b3', side: 'blue', unit: 'P', value: 2, king: false };
  const s: GameState = { ...initialState(), board };
  const noScore = applyStep(s, { from: sq(3, 2), to: sq(5, 4) });
  const scoring = applyStep(s, { from: sq(3, 2), to: sq(1, 4) });
  assert.equal(noScore.record.points, 0);
  assert.equal(scoring.record.points, 20);
  assert.ok(evaluate(noScore.state, 'red') > evaluate(scoring.state, 'red'));
});

test('bot treats the lower final score as the win', () => {
  const s = { ...initialState(), scores: { red: 0, blue: 50 }, columns: { red: {}, blue: { P: 50 } } };
  const over = endGame(s, 'time');
  assert.equal(over.result?.winner, 'red');
  assert.ok(evaluate(over, 'red') > 0);
  assert.ok(evaluate(over, 'blue') < 0);
  assert.ok(evaluate(s, 'red') > evaluate(s, 'blue'), 'points already scored are a liability mid-game too');
});

test('bot counts chips still on the board against their owner', () => {
  const board: Cell[] = new Array(64).fill(null);
  board[sq(1, 0)] = { id: 'r1', side: 'red', unit: 'P', value: 12, king: false };
  board[sq(6, 7)] = { id: 'b1', side: 'blue', unit: 'P', value: 2, king: false };
  const s: GameState = { ...initialState(), board };
  assert.ok(evaluate(s, 'red') < -5, 'neither side has scored, but red is ₱10 worse off');
  assert.ok(evaluate(s, 'blue') > 5);
});

test('with the lower score winning, a stronger bot still beats random play', () => {
  const rng = lcg(11);
  let wins = 0;
  const games = 12;
  for (let n = 0; n < games; n++) {
    const botSide: Side = n % 2 ? 'blue' : 'red';
    let s = initialState();
    for (let turn = 0; turn < 160 && !s.result; turn++) {
      if (s.turn === botSide) {
        for (const step of chooseTurn(s, 'medium', { rng, budgetMs: 10 })) s = applyStep(s, step).state;
      } else {
        const side = s.turn;
        while (!s.result && s.turn === side) {
          const legal = legalSteps(s);
          s = applyStep(s, legal[Math.floor(rng() * legal.length)]).state;
        }
      }
    }
    if (endGame(s, 'time').result?.winner === botSide) wins++;
  }
  assert.ok(wins >= 10, `medium won ${wins} of ${games}`);
});

test('turnsFrom expands multi-captures into single turns', () => {
  const board: Cell[] = new Array(64).fill(null);
  board[sq(2, 1)] = { id: 'r1', side: 'red', unit: 'P', value: 8, king: false };
  board[sq(3, 2)] = { id: 'b1', side: 'blue', unit: 'P', value: 4, king: false };
  board[sq(3, 4)] = { id: 'b2', side: 'blue', unit: 'P', value: 6, king: false };
  board[sq(0, 7)] = { id: 'b3', side: 'blue', unit: 'P', value: 2, king: false };
  const turns = turnsFrom({ ...initialState(), board });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].steps.length, 2);
});

test('elo: equal players swing 16 points at K 32; draws between equals change nothing', () => {
  assert.equal(expectedScore(1200, 1200), 0.5);
  assert.deepEqual(rate({ rating: 1200, games: 0 }, { rating: 1200, games: 0 }, 1), { a: 1216, b: 1184 });
  assert.deepEqual(rate({ rating: 1200, games: 40 }, { rating: 1200, games: 40 }, 0.5), { a: 1200, b: 1200 });
  const upset = rate({ rating: 1000, games: 40 }, { rating: 1400, games: 40 }, 1);
  assert.ok(upset.a - 1000 > 15 && upset.a - 1000 < 20);
});

test('codec round-trips boards, crowns included', () => {
  const rng = lcg(99);
  for (let n = 0; n < 50; n++) {
    let s = randomPosition(rng, Math.floor(rng() * 80));
    const board = s.board.map((p, i) => (p && i % 3 === 0 ? { ...p, king: true } : p));
    s = { ...s, board };
    const code = encodeBoard(s.board);
    assert.equal(code.length, 32);
    assert.deepEqual(decodeBoard(code), s.board);
  }
});

test('rooms default to forced capture and auto-capture', () => {
  assert.equal(DEFAULT_ROOM_SETTINGS.maxCapture, true);
  assert.equal(DEFAULT_ROOM_SETTINGS.autoCapture, true);
});

const chip = (side: Side, unit: 'P' | 'kWh', value: number, king = false) => ({ id: `${side}${unit}${value}`, side, unit, value, king });

function position(pieces: [number, ReturnType<typeof chip>][], turn: Side = 'red'): GameState {
  const board: Cell[] = new Array(64).fill(null);
  for (const [square, piece] of pieces) board[square] = piece;
  return { ...initialState(), board, turn };
}

const forcedPosition = () => position([[sq(2, 3), chip('red', 'P', 8)], [sq(3, 4), chip('blue', 'P', 4)], [sq(7, 6), chip('blue', 'P', 2)]]);
const choicePosition = () =>
  position([[sq(3, 2), chip('red', 'P', 8)], [sq(2, 3), chip('blue', 'P', 4)], [sq(4, 3), chip('blue', 'P', 6)], [sq(7, 6), chip('blue', 'P', 2)]]);

test('capture notice: a forced capture says so, in words that fit the setting and the reader', () => {
  const s = forcedPosition();
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: 'red' }), 'Auto-capture: your ₱8 must take ₱4.');
  assert.equal(captureNotice(s, null, { autoCapture: false, viewer: 'red' }), 'Forced capture: your ₱8 must take ₱4.');
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: 'blue' }), "Auto-capture: Red's ₱8 must take ₱4.");
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: null }), "Auto-capture: Red's ₱8 must take ₱4.");
});

test('capture notice: a choice of captures is left to the player and only they see it', () => {
  const s = choicePosition();
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: 'red' }), 'You must capture. Choose your capture.');
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: 'blue' }), null);
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: null }), null);
});

test('capture notice: explains when the priority rules narrow the options', () => {
  const s = position([
    [sq(0, 1), chip('red', 'P', 2)], // ordinary chip can take one
    [sq(7, 2), chip('red', 'P', 4, true)], // dama can take one, with several landing squares
    [sq(1, 2), chip('blue', 'P', 6)],
    [sq(5, 4), chip('blue', 'P', 8)],
    [sq(0, 7), chip('blue', 'P', 12)],
  ]);
  assert.equal(captureNotice(s, null, { autoCapture: true, viewer: 'red' }), 'You must capture. The most chips come first, then a dama.');
});

test('capture notice: a chain tells the player to keep going', () => {
  const s = position([[sq(4, 3), chip('red', 'P', 8)], [sq(3, 4), chip('blue', 'P', 6)], [sq(5, 4), chip('blue', 'P', 4)], [sq(0, 7), chip('blue', 'P', 2)]]);
  assert.equal(captureNotice({ ...s, jumper: sq(4, 3) }, null, { autoCapture: true, viewer: 'red' }), 'Keep capturing with this chip.');
});

test('capture notice: stays up after an auto-capture, only when one was played', () => {
  const { records } = replay([
    { from: sq(5, 2), to: sq(4, 3) },
    { from: sq(2, 5), to: sq(3, 4) },
    { from: sq(4, 3), to: sq(2, 5) },
  ]);
  const last = records[records.length - 1];
  assert.equal(last.forced, true);
  // Blue has its own capture to make next, so look at a quiet position with that record.
  const quiet = initialState();
  assert.equal(captureNotice(quiet, last, { autoCapture: true, viewer: 'red' }), 'Auto-capture: your ₱2 took ₱2.');
  assert.equal(captureNotice(quiet, last, { autoCapture: true, viewer: 'blue' }), "Auto-capture: Red's ₱2 took ₱2.");
  assert.equal(captureNotice(quiet, last, { autoCapture: false, viewer: 'red' }), null);
  assert.equal(captureNotice(quiet, records[0], { autoCapture: true, viewer: 'red' }), null);
});

test('capture notice: nothing to say on a quiet board or a finished game', () => {
  assert.equal(captureNotice(initialState(), null, { autoCapture: true, viewer: 'red' }), null);
  assert.equal(captureNotice(endGame(forcedPosition(), 'resign', 'blue'), null, { autoCapture: true, viewer: 'red' }), null);
});

test('quantity writes every unit the way the score sheets do', () => {
  assert.equal(quantity('P', 8), '₱8');
  assert.equal(quantity('P', 1240), '₱1,240');
  assert.equal(quantity('kWh', 11), '11 kWh');
  assert.equal(quantity('pct', 25), '25%');
  assert.equal(quantity('F', 91), '91°F');
  assert.equal(quantity('g', 37), '37 g');
  assert.equal(quantity('C', 37), '37°C');
  assert.equal(quantity('gC', 370), '370 g·°C');
  assert.equal(quantity('sci', 0.11), '1.1 × 10⁻¹');
});

test('scientific notation: exponents, trimmed zeros and five figures at most', () => {
  assert.equal(scientific(220), '2.2 × 10²');
  assert.equal(scientific(220.11), '2.2011 × 10²');
  assert.equal(scientific(1.212e12), '1.212 × 10¹²');
  assert.equal(scientific(1.111e-11), '1.111 × 10⁻¹¹');
  assert.equal(scientific(1.01e10), '1.01 × 10¹⁰');
  assert.equal(scientific(3), '3 × 10⁰');
  assert.equal(scientific(1000), '1 × 10³');
  assert.equal(scientific(0.1 + 0.2), '3 × 10⁻¹', 'floating-point noise never shows');
  assert.equal(scientific(1234567), '1.2346 × 10⁶');
  assert.equal(scientific(0), '0');
});

test('scores are written in the grade\'s unit', () => {
  assert.equal(scoreText(1240), '₱1,240');
  assert.equal(scoreText(0, 7), '₱0');
  assert.equal(GRADES[7].scoreUnit, 'P');
});

test('equation parts name the column the result went in', () => {
  const p = (unit: 'P' | 'kWh', value: number) => ({ id: 'x', side: 'red' as const, unit, value, king: false });
  const kwh = equationParts(scoreCapture(p('kWh', 5), p('kWh', 3), 'add'));
  assert.equal(kwh.result, '8 kWh');
  assert.deepEqual(kwh.factors, ['×5 ₱/kWh']);
  assert.equal(kwh.points, '₱40');
  assert.deepEqual(equationParts(scoreCapture(p('P', 8), p('P', 4), 'add')).factors, []);
});

test('codec: every chip of a grade survives the trip, on either side, crowned or not', () => {
  for (const grade of Object.keys(GRADES).map(Number) as (keyof typeof GRADES)[]) {
    const start = initialBoard(grade);
    assert.deepEqual(decodeBoard(encodeBoard(start, grade), grade), start);
    const crowned = start.map((p) => (p ? { ...p, king: true } : null));
    assert.deepEqual(decodeBoard(encodeBoard(crowned, grade), grade), crowned);
  }
});

test('codec: one character per playable square, and an unknown chip is left out', () => {
  const start = initialBoard();
  assert.equal(encodeBoard(start).length, PLAYABLE.length);
  const stranger: Cell[] = new Array(64).fill(null);
  stranger[sq(1, 0)] = { id: 'x', side: 'red', unit: 'g', value: 37, king: false };
  assert.equal(encodeBoard(stranger), '.'.repeat(32));
});
