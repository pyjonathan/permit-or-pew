import { test, assert, assertEqual } from './harness.js';
import * as S from '../engine/state.js';
import { resultsHtml } from '../ui/results.js';

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Same small document as the state tests: p2, p4, p7 are denied (tcp 23); the rest are permitted.
const PERM = [3, 0, 6, 2, 5, 1, 7, 4];
function makeDoc() {
  const base = [['tcp', 443], ['tcp', 23], ['udp', 53], ['tcp', 23], ['tcp', 443], ['udp', 123], ['tcp', 23], ['icmp', undefined]];
  const packets = base.map(([protocol, port], i) => ({
    id: `p${i + 1}`, protocol, src: '1.1.1.1', dst: '2.2.2.2', ...(port ? { port } : {}), slot: i, diveAt: 0, path: 'drop',
  }));
  PERM.forEach((index, k) => (packets[index].diveAt = 480 + k * 100));
  const wave = (id) => ({
    id,
    acl: [
      { seq: 10, action: 'permit', protocol: 'tcp', src: 'any', dst: 'any', port: 443 },
      { seq: 20, action: 'deny', protocol: 'tcp', src: 'any', dst: 'any', port: 23 },
      { seq: 30, action: 'permit', protocol: 'ip', src: 'any', dst: 'any' },
    ],
    diveTicks: 300,
    packets: structuredClone(packets),
    hints: ['h'],
  });
  const level = (n) => ({ id: `L${n}`, title: `Level ${n}`, outcome: 'LO1', briefing: 'b', sourceIds: ['s1'], waves: [wave(`${n}.1`), wave(`${n}.2`)] });
  return {
    schemaVersion: 1, maxHealth: 3, playfield: { width: 700, height: 560 },
    sources: [{ id: 's1', title: 'Cisco ACL guide', url: 'https://example.invalid/acl', section: 'Section 4', claim: 'First match wins.' }],
    levels: [level(1), level(2), level(3)],
  };
}
const started = () => S.proceed(S.createSession(makeDoc()));
const advance = (s, ticks) => S.act(s, { type: 'advance', ticks, move: 0 });
const packetOf = (s, id) => s.wave.packets.find((p) => p.id === id);
function shoot(s, id) {
  const aimed = structuredClone(s);
  aimed.wave.ship.x = packetOf(aimed, id).x;
  return advance(S.act(aimed, { type: 'fire' }), 70);
}
const wrongShots = (s, ids) => ids.reduce((r, id) => shoot(r, id), advance(s, 120));

// A wave cleared with 3 leaks (doing nothing), and a wave failed by 3 wrong shots.
const clearedWithMistakes = () => advance(started(), 2000);
const failed = () => wrongShots(started(), ['p5', 'p6', 'p8']);
// A perfect wave: shoot every denied packet, let the rest through.
function perfect() {
  let r = advance(started(), 120);
  for (const id of ['p7', 'p2', 'p4']) r = shoot(r, id);
  return advance(r, 2000);
}

test('results/a cleared wave shows a PASS banner: the word cleared, a check mark, and the pass style', () => {
  const s = clearedWithMistakes();
  assertEqual(s.view, 'wave-summary');
  const html = resultsHtml(s, esc);
  assert(/class="banner pass"/.test(html), 'pass banner');
  assert(/<h2 tabindex="-1">Wave 1\.1 cleared<\/h2>/.test(html), 'title says cleared');
  assert(/✓/.test(html) && !/class="banner fail"/.test(html), 'check mark, not the fail style');
});

test('results/a failed wave shows a FAIL banner: the word failed, a cross, and the fail style', () => {
  const s = failed();
  assertEqual(s.view, 'wave-failed');
  const html = resultsHtml(s, esc);
  assert(/class="banner fail"/.test(html), 'fail banner');
  assert(/<h2 tabindex="-1">Wave 1\.1 failed<\/h2>/.test(html), 'title says failed');
  assert(/✗/.test(html) && !/class="banner pass"/.test(html), 'cross, not the pass style');
});

test('results/pass and fail screens differ in their words, icon, and style (never colour alone)', () => {
  const pass = resultsHtml(clearedWithMistakes(), esc);
  const fail = resultsHtml(failed(), esc);
  assert(/cleared/.test(pass) && !/cleared/.test(fail), 'words differ');
  assert(/banner-icon" aria-hidden="true">✓/.test(pass) && /banner-icon" aria-hidden="true">✗/.test(fail), 'icons differ');
  assert(/Next wave/.test(pass) && /Retry this wave/.test(fail), 'the button says what happens next');
});

test('results/a cleared wave with mistakes is never called a clean run (constitution C3)', () => {
  const html = resultsHtml(clearedWithMistakes(), esc);
  assert(/not a clean run: 3 mistakes/.test(html), html.slice(0, 600));
});

