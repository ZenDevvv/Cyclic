// Board themes are colours, so they are checked by measurement: AGENTS.md asks for contrast of at least 4.5:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(import.meta.dirname, '../client/src/styles/tokens.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const root = tokens(css.slice(css.indexOf(':root'), css.indexOf("[data-board='")));
const themes: Record<string, Record<string, string>> = { felt: root };
for (const m of css.matchAll(/\[data-board='(\w+)'\]\s*\{([^}]*)\}/g)) themes[m[1]] = tokens(m[2]);

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** A translucent colour over a solid one. */
function over(top: string, under: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = top.match(/[\d.]+/g)!.map(Number);
  return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
}

const REQUIRED = ['sq-light', 'sq-dark', 'sq-glyph', 'sq-coord-light', 'sq-coord-dark'];
const NEW_THEMES = ['chalk', 'sky', 'clay'];

test('every board theme defines all its tokens', () => {
  for (const name of ['felt', 'slate', 'paper', ...NEW_THEMES]) {
    assert.ok(themes[name], `${name} is missing from tokens.css`);
    for (const token of REQUIRED) assert.ok(themes[name][token], `${name} needs --${token}`);
  }
});

test('edge coordinates reach 4.5:1 on their squares, in every theme', () => {
  for (const [name, t] of Object.entries(themes)) {
    assert.ok(contrast(rgb(t['sq-coord-light']), rgb(t['sq-light'])) >= 4.5, `${name}: coordinates on light squares`);
    assert.ok(contrast(rgb(t['sq-coord-dark']), rgb(t['sq-dark'])) >= 4.5, `${name}: coordinates on dark squares`);
  }
});

test('light and dark squares stay far apart, so the board reads at a glance', () => {
  for (const [name, t] of Object.entries(themes)) {
    assert.ok(contrast(rgb(t['sq-light']), rgb(t['sq-dark'])) >= 4.5, name);
  }
});

test('operator signs are as readable in the new themes as on the default board', () => {
  const felt = contrast(over(root['sq-glyph'], rgb(root['sq-light'])), rgb(root['sq-light']));
  for (const name of NEW_THEMES) {
    const t = themes[name];
    const glyph = contrast(over(t['sq-glyph'], rgb(t['sq-light'])), rgb(t['sq-light']));
    assert.ok(glyph >= felt * 0.95, `${name}: ${glyph.toFixed(2)} against felt's ${felt.toFixed(2)}`);
  }
});

test('chips and amber marks stand out from every new light square', () => {
  const feltAmber = contrast(rgb(root.accent), rgb(root['sq-light']));
  for (const name of NEW_THEMES) {
    const light = rgb(themes[name]['sq-light']);
    for (const chip of ['red-chip', 'blue-chip']) assert.ok(contrast(rgb(root[chip]), light) >= 3, `${name}: ${chip}`);
    assert.ok(contrast(rgb(root.accent), light) >= feltAmber * 0.95, `${name}: amber marks`);
  }
});

test('capture points are a penalty: readable, and not the amber used for marks', () => {
  assert.ok(contrast(rgb(root.negative), rgb(root['pill-negative-bg'])) >= 4.5, 'the preview pill');
  assert.ok(contrast(rgb(root.negative), rgb(root.surface)) >= 4.5, 'ledger points');
  assert.notEqual(root.negative, root.accent);
});

test('the new themes look different from each other and from felt', () => {
  const names = ['felt', ...NEW_THEMES];
  for (const a of names) for (const b of names) {
    if (a >= b) continue;
    const [x, y] = [rgb(themes[a]['sq-dark']), rgb(themes[b]['sq-dark'])];
    const distance = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    assert.ok(distance >= 30, `${a} and ${b} are too alike: ${distance.toFixed(0)}`);
  }
});
