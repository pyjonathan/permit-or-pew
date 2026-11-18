import { test, assert, assertEqual } from './harness.js';
import * as S from '../engine/state.js';

// A deterministic document: 3 levels x 2 waves, every wave using the same 8 packets and the spec's
// formation rules (all dive paths are "drop" so a packet's x never changes while the tests aim).
//   ACL: 10 permit tcp any any eq 443 / 20 deny tcp any any eq 23 / 30 permit ip any any
//   Denied (shoot):  p2 (tcp 23), p4 (tcp 23), p7 (tcp 23)
//   Permitted (pass): p1, p3, p5, p6, p8
// Columns: p1 hides behind p6, p2 behind p7, p3 behind p8 (same x, rows 0 and 1). p4 and p5 are unblocked.
const PERM = [3, 0, 6, 2, 5, 1, 7, 4];
const DENIED = ['p2', 'p4', 'p7'];

function makeDoc(maxHealth = 3) {
  const base = [
    ['tcp', 443], ['tcp', 23], ['udp', 53], ['tcp', 23], ['tcp', 443], ['udp', 123], ['tcp', 23], ['icmp', undefined],
  ];
  const wave = (id) => {
    const packets = base.map(([protocol, port], i) => ({
      id: `p${i + 1}`, protocol, src: '1.1.1.1', dst: '2.2.2.2', ...(port ? { port } : {}), slot: i, diveAt: 0, path: 'drop',
    }));
    PERM.forEach((index, k) => (packets[index].diveAt = 480 + k * 100));
    return {
      id,
      acl: [
        { seq: 10, action: 'permit', protocol: 'tcp', src: 'any', dst: 'any', port: 443 },
        { seq: 20, action: 'deny', protocol: 'tcp', src: 'any', dst: 'any', port: 23 },
        { seq: 30, action: 'permit', protocol: 'ip', src: 'any', dst: 'any' },
      ],
      diveTicks: 300,
      packets,
      hints: ['Method hint.'],
    };
  };
  const level = (n) => ({
    id: `L${n}`, title: `Level ${n}`, outcome: `LO${n}`, briefing: 'b', sourceIds: ['s1'], waves: [wave(`${n}.1`), wave(`${n}.2`)],
  });
  return {
    schemaVersion: 1,
    maxHealth,
    playfield: { width: 700, height: 560 },
    sources: [{ id: 's1', title: 'T', url: 'u', section: 'S', claim: 'C' }],
    levels: [level(1), level(2), level(3)],
  };
}

const started = (doc = makeDoc()) => S.proceed(S.createSession(doc));
const advance = (s, ticks, move = 0) => S.act(s, { type: 'advance', ticks, move });
const packetOf = (s, id) => s.wave.packets.find((p) => p.id === id);
// Put the ship under a packet, fire, and let the bullet travel.
function shoot(s, id) {
  const aimed = structuredClone(s);
  aimed.wave.ship.x = packetOf(aimed, id).x;
  return advance(S.act(aimed, { type: 'fire' }), 70);
}
// Shoot the denied packets in the formation (lowest row first, so nothing blocks the bullet).
function shootAllDenied(s) {
  let r = advance(s, 120); // everyone has entered and is in formation
  const ids = [...DENIED].sort((a, b) => packetOf(r, b).y - packetOf(r, a).y);
  for (const id of ids) r = shoot(r, id);
  return r;
}
const perfectWave = (s) => advance(shootAllDenied(s), 2000);
const messages = (s) => s.waveMistakes.map((m) => `${m.packetId}:${m.kind}`);

test('state/a fresh session starts at the first briefing with nothing counted', () => {
  const s = S.createSession(makeDoc());
  assertEqual(s.view, 'briefing');
  assertEqual([s.health, s.maxHealth, s.mistakes['wrong-shot'], s.mistakes.leak, s.retries], [3, 3, 0, 0, 0]);
});

test('state/proceeding from the briefing starts wave 1.1 in the playing view', () => {
  const s = started();
  assertEqual([s.view, s.wave.waveId], ['playing', '1.1']);
});

test('state/shooting a denied packet is correct: health stays full, a confirmation naming entry 20, the game keeps playing', () => {
  const s = shoot(advance(started(), 120), 'p4');
  assertEqual(packetOf(s, 'p4').resolution, 'shot');
  assertEqual(s.health, 3);
  assertEqual(s.view, 'playing');
  assertEqual(s.feedback.kind, 'correct');
  assertEqual(s.feedback.matchedSeq, 20);
  assertEqual(s.waveStats.correct, 1);
  assertEqual(s.waveMistakes, []);
});