test('results/a perfect wave says so and has nothing in the went-wrong list', () => {
  const html = resultsHtml(perfect(), esc);
  assert(/No mistakes\. A clean run\./.test(html), 'clean run');
  assert(/Nothing went wrong on this wave/.test(html) && !/class="wrong"/.test(html), 'empty list');
});

test('results/each mistake is one line: the packet, what you did, what you should have done, and why', () => {
  const html = resultsHtml(failed(), esc);
  assertEqual((html.match(/<details class="miss"/g) ?? []).length, 3);
  assert(/class="pk">TCP 1\.1\.1\.1 → 2\.2\.2\.2:443<\/code>/.test(html), 'packet');
  assert(/You shot it/.test(html), 'what you did');
  assert(/Should have: <strong>let it through<\/strong>/.test(html), 'what you should have done');
  assert(/Entry 10 permits it\./.test(html), 'the deciding entry');
});

test('results/a leak line says it got through and that it should have been shot', () => {
  const html = resultsHtml(clearedWithMistakes(), esc);
  assert(/It got through/.test(html) && /Should have: <strong>shoot it<\/strong>/.test(html) && /Entry 20 denies it\./.test(html), html.slice(0, 800));
});

test('results/the full explanation is inside each line, collapsed until the player opens it', () => {
  const html = resultsHtml(failed(), esc);
  assert(!/<details class="miss" open/.test(html), 'collapsed by default');
  assert(/<div class="why">/.test(html) && /first match/.test(html), 'full explanation present');
  assert(/should have been let through/i.test(html), 'next step present');
});

test('results/the sources are one collapsed section the player can open for further reading', () => {
  const html = resultsHtml(failed(), esc);
  assertEqual((html.match(/<details class="sources">/g) ?? []).length, 1);
  assert(!/<details class="sources" open/.test(html), 'collapsed by default');
  assert(/Cisco ACL guide, Section 4/.test(html) && /https:\/\/example\.invalid\/acl/.test(html) && /First match wins\./.test(html), 'title, section, URL, claim');
});

test('results/stat tiles show the numbers and health with hearts', () => {
  const html = resultsHtml(failed(), esc);
  assert(/Health<\/span><span class="num">♡♡♡ 0 of 3/.test(html), 'health at 0 shows empty hearts');
  assert(/Mistakes this attempt<\/span><span class="num">3<\/span>/.test(html), 'mistake count');
  const ok = resultsHtml(perfect(), esc);
  assert(/Right<\/span><span class="num">8 of 8/.test(ok), 'right count');
  assert(/♥♥♥ 3 of 3/.test(ok), 'full health shows full hearts');
});

test('results/level and final screens also use a banner, and the final one offers Play again', () => {
  let s = started();
  for (let i = 0; i < 2; i += 1) s = S.proceed(advance(s, 2000));
  assertEqual(s.view, 'level-summary');
  assert(/class="banner pass"/.test(resultsHtml(s, esc)) && /Level 1 cleared/.test(resultsHtml(s, esc)), 'level banner');
  for (let level = 0; level < 3; level += 1) {
    if (level > 0) {
      s = S.proceed(s); // briefing -> wave
      for (let i = 0; i < 2; i += 1) s = S.proceed(advance(s, 2000));
    }
    s = S.proceed(s); // level summary -> next level / final
  }
  assertEqual(s.view, 'session-summary');
  const html = resultsHtml(s, esc);
  assert(/All waves cleared/.test(html) && /Play again/.test(html) && /data-action="restart"/.test(html), 'final banner');
  assert(/not proof/.test(html), 'mastery statement');
});

test('results/text from the data cannot inject HTML', () => {
  const doc = makeDoc();
  doc.sources[0].title = '<img src=x onerror=alert(1)>';
  let s = S.proceed(S.createSession(doc));
  s = wrongShots(s, ['p5', 'p6', 'p8']);
  const html = resultsHtml(s, esc);
  assert(!/<img/.test(html) && /&lt;img/.test(html), 'escaped');
});

// ---- the access list on the results page: the rules the mistakes refer to -------------------------------

const aclRows = (html) => [...html.matchAll(/<li data-seq="([^"]+)"[^>]*>(.*?)<\/li>/gs)].map((m) => ({ seq: m[1], body: m[2] }));

test('results/the wave\'s access list is shown on a cleared wave and on a failed wave: every entry, in order, plus the implicit deny', () => {
  for (const html of [resultsHtml(clearedWithMistakes(), esc), resultsHtml(failed(), esc)]) {
    assert(/<section class="aclbox"/.test(html) && /The access list/.test(html), 'panel present');
    const rows = aclRows(html);
    assertEqual(rows.map((r) => r.seq), ['10', '20', '30', 'implicit']);
    assert(rows[0].body.includes('10 permit tcp any any eq 443'), rows[0].body);
    assert(rows[1].body.includes('20 deny tcp any any eq 23'), rows[1].body);
    assert(rows[2].body.includes('30 permit ip any any'), rows[2].body);
    assert(/implicit deny/.test(rows[3].body), rows[3].body);
  }
});

