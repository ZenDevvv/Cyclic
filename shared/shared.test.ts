import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStep, initialState, legalSteps, sq, type Cell, type GameState } from './engine.ts';
import { chooseTurn, turnsFrom, type BotLevel } from './bot.ts';
import { rate, expectedScore } from './rating.ts';
import { decodeBoard, encodeBoard } from './codec.ts';

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

test('bot takes a free scoring capture over a quiet move', () => {
  const board: Cell[] = new Array(64).fill(null);
  board[sq(2, 3)] = { id: 'r1', side: 'red', unit: 'P', value: 8, king: false };
  board[sq(3, 4)] = { id: 'b1', side: 'blue', unit: 'P', value: 4, king: false };
  board[sq(7, 6)] = { id: 'b2', side: 'blue', unit: 'P', value: 2, king: false };
  const s: GameState = { ...initialState(), board };
  // Capturing is mandatory anyway; check the bot finds the turn and plays it.
  assert.deepEqual(chooseTurn(s, 'hard', { budgetMs: 100 }), [{ from: sq(2, 3), to: sq(4, 5) }]);
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