test('state/shooting a permitted packet: health -1, NO pause, a one-line message, and a full review entry', () => {
  const s = shoot(advance(started(), 120), 'p5');
  assertEqual(s.health, 2);
  assertEqual(s.view, 'playing');
  assertEqual(s.wave.frozen, false);
  assertEqual(s.mistakes['wrong-shot'], 1);
  assertEqual(s.feedback.kind, 'mistake');
  assert(/entry 10/i.test(s.feedback.message) && /permits/.test(s.feedback.message), s.feedback.message);
  assertEqual(messages(s), ['p5:wrong-shot']);
  const m = s.waveMistakes[0];
  assertEqual(m.matchedSeq, 10);
  assert(m.lines.length >= 2 && m.headline.length > 0 && m.advice.length > 0, 'full explanation is stored');
  assertEqual(m.sourceIds, ['s1']);
  // the at-a-glance facts for the results screen
  assertEqual([m.packetText, m.what, m.should, m.because], ['TCP 1.1.1.1 → 2.2.2.2:443', 'You shot it', 'let it through', 'Entry 10 permits it.']);
});

test('state/a correct decision gives back 1 health, and health never goes above the maximum', () => {
  let s = shoot(advance(started(), 120), 'p5'); // wrong shot: 3 -> 2
  assertEqual(s.health, 2);
  s = shoot(s, 'p4'); // denied packet shot: correct, 2 -> 3
  assertEqual(s.health, 3);
  s = shoot(s, 'p7'); // another correct shot at full health stays at 3
  assertEqual(s.health, 3);
});

test('state/the maximum comes from the content: with a maximum of 2, health starts at 2 and caps at 2', () => {
  let s = started(makeDoc(2));
  assertEqual([s.health, s.maxHealth], [2, 2]);
  s = shoot(advance(s, 120), 'p4');
  assertEqual(s.health, 2);
});

test('state/the clock keeps running after a mistake (the game never freezes for one)', () => {
  let s = shoot(advance(started(), 120), 'p5');
  const before = s.wave.tick;
  s = advance(s, 10);
  assertEqual(s.wave.tick, before + 10);
});

test('state/a denied packet reaching the network is a leak: health -1, game keeps going, entry 20 named', () => {
  let s = started();
  s = advance(s, 1300); // p2 dives at tick 980 and arrives at 1280
  assertEqual(packetOf(s, 'p2').resolution, 'passed');
  assertEqual(s.view, 'playing');
  assert(s.waveMistakes.some((m) => m.packetId === 'p2' && m.kind === 'leak' && m.matchedSeq === 20), JSON.stringify(messages(s)));
  const leak = s.waveMistakes.find((m) => m.packetId === 'p2');
  assertEqual([leak.what, leak.should, leak.because], ['It got through', 'shoot it', 'Entry 20 denies it.']);
});

test('state/a permitted packet reaching the network is delivered: correct, entry named', () => {
  let s = started();
  s = advance(s, 1000); // p1 dives at 580 and arrives at 880
  assertEqual(packetOf(s, 'p1').resolution, 'passed');
  assertEqual(packetOf(s, 'p1').judgement, 'correct');
  assert(!s.waveMistakes.some((m) => m.packetId === 'p1'));
});

test('state/doing nothing leaks every denied packet but the delivered permitted ones heal you, so the wave ends in a review', () => {
  // Dive order: p4 leak (3->2), p1 delivered (->3), p7 leak (->2), p3 (->3), p6 (3), p2 leak (->2), p8 (->3), p5 (3).
  const s = advance(started(), 2000);
  assertEqual(s.view, 'wave-summary');
  assertEqual(s.health, 3);
  assertEqual(s.mistakes.leak, 3);
  assertEqual(s.lastReview.map((m) => m.packetId).sort(), ['p2', 'p4', 'p7']);
  const w = s.completedWaves[0];
  assertEqual([w.waveId, w.correct, w.mistakes, w.retries, w.hints], ['1.1', 5, 3, 0, 0]);
});

test('state/a perfect wave ends in a clean review: 8 correct, 0 mistakes', () => {
  const s = perfectWave(started());
  assertEqual(s.view, 'wave-summary');
  const w = s.completedWaves[0];
  assertEqual([w.correct, w.mistakes, s.health], [8, 0, 3]);
  assertEqual(s.lastReview, []);
});

test('state/a bullet that hits nothing has no consequence', () => {
  let s = advance(started(), 120);
  s.wave.ship.x = 140; // between sprite columns
  s = advance(S.act(s, { type: 'fire' }), 70);
  assertEqual([s.health, s.feedback, s.waveMistakes.length], [3, null, 0]);
});

