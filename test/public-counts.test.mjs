// Public roster and arena counts must be derived from the shipped catalog.
//
// The fighter and stage registries (`play/fighter-data.js`, `play/stage-data.js`)
// are the source of truth. The studio pages repeat the totals as prose in many
// places, and those strings drifted once already (see the "Correct MixMash
// roster and arena counts" commit). This test binds every public count phrase
// back to the registry so a roster or stage change fails here instead of
// shipping a stale number.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');

// Every public surface that states a roster or arena total.
const PUBLIC_SURFACES = ['index.html', 'home.html', 'brand.html', 'play/index.html'];

const FIGHTER_NOUNS = /^(headliner|fighter|producer)s?$/i;
const ARENA_NOUNS = /^(arena|stage|venue)s?$/i;

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

// Matches "14 fighters", "14-fighter", "14 DJ Fighters", "Fourteen iconic
// producers", "11 arenas", "11-arena", "11 stages". It deliberately does not
// match "six featured producers" or "Four featured arenas": those describe the
// featured subset cards, not the roster total.
// A total is either plural ("14 fighters") or a hyphenated compound
// ("14-fighter"); a singular space-joined phrase ("One headliner, then four
// supporting cards" in a layout comment) is not a roster count.
const COUNT_PHRASE = /\b(\d+|[a-z]+)\b([ -]|\s+iconic\s+)(?:DJ\s+)?(headliners?|fighters?|producers?|arenas?|stages?|venues?)\b/gi;

function isTotalPhrase(connector, noun) {
  return connector === '-' || /s$/i.test(noun);
}

async function loadCatalogCounts() {
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  for (const file of ['play/stage-data.js', 'play/fighter-data.js']) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    vm.runInNewContext(source, sandbox, { filename: file });
  }
  return {
    fighters: Object.keys(sandbox.MixmashFighterData).length,
    arenas: Object.keys(sandbox.MixmashStageData).length,
  };
}

function toNumber(token) {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

async function countPhrases(file) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const phrases = [];
  for (const match of source.matchAll(COUNT_PHRASE)) {
    const value = toNumber(match[1]);
    if (value === null) continue;
    const noun = match[3];
    if (!isTotalPhrase(match[2], noun)) continue;
    const kind = FIGHTER_NOUNS.test(noun) ? 'fighters' : ARENA_NOUNS.test(noun) ? 'arenas' : null;
    if (!kind) continue;
    const line = source.slice(0, match.index).split('\n').length;
    phrases.push({ file, line, text: match[0], kind, value });
  }
  return phrases;
}

test('public roster and arena counts match the shipped catalog registry', async () => {
  const counts = await loadCatalogCounts();
  assert.ok(counts.fighters > 0 && counts.arenas > 0, 'registry loaded');

  for (const file of PUBLIC_SURFACES) {
    const phrases = await countPhrases(file);
    const fighterPhrases = phrases.filter((phrase) => phrase.kind === 'fighters');
    const arenaPhrases = phrases.filter((phrase) => phrase.kind === 'arenas');
    assert.ok(fighterPhrases.length > 0, `${file} states a fighter total (guard would be vacuous otherwise)`);
    assert.ok(arenaPhrases.length > 0, `${file} states an arena total (guard would be vacuous otherwise)`);

    const stale = phrases.filter((phrase) => phrase.value !== counts[phrase.kind]);
    assert.deepEqual(
      stale.map((phrase) => `${phrase.file}:${phrase.line} "${phrase.text}" (registry has ${counts[phrase.kind]})`),
      [],
      `${file} repeats a roster or arena total that no longer matches play/*-data.js`,
    );
  }
});
