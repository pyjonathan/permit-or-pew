import { test, assert, assertEqual } from './harness.js';
import { evaluate } from '../engine/acl.js';
import { validate } from '../engine/content.js';
import { wordCount } from '../ui/briefing.js';

async function loadLevels() {
  if (typeof window !== 'undefined') {
    const response = await fetch(new URL('../data/levels.json', import.meta.url));
    return response.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(new URL('../data/levels.json', import.meta.url), 'utf8'));
}

const doc = await loadLevels();

// Expected outcomes typed from the reference tables in specs/001-packet-defender/spec.md:
// waveId -> [decision, matchedSeq] for p1..p8 in order (matchedSeq null = implicit deny).
// These are literals, never computed by the evaluator under test.
const EXPECTED = {
  '1.1': [['permit', 10], ['deny', 20], ['permit', 30], ['deny', 20], ['permit', 30], ['permit', 30], ['deny', 20], ['permit', 30]],
  '1.2': [['deny', 10], ['deny', 10], ['permit', 20], ['deny', 10], ['permit', 20], ['deny', 10], ['permit', 20], ['permit', 20]],
  '2.1': [['permit', 10], ['deny', 20], ['permit', 30], ['deny', 20], ['permit', 30], ['permit', 10], ['deny', 20], ['permit', 30]],
  '2.2': [['deny', 10], ['permit', 30], ['permit', 30], ['deny', 10], ['deny', 10], ['permit', 30], ['permit', 30], ['permit', 30]],
  '3.1': [['permit', 10], ['deny', null], ['deny', null], ['deny', null], ['permit', 20], ['deny', null], ['deny', null], ['permit', 10]],
  '3.2': [['deny', 10], ['permit', 20], ['permit', 20], ['deny', null], ['permit', 20], ['deny', 10], ['deny', null], ['deny', null]],
};

// Spec "Formation and timing rules", typed independently of how the data was produced.
const DIVE_ORDER = [3, 0, 6, 2, 5, 1, 7, 4]; // 0-based packet index of the k-th diver
const PATH_BY_K = ['drop', 'sway', 'swoop-in', 'zigzag'];
const TIMING = { L1: [480, 100, 300], L2: [420, 90, 260], L3: [360, 80, 220] }; // diveStart, diveEvery, diveTicks

const levelWaves = doc.levels.flatMap((l) => l.waves.map((w) => ({ level: l, wave: w })));

test('waves/shipped data passes validation', () => {
  assertEqual(validate(doc), { ok: true });
});

test('waves/there are exactly six waves and they match the reference table ids', () => {
  assertEqual(levelWaves.map(({ wave }) => wave.id), ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2']);
});

test('waves/each wave has 8 packets, 48 in total', () => {
  for (const { wave } of levelWaves) assertEqual(wave.packets.length, 8, `wave ${wave.id}`);
  assertEqual(levelWaves.reduce((n, { wave }) => n + wave.packets.length, 0), 48);
});

test('waves/maximum health is 3', () => {
  assertEqual(doc.maxHealth, 3);
});

test('waves/each wave has a good mix: at least 3 denied and at least 3 permitted packets', () => {
  for (const { wave } of levelWaves) {
    const denied = EXPECTED[wave.id].filter(([d]) => d === 'deny').length;
    assert(denied >= 3 && 8 - denied >= 3, `wave ${wave.id}: ${denied} denied`);
  }
});

for (const { level, wave } of levelWaves) {
  test(`waves/${wave.id} outcomes match the reference table (all 8 packets)`, () => {
    assertEqual(wave.packets.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], 'packet ids');
    wave.packets.forEach((packet, i) => {
      const [decision, matchedSeq] = EXPECTED[wave.id][i];
      const result = evaluate(wave.acl, packet);
      assertEqual([result.decision, result.matchedSeq], [decision, matchedSeq], `packet ${packet.id}`);
    });
  });

  test(`waves/${wave.id} follows the formation and timing rules`, () => {
    const [diveStart, diveEvery, diveTicks] = TIMING[level.id];
    assertEqual(wave.diveTicks, diveTicks, 'diveTicks');
    assertEqual(wave.packets.map((p) => p.slot), [0, 1, 2, 3, 4, 5, 6, 7], 'slots');
    DIVE_ORDER.forEach((index, k) => {
      assertEqual(wave.packets[index].diveAt, diveStart + k * diveEvery, `dive time of packet ${index + 1}`);
      assertEqual(wave.packets[index].path, PATH_BY_K[k % 4], `path of packet ${index + 1}`);
    });
  });
}