test('state/a resolved packet cannot cost health twice (second bullet behind the first)', () => {
  let s = advance(started(), 120);
  s.wave.ship.x = packetOf(s, 'p5').x; // p5 is permitted and unblocked
  s = S.act(s, { type: 'fire' });
  s = advance(s, 4);
  s = S.act(s, { type: 'fire' });
  s = advance(s, 80);
  assertEqual(s.mistakes['wrong-shot'], 1);
  assertEqual(s.health, 2);
});

test('state/pausing freezes time and resuming continues; inputs are ignored while paused', () => {
  let s = advance(started(), 10);
  s = S.togglePause(s);
  assertEqual(s.view, 'paused');
  assertEqual(advance(s, 50).wave.tick, 10);
  assertEqual(S.act(s, { type: 'fire' }).wave.bullets.length, 0);
  s = S.togglePause(s);
  assertEqual(s.view, 'playing');
  assertEqual(advance(s, 5).wave.tick, 15);
});

test('state/hints work only while paused, are recorded, and never resolve a packet', () => {
  let s = advance(started(), 20);
  assertEqual(S.requestHint(s).assistance.length, 0); // playing: ignored
  s = S.togglePause(s);
  const before = JSON.stringify(s.wave.packets);
  for (let i = 0; i < 4; i += 1) s = S.requestHint(s);
  assertEqual(s.assistance.map((a) => a.level), [1, 2, 3, 3]);
  assertEqual(JSON.stringify(s.wave.packets), before);
  assertEqual(s.waveStats.hints, 4);
});

test('state/hint 1 is the method; hints 2 and 3 are generated for the packet closest to the network', () => {
  let s = S.togglePause(advance(started(), 700)); // p4 (tcp 23, denied) dived first and is nearest the network
  s = S.requestHint(s);
  assertEqual(s.hint.text, 'Method hint.');
  s = S.requestHint(s);
  assert(s.hint.text.includes('23') && s.hint.text.includes('entry 10'), s.hint.text);
  s = S.requestHint(s);
  assert(s.hint.text.toLowerCase().includes('shoot it'), s.hint.text);
});

test('state/before any packet dives, hints refer to the next packet to dive', () => {
  let s = S.togglePause(advance(started(), 100));
  s = S.requestHint(S.requestHint(s));
  assert(s.hint.text.includes('TCP') && s.hint.text.includes(':23'), s.hint.text);
});

// Three wrong shots in the formation (before any packet dives, so nothing heals in between):
// p5, p6 and p8 are permitted and each has nothing in front of it.
const wrongShots = (s, ids) => ids.reduce((r, id) => shoot(r, id), advance(s, 120));

test('state/health reaching 0 fails the wave at once, even mid-wave, and shows the review of the attempt', () => {
  let s = wrongShots(started(), ['p5', 'p6']);
  assertEqual([s.health, s.view], [1, 'playing']); // not dead yet
  s = shoot(s, 'p8');
  assertEqual([s.health, s.view], [0, 'wave-failed']);
  assertEqual(s.wave.frozen, true);
  assertEqual(messages(s), ['p5:wrong-shot', 'p6:wrong-shot', 'p8:wrong-shot']);
  assertEqual(s.completedWaves.length, 0);
});

test('state/right decisions between wrong ones keep you alive: wrong, wrong, right, wrong does not fail', () => {
  let s = wrongShots(started(), ['p5', 'p6']); // health 1
  s = shoot(s, 'p4'); // a correct shot: health 2
  s = shoot(s, 'p8'); // wrong: health 1
  assertEqual([s.health, s.view], [1, 'playing']);
});

test('state/a mistake on the last packet that takes health to 0 still fails the wave', () => {
  // p5 is the last packet to dive (tick 1180, arrives at 1480). Resolve everything else first.
  let s = started();
  s = shootAllDenied(s);
  s = advance(s, 1400 - s.wave.tick); // all other packets have been let through or shot by now
  assertEqual(s.wave.packets.filter((p) => p.status !== 'resolved').map((p) => p.id), ['p5']);
  assertEqual(s.view, 'playing');
  s.health = 1; // arrive at the last packet on 1 health
  s = shoot(s, 'p5'); // p5 is permitted: shooting it is a mistake, and it is the last packet
  assertEqual(s.wave.complete, true);
  assertEqual(s.view, 'wave-failed');
  assertEqual(s.completedWaves.length, 0);
});

