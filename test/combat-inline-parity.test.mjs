// The shipped fighter keeps an inline copy of the canonical combat math.
//
// `src/combat.js` is the tested, canonical implementation of `finite()` and
// `calcKnockback()`. `play/index.html` cannot import an ES module from its
// classic inline script yet, so it carries a hand synced copy. Until the game
// imports the module directly, this test is the seam that proves the copy has
// not drifted: it extracts the inline functions from the page, runs them in an
// isolated VM, and compares their output against the module across valid and
// degenerate inputs.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { finite, calcKnockback } from '../src/combat.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `play/index.html still defines an inline ${name}()`);
  // Walk to the matching closing brace of the function body.
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unbalanced braces while extracting ${name}()`);
}

async function loadInlineCombat() {
  const page = await readFile(path.join(ROOT, 'play', 'index.html'), 'utf8');
  const occurrences = page.split('function calcKnockback(').length - 1;
  assert.equal(occurrences, 1, 'exactly one inline calcKnockback in play/index.html');
  const code = `${extractFunction(page, 'finite')}\n${extractFunction(page, 'calcKnockback')}\n({ finite, calcKnockback })`;
  return vm.runInNewContext(code, {}, { filename: 'play/index.html (inline combat)' });
}

const ATTACKS = [
  { damage: 16, kbBase: 85, kbScale: 130 },
  { damage: 4, kbBase: 25, kbScale: 45 },
  { damage: 0, kbBase: 0, kbScale: 0 },
  { damage: NaN, kbBase: 85, kbScale: 130 },
  { damage: 16, kbBase: Infinity, kbScale: 130 },
  { damage: 16, kbBase: 85, kbScale: undefined },
  { damage: '12', kbBase: 85, kbScale: 130 },
  {},
  null,
  undefined,
];
const DAMAGES = [0, 37, 150, 999, -5, NaN, Infinity, undefined, null, 'x'];
const WEIGHTS = [1, 0.8, 1.4, 0, -1, NaN, Infinity, undefined, null];

test('inline finite() in play/index.html matches src/combat.js', async () => {
  const inline = await loadInlineCombat();
  for (const value of [3.5, 0, -42, NaN, Infinity, -Infinity, undefined, null, 'nope', '7']) {
    assert.deepEqual(inline.finite(value), finite(value), `finite(${String(value)})`);
    assert.deepEqual(inline.finite(value, 1), finite(value, 1), `finite(${String(value)}, 1)`);
  }
});

test('inline calcKnockback() in play/index.html matches src/combat.js', async () => {
  const inline = await loadInlineCombat();
  let compared = 0;
  for (const attack of ATTACKS) {
    for (const damage of DAMAGES) {
      for (const weight of WEIGHTS) {
        const expected = calcKnockback(attack, damage, weight);
        const actual = inline.calcKnockback(attack, damage, weight);
        assert.ok(Number.isFinite(actual), `inline result is finite for ${JSON.stringify([attack, damage, weight])}`);
        assert.ok(Math.abs(actual - expected) < 1e-9, `${JSON.stringify([attack, damage, weight])}: inline ${actual} vs canonical ${expected}`);
        compared += 1;
      }
    }
  }
  assert.equal(compared, ATTACKS.length * DAMAGES.length * WEIGHTS.length);
});