test('results/entries that caused mistakes are marked with a cross and how many mistakes they caused', () => {
  const rows = aclRows(resultsHtml(failed(), esc)); // p5 -> entry 10; p6 and p8 -> entry 30
  const by = Object.fromEntries(rows.map((r) => [r.seq, r.body]));
  assert(/✗ caused 1 mistake</.test(by['10']), by['10']);
  assert(/✗ caused 2 mistakes</.test(by['30']), by['30']);
  assert(!/caused/.test(by['20']) && !/caused/.test(by.implicit), 'unrelated entries are not marked');
});

test('results/an entry that caused no mistakes has no mark, even though it is listed', () => {
  const rows = aclRows(resultsHtml(perfect(), esc));
  assertEqual(rows.length, 4);
  assert(rows.every((r) => !/caused/.test(r.body)), 'no marks on a perfect wave');
});

test('results/the implicit deny row is marked when no entry matched', () => {
  const doc = makeDoc();
  for (const l of doc.levels) for (const w of l.waves) w.acl = w.acl.filter((e) => e.seq !== 30); // no catch-all
  let s = S.proceed(S.createSession(doc));
  s = advance(s, 2000); // do nothing: denied and implicitly-denied packets leak
  assertEqual(s.view, 'wave-failed');
  const by = Object.fromEntries(aclRows(resultsHtml(s, esc)).map((r) => [r.seq, r.body]));
  assert(/✗ caused 2 mistakes</.test(by.implicit), by.implicit);
  assert(/✗ caused 2 mistakes</.test(by['20']), by['20']);
});

test('results/each mistake line shows the text of the entry that decided it, and is tied to that entry', () => {
  const html = resultsHtml(failed(), esc);
  assert(/<details class="miss" data-seq="10">/.test(html) && /<details class="miss" data-seq="30">/.test(html), 'data-seq on each line');
  assert(/class="entry">10 permit tcp any any eq 443<\/code>/.test(html), 'entry 10 text on its line');
  assert(/class="entry">30 permit ip any any<\/code>/.test(html), 'entry 30 text on its line');
});

test('results/an implicit-deny mistake line says so and is tied to the implicit row', () => {
  const doc = makeDoc();
  for (const l of doc.levels) for (const w of l.waves) w.acl = w.acl.filter((e) => e.seq !== 30);
  let s = S.proceed(S.createSession(doc));
  s = advance(s, 2000);
  const html = resultsHtml(s, esc);
  assert(/<details class="miss" data-seq="implicit">/.test(html) && /class="entry">implicit deny \(no entry matched\)<\/code>/.test(html), html.slice(0, 400));
});

test('results/the access list is not shown on the level and final screens (there is no rule to refer to)', () => {
  let s = started();
  for (let i = 0; i < 2; i += 1) s = S.proceed(advance(s, 2000));
  assertEqual(s.view, 'level-summary');
  assert(!/aclbox/.test(resultsHtml(s, esc)), 'no list on the level screen');
});

test('results/entry text from the data cannot inject HTML', () => {
  const doc = makeDoc();
  for (const l of doc.levels) for (const w of l.waves) w.acl[0].protocol = '<b>x</b>';
  let s = S.proceed(S.createSession(doc));
  s = advance(s, 2000);
  assert(!/<b>x<\/b>/.test(resultsHtml(s, esc)), 'escaped');
});

test('results/views that are not results screens give no HTML', () => {
  assertEqual(resultsHtml(started(), esc), '');
});

// ---- the sources are real links the player can open to read further ----------------------------------------

test('results/each source is a link that opens in a new tab safely, and shows its section and the claim it supports', () => {
  const html = resultsHtml(failed(), esc);
  assert(/<a href="https:\/\/example\.invalid\/acl" target="_blank" rel="noopener noreferrer"/.test(html), 'a link with noopener');
  assert(/Cisco ACL guide, Section 4/.test(html) && /First match wins\./.test(html), 'title, section, claim');
  assert(/aria-label="Open Cisco ACL guide, Section 4 \(opens in a new tab\)"/.test(html), 'the link says what it opens and that it opens a new tab');
});

test('results/an address that is not https is shown as text, never as a link', () => {
  const doc = makeDoc();
  doc.sources[0].url = 'javascript:alert(1)';
  const html = resultsHtml(wrongShots(S.proceed(S.createSession(doc)), ['p5', 'p6', 'p8']), esc);
  assert(!/href="javascript:/.test(html) && !/<a href/.test(html.split('class="sources"')[1] ?? ''), 'no link made');
  assert(/javascript:alert\(1\)/.test(html), 'still shown as plain text');
});