// Wave 1.1 doing nothing ends with 3 leaks and health 3. Then wave 1.2 is started on 2 health and failed
// with two wrong shots (2 -> 1 -> 0).
function failedSecondWave() {
  let s = advance(started(), 2000);
  assertEqual([s.view, s.health], ['wave-summary', 3]);
  s.health = 2; // pretend wave 1.1 ended on 2 health
  s = S.proceed(s); // start wave 1.2
  return wrongShots(s, ['p5', 'p6']);
}

test('state/retry restores health to the maximum (3), keeps mistakes, counts the retry, rebuilds the wave', () => {
  let s = failedSecondWave(); // the wave began on 2 health and was failed down to 0
  assertEqual([s.view, s.health], ['wave-failed', 0]);
  assertEqual([s.mistakes.leak, s.mistakes['wrong-shot']], [3, 2]);
  s = S.proceed(s); // Retry
  assertEqual([s.view, s.health, s.retries, s.wave.tick], ['playing', 3, 1, 0]); // full health on retry, not the 2 it began with
  assertEqual([s.mistakes.leak, s.mistakes['wrong-shot']], [3, 2]); // mistakes from the failed attempt stay counted
  assertEqual(s.waveMistakes, []);
  assertEqual(s.completedWaves.map((w) => w.waveId), ['1.1']);
});

test('state/health carries from the first wave of a level into the second', () => {
  let s = advance(started(), 2000);
  assertEqual(s.view, 'wave-summary');
  s.health = 2;
  s = S.proceed(s); // start wave 1.2 in the same level
  assertEqual([s.waveIndex, s.health], [1, 2]);
});

test('state/health goes back to 3 at the start of each new level', () => {
  let s = started();
  for (let wave = 0; wave < 2; wave += 1) {
    s = advance(s, 2000);
    s = S.proceed(s);
  }
  assertEqual(s.view, 'level-summary');
  s.health = 1; // finish level 1 badly hurt
  s = S.proceed(s); // on to the level 2 briefing
  assertEqual([s.view, s.levelIndex, s.health], ['briefing', 1, 3]);
  s = S.proceed(s);
  assertEqual([s.waveIndex, s.health], [0, 3]);
});

test('state/finishing the retried wave records the retry and keeps the failed attempt\'s mistakes in its counts', () => {
  let s = S.proceed(failedSecondWave()); // retry
  s = perfectWave(s);
  assertEqual(s.view, 'wave-summary');
  const w = s.completedWaves[1];
  assertEqual([w.waveId, w.retries, w.mistakes, w.correct], ['1.2', 1, 2, 8]);
});

test('state/both waves lead to a level summary, then the next briefing, and six waves to the session summary', () => {
  let s = started();
  for (let level = 0; level < 3; level += 1) {
    for (let wave = 0; wave < 2; wave += 1) {
      s = advance(s, 2000);
      assertEqual(s.view, 'wave-summary');
      s = S.proceed(s);
    }
    assertEqual(s.view, 'level-summary');
    s = S.proceed(s);
    if (level < 2) {
      assertEqual([s.view, s.levelIndex, s.waveIndex], ['briefing', level + 1, 0]);
      s = S.proceed(s);
    }
  }
  assertEqual(s.view, 'session-summary');
  assertEqual(s.completedWaves.length, 6);
});

test('state/restart then cancel changes nothing', () => {
  let s = advance(started(), 30);
  const before = JSON.stringify({ ...s, confirmingRestart: false });
  s = S.cancelRestart(S.requestRestart(s));
  assertEqual(JSON.stringify(s), before);
});

test('state/the game does not advance while the restart confirmation is open', () => {
  let s = S.requestRestart(started());
  assertEqual(advance(s, 30), s);
  s = S.cancelRestart(s);
  assertEqual(advance(s, 30).wave.tick, 30);
});

test('state/restart then confirm returns a fresh session at the first briefing', () => {
  let s = shoot(advance(started(), 120), 'p5');
  s = S.confirmRestart(S.requestRestart(s));
  assertEqual([s.view, s.health, s.levelIndex, s.waveIndex, s.retries, s.assistance.length, s.waveMistakes.length], ['briefing', 3, 0, 0, 0, 0, 0]);
  assertEqual(s.confirmingRestart, false);
});

test('state/speed can be set to step, slow, or normal only; the default is normal', () => {
  let s = S.createSession(makeDoc());
  assertEqual(s.speed, 'normal');
  s = S.setSpeed(s, 'step');
  assertEqual(s.speed, 'step');
  assertEqual(S.setSpeed(s, 'warp').speed, 'step');
});