test('waves/every packet has finished entering before the first dive (so the formation can be read)', () => {
  for (const { wave } of levelWaves) {
    const first = Math.min(...wave.packets.map((p) => p.diveAt));
    assert(first >= 10 * 7 + 40, `wave ${wave.id} first dive at ${first}`);
  }
});

test('waves/data does not store permit or deny outcomes for packets', () => {
  for (const { wave } of levelWaves) {
    for (const p of wave.packets) {
      assert(!('decision' in p) && !('expected' in p) && !('answer' in p), `packet ${p.id} has an answer key`);
    }
  }
});

// Briefings must be easy to scan: a game start screen is not a manual.
test('waves/every briefing is short, has headings and a worked example, and has no wall of text', () => {
  for (const level of doc.levels) {
    const text = level.briefing;
    assert(wordCount(text) <= 130, `${level.id} has ${wordCount(text)} words (limit 130)`);
    assert((text.match(/^## /gm) ?? []).length >= 3, `${level.id} needs at least 3 headings`);
    assert(/^> /m.test(text), `${level.id} needs a worked example`);
    const paragraphs = text.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b && !/^(## |- |> )/.test(b));
    for (const p of paragraphs) assert(wordCount(p) <= 35, `${level.id} has a paragraph over 35 words: ${p.slice(0, 40)}`);
  }
});

test('waves/the Level 1 briefing states the simplifications (constitution C1)', () => {
  assert(/Simplified/.test(doc.levels[0].briefing) && /IPv4/.test(doc.levels[0].briefing), 'Level 1 must say what is simplified');
});

test('waves/the Level 1 worked example is not one of the entries in the challenge waves', () => {
  const example = '192.168.5.9';
  const used = JSON.stringify(doc.levels.flatMap((l) => l.waves.map((x) => x.acl)));
  assert(!used.includes(example), 'the worked example must differ from the challenge');
});

// ---- sources: the networking rules must point at real, checked documents (constitution C1, spec FR-022) ----

test('sources/no placeholder is left: no TODO text in any source', () => {
  for (const s of doc.sources) {
    for (const field of ['title', 'url', 'section', 'claim']) assert(!/TODO/i.test(s[field]), `source ${s.id} still has a placeholder in ${field}`);
  }
});

test('sources/every source is a secure link to a document host we checked, and has a section and a claim', () => {
  const allowed = ['https://www.cisco.com/', 'https://www.rfc-editor.org/'];
  for (const s of doc.sources) {
    assert(allowed.some((prefix) => s.url.startsWith(prefix)), `source ${s.id} points somewhere unchecked: ${s.url}`);
    assert(s.section.length >= 3 && s.claim.length >= 20 && s.title.length >= 10, `source ${s.id} is missing detail`);
  }
});

test('sources/there are no duplicate or unused sources: every source is cited by at least one level', () => {
  const cited = new Set(doc.levels.flatMap((l) => l.sourceIds));
  assertEqual(new Set(doc.sources.map((s) => s.id)).size, doc.sources.length, 'duplicate ids');
  for (const s of doc.sources) assert(cited.has(s.id), `source ${s.id} is never cited`);
});

test('sources/each level cites the source for the rule it teaches', () => {
  const byLevel = Object.fromEntries(doc.levels.map((l) => [l.id, l.sourceIds]));
  assert(byLevel.L1.includes('src-cidr') && byLevel.L1.includes('src-acl-syntax'), 'Level 1 teaches CIDR and the entry fields');
  assert(byLevel.L2.includes('src-acl-eval'), 'Level 2 teaches first match wins');
  assert(byLevel.L3.includes('src-acl-implicit') && byLevel.L3.includes('src-acl-syntax'), 'Level 3 teaches the implicit deny and protocols');
});

test('sources/the first-match, implicit-deny, and CIDR claims are each backed by a source that says so', () => {
  const claims = Object.fromEntries(doc.sources.map((s) => [s.id, s.claim.toLowerCase()]));
  assert(/first/.test(claims['src-acl-eval']) && /order/.test(claims['src-acl-eval']), 'first match and order');
  assert(/implicit deny/.test(claims['src-acl-implicit']), 'implicit deny');
  assert(/significant bits/.test(claims['src-cidr']) && /0 and 32/.test(claims['src-cidr']), 'CIDR prefix length');
});