test('state/session functions do not mutate the session they are given', () => {
  const s = advance(started(), 100);
  const before = JSON.stringify(s);
  advance(s, 50);
  S.togglePause(s);
  S.requestRestart(s);
  S.act(s, { type: 'fire' });
  assertEqual(JSON.stringify(s), before);
});

test('state/hop and fire are instant inputs that work in step mode without advancing time', () => {
  let s = started();
  s = S.act(s, { type: 'hop', dir: 1 });
  s = S.act(s, { type: 'fire' });
  assertEqual([s.wave.ship.x, s.wave.bullets.length, s.wave.tick], [400, 1, 0]);
});

// ---- sounds: the moments the UI turns into sound ---------------------------------------------------------
// Each call reports the sound moments it caused in session.sounds; the next call starts again from nothing.

test('state/firing reports a fire sound, then nothing on the next call', () => {
  let s = advance(started(), 120);
  s = S.act(s, { type: 'fire' });
  assertEqual(s.sounds, ['fire']);
  assertEqual(advance(s, 1).sounds, []); // stale sounds are not repeated
});

test('state/a correct hit, a wrong hit, a delivered packet, and a leak each report their own sound', () => {
  const hit = shoot(advance(started(), 120), 'p4'); // denied packet shot: correct
  assert(hit.sounds.includes('hit-correct') && !hit.sounds.includes('hit-wrong'), JSON.stringify(hit.sounds));
  const wrong = shoot(advance(started(), 120), 'p5'); // permitted packet shot: wrong
  assert(wrong.sounds.includes('hit-wrong') && !wrong.sounds.includes('hit-correct'), JSON.stringify(wrong.sounds));
  // delivered: advance to just after p1 (permitted) arrives at tick 880
  const delivered = advance(advance(started(), 879), 1);
  assertEqual(delivered.sounds, ['delivered']);
  // leak: p4 (denied) arrives at tick 780
  const leak = advance(advance(started(), 779), 1);
  assertEqual(leak.sounds, ['leak']);
});

test('state/clearing a wave reports the cleared jingle; failing one reports the failed jingle', () => {
  const cleared = perfectWave(started());
  assertEqual(cleared.view, 'wave-summary');
  // the jingle is reported by the call that ended the wave: replay up to the last tick
  let s = advance(shootAllDenied(started()), 1);
  let last = s;
  while (s.view === 'playing') { last = s; s = advance(s, 1); }
  assert(s.sounds.includes('wave-cleared'), JSON.stringify(s.sounds));
  const failedRun = wrongShots(started(), ['p5', 'p6']);
  const dead = shoot(failedRun, 'p8');
  assertEqual(dead.view, 'wave-failed');
  assert(dead.sounds.includes('wave-failed') && dead.sounds.includes('hit-wrong'), JSON.stringify(dead.sounds));
});

test('state/starting, retrying, pausing, resuming, and asking for a hint each report a sound', () => {
  assertEqual(S.proceed(S.createSession(makeDoc())).sounds, ['wave-start']);
  const playing = started();
  const paused = S.togglePause(playing);
  assertEqual(paused.sounds, ['pause']);
  assertEqual(S.togglePause(paused).sounds, ['resume']);
  assertEqual(S.requestHint(paused).sounds, ['hint']);
  assert(S.requestHint(playing) === playing, 'a hint while playing is ignored: the very same session comes back, so it caused no sound');
  const dead = shoot(wrongShots(started(), ['p5', 'p6']), 'p8');
  assertEqual(S.proceed(dead).sounds, ['wave-start']); // retry
});

test('state/screens and settings that make no sound report none', () => {
  assertEqual(S.createSession(makeDoc()).sounds, []);
  assertEqual(S.setSpeed(started(), 'step').sounds, []);
  assertEqual(S.requestRestart(started()).sounds, []);
  assertEqual(S.cancelRestart(S.requestRestart(started())).sounds, []);
  const summary = perfectWave(started());
  assertEqual(S.proceed(S.proceed(summary)).sounds.filter((n) => n !== 'wave-start'), []);
});

test('state/every reported sound is one the sound data knows', async () => {
  const { SOUND_NAMES } = await import('../ui/sounds.js');
  const names = new Set([
    ...S.act(advance(started(), 120), { type: 'fire' }).sounds,
    ...shoot(advance(started(), 120), 'p4').sounds,
    ...shoot(advance(started(), 120), 'p5').sounds,
    ...S.togglePause(started()).sounds,
    ...S.proceed(S.createSession(makeDoc())).sounds,
  ]);
  for (const n of names) assert(SOUND_NAMES.includes(n), n);
});
