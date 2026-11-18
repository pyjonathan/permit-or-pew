import { test, assert, assertEqual } from './harness.js';
import { FIELD, slotPosition, packetPosition, createWave, tick } from '../engine/loop.js';

const PATHS = ['drop', 'sway', 'swoop-in', 'zigzag'];
const PERM = [3, 0, 6, 2, 5, 1, 7, 4];

// An 8-packet wave built by the spec's formation rules (ACL content does not matter to the loop).
function makeWave({ diveStart = 480, diveEvery = 100, diveTicks = 300 } = {}) {
  const packets = [];
  for (let i = 0; i < 8; i += 1) {
    packets.push({ id: `p${i + 1}`, protocol: 'tcp', src: '10.0.0.1', dst: '10.0.0.2', port: 80, slot: i, diveAt: 0, path: 'drop' });
  }
  PERM.forEach((index, k) => {
    packets[index].diveAt = diveStart + k * diveEvery;
    packets[index].path = PATHS[k % 4];
  });
  return { id: 't', acl: [], packets, diveTicks, hints: ['h'] };
}
const adv = (state, ticks = 1, move = 0) => tick(state, { type: 'advance', ticks, move });
const at = (s, id) => s.packets.find((p) => p.id === id);

function run(state, inputs) {
  let s = state;
  const events = [];
  for (const input of inputs) {
    const r = tick(s, input);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

test('loop/field constants match the spec', () => {
  assertEqual([FIELD.w, FIELD.h, FIELD.edgeY, FIELD.shipY], [700, 560, 540, 500]);
  assertEqual([FIELD.shipSpeed, FIELD.bulletSpeed, FIELD.maxBullets, FIELD.hop, FIELD.stepTicks], [5, 9, 2, 50, 15]);
});

test('loop/formation slots: column = i mod 5 at x 70 + 140c, row = i div 5 at y 70 + 60r', () => {
  assertEqual(slotPosition(0), { x: 70, y: 70 });
  assertEqual(slotPosition(4), { x: 630, y: 70 });
  assertEqual(slotPosition(5), { x: 70, y: 130 });
  assertEqual(slotPosition(7), { x: 350, y: 130 });
});

test('loop/a new wave starts at tick 0 with the ship centred, no bullets, and packet 1 entering', () => {
  const s = createWave(makeWave());
  assertEqual([s.tick, s.ship.x, s.bullets.length, s.complete, s.frozen], [0, 350, 0, false, false]);
  assertEqual(at(s, 'p1').status, 'entering');
  assertEqual(at(s, 'p2').status, 'pending');
});

test('loop/packet i starts entering at tick 10i and is in its slot 40 ticks later', () => {
  let s = createWave(makeWave());
  s = adv(s, 9).state;
  assertEqual(at(s, 'p2').status, 'pending');
  s = adv(s, 1).state; // tick 10
  assertEqual(at(s, 'p2').status, 'entering');
  s = adv(s, 40).state; // tick 50
  assertEqual(at(s, 'p2').status, 'formation');
  assertEqual(at(s, 'p2').x, 210);
  assert(Math.abs(at(s, 'p2').y - 70) <= 3, 'formation sits at the slot, with a small bob');
});

test('loop/every packet is in formation, readable, before the first dive', () => {
  const s = adv(createWave(makeWave()), 479).state;
  assert(s.packets.every((p) => p.status === 'formation'), JSON.stringify(s.packets.map((p) => p.status)));
});

test('loop/packets dive in the authored order and are let through at diveAt + diveTicks', () => {
  const wave = makeWave();
  let s = createWave(wave);
  const first = wave.packets.find((p) => p.diveAt === 480);
  s = adv(s, 480).state;
  assertEqual(at(s, first.id).status, 'diving');
  s = adv(s, 299).state; // tick 779: one step before arriving
  assertEqual(at(s, first.id).status, 'diving');
  const r = adv(s, 1); // tick 780
  assertEqual(at(r.state, first.id).status, 'resolved');
  assertEqual(at(r.state, first.id).resolution, 'passed');
  assertEqual(r.events.filter((e) => e.type === 'resolved'), [{ type: 'resolved', packetId: first.id, action: 'passed' }]);
});

test('loop/dive paths: drop is straight; the others move sideways; all stay on screen', () => {
  const w = { diveTicks: 300 };
  const base = { slot: 1, diveAt: 100, index: 1 };
  const drop = packetPosition({ ...base, path: 'drop' }, 250, w.diveTicks);
  assertEqual(drop.x, 210);
  for (const path of ['sway', 'swoop-in', 'zigzag']) {
    const xs = [];
    for (let t = 100; t < 400; t += 7) xs.push(packetPosition({ ...base, path }, t, w.diveTicks).x);
    assert(Math.max(...xs) - Math.min(...xs) > 20, `${path} should move sideways`);
    assert(xs.every((x) => x >= 59 && x <= 641), `${path} must stay on screen`);
  }
  const end = packetPosition({ ...base, path: 'sway' }, 399, w.diveTicks);
  assert(end.y > 500 && end.y <= FIELD.edgeY, `a diving packet nears the edge: ${end.y}`);
});

test('loop/the ship moves 5 units per tick, held, and stays inside 30..670', () => {
  let s = createWave(makeWave());
  s = adv(s, 10, 1).state;
  assertEqual(s.ship.x, 400);
  s = adv(s, 200, 1).state;
  assertEqual(s.ship.x, 670);
  s = adv(s, 400, -1).state;
  assertEqual(s.ship.x, 30);
});

test('loop/hop moves the ship 50 units immediately without advancing time', () => {
  let s = createWave(makeWave());
  s = tick(s, { type: 'hop', dir: 1 }).state;
  assertEqual([s.ship.x, s.tick], [400, 0]);
  s = tick(s, { type: 'hop', dir: -1 }).state;
  s = tick(s, { type: 'hop', dir: -1 }).state;
  assertEqual(s.ship.x, 300);
  for (let i = 0; i < 10; i += 1) s = tick(s, { type: 'hop', dir: -1 }).state;
  assertEqual(s.ship.x, 30);
});

test('loop/firing reports a "fired" event, and reports nothing when the 2-bullet cap blocks the shot', () => {
  let s = createWave(makeWave());
  const first = tick(s, { type: 'fire' });
  assertEqual(first.events, [{ type: 'fired' }]);
  s = tick(first.state, { type: 'fire' }).state;
  const third = tick(s, { type: 'fire' });
  assertEqual(third.events, []);
  assertEqual(third.state.bullets.length, 2);
});

test('loop/fire makes a bullet at the ship; at most 2 may be in flight', () => {
  let s = createWave(makeWave());
  s = tick(s, { type: 'fire' }).state;
  assertEqual(s.bullets, [{ id: 1, x: 350, y: 480 }]);
  s = tick(s, { type: 'fire' }).state;
  s = tick(s, { type: 'fire' }).state;
  assertEqual(s.bullets.length, 2);
  assertEqual(s.tick, 0);
});

test('loop/a bullet rises 9 units per tick and is removed after it leaves the top, with no consequence', () => {
  let s = createWave(makeWave());
  s.ship.x = 140; // a gap between sprite columns (sprites span 11-129, 151-269, ...)
  const r = run(s, [{ type: 'fire' }, { type: 'advance', ticks: 1, move: 0 }]);
  assertEqual(r.state.bullets[0].y, 471);
  const done = adv(r.state, 60);
  assertEqual(done.state.bullets, []);
  assertEqual(done.events, []);
});

test('loop/a bullet that meets a packet in the formation resolves it as shot, once', () => {
  let s = createWave(makeWave());
  s = adv(s, 60).state; // everyone entered; packet 3 is in slot 2 at x = 350
  s.ship.x = 350;
  s = tick(s, { type: 'fire' }).state;
  const r = adv(s, 60);
  const shot = r.events.filter((e) => e.type === 'resolved');
  assertEqual(shot.length, 1);
  assertEqual(shot[0].action, 'shot');
  assert(['p3', 'p8'].includes(shot[0].packetId), `a packet in column x=350 is hit: ${shot[0].packetId}`);
  assertEqual(r.state.bullets.length, 0);
  assertEqual(at(r.state, shot[0].packetId).resolution, 'shot');
});

test('loop/the bullet hits the packet nearest the ship first when two packets share a column', () => {
  let s = createWave(makeWave());
  s = adv(s, 60).state;
  s.ship.x = 350; // slot 2 (y 70) and slot 7 (y 130) are both at x = 350
  s = tick(s, { type: 'fire' }).state;
  const r = adv(s, 60);
  assertEqual(r.events.find((e) => e.type === 'resolved').packetId, 'p8');
});

test('loop/when two sprites overlap at the bullet, the lower one (nearest the ship) is hit', () => {
  // p3 (slot 2, top of column x=350) dives early straight down and crosses p8 (slot 7, still in the
  // formation below it). Fired from the start of p3's dive, the bullet first touches both at once.
  // Timing chosen so that on the tick the bullet first touches anything, both sprites are within reach
  // and the diving p3 (y about 137) is lower than the formation p8 (y about 133).
  const wave = makeWave();
  wave.packets[2].diveAt = 113;
  wave.packets[2].path = 'drop';
  let s = adv(createWave(wave), 120).state;
  s.ship.x = 350;
  s = tick(s, { type: 'fire' }).state;
  let first = null;
  for (let i = 0; i < 80 && !first; i += 1) {
    const bulletY = s.bullets[0].y - FIELD.bulletSpeed; // where the bullet is on the coming tick
    const r = adv(s, 1);
    s = r.state;
    first = r.events.find((e) => e.type === 'resolved') ?? null;
    if (first) {
      const reach = (id) => Math.abs(bulletY - at(s, id).y) <= FIELD.spriteH / 2;
      assert(reach('p3') && reach('p8'), 'the scenario really has both sprites within reach of the bullet');
      assert(at(s, 'p3').y > at(s, 'p8').y, 'the diving packet is the lower one');
    }
  }
  assertEqual(first.packetId, 'p3');
});

test('loop/two bullets cannot resolve the same packet twice', () => {
  let s = createWave(makeWave());
  s = adv(s, 60).state;
  s.ship.x = 350;
  s = tick(s, { type: 'fire' }).state;
  s = adv(s, 4).state;
  s = tick(s, { type: 'fire' }).state; // a second bullet behind the first
  const r = adv(s, 80);
  const resolvedIds = r.events.filter((e) => e.type === 'resolved').map((e) => e.packetId);
  assertEqual(new Set(resolvedIds).size, resolvedIds.length, 'no packet resolved twice');
  assertEqual(resolvedIds.length, 2);
});

test('loop/a shot packet is never let through later', () => {
  let s = createWave(makeWave());
  s = adv(s, 60).state;
  s.ship.x = 350;
  s = tick(s, { type: 'fire' }).state;
  s = adv(s, 60).state;
  const shotId = s.packets.find((p) => p.resolution === 'shot').id;
  const rest = adv(s, 1800);
  assertEqual(rest.events.filter((e) => e.packetId === shotId), []);
});

test('loop/a wave completes exactly once, when every packet is resolved', () => {
  const r = adv(createWave(makeWave()), 2000);
  assertEqual(r.events.filter((e) => e.type === 'resolved').length, 8);
  assertEqual(r.events.filter((e) => e.type === 'wave-complete').length, 1);
  assertEqual(r.state.complete, true);
  assertEqual(adv(r.state, 10).events, []);
});

test('loop/the wave is not complete while any packet is still in play', () => {
  const s = adv(createWave(makeWave()), 700).state;
  assertEqual(s.complete, false);
});

test('loop/a frozen wave ignores every input and returns the same state', () => {
  const s = createWave(makeWave());
  s.frozen = true;
  for (const input of [{ type: 'advance', ticks: 5, move: 1 }, { type: 'fire' }, { type: 'hop', dir: 1 }]) {
    const r = tick(s, input);
    assertEqual(r.events, []);
    assertEqual(r.state, s);
  }
});

test('loop/null and unknown inputs are ignored', () => {
  const s = createWave(makeWave());
  assertEqual(tick(s, null).state, s);
  assertEqual(tick(s, { type: 'nope' }).state, s);
});

test('loop/tick does not mutate the state it is given', () => {
  const s = createWave(makeWave());
  const before = JSON.stringify(s);
  tick(s, { type: 'advance', ticks: 30, move: 1 });
  tick(s, { type: 'fire' });
  tick(s, { type: 'hop', dir: 1 });
  assertEqual(JSON.stringify(s), before);
});

test('loop/determinism: the same wave and inputs give identical events and state', () => {
  const inputs = [
    { type: 'advance', ticks: 60, move: 0 }, { type: 'hop', dir: 1 }, { type: 'fire' },
    { type: 'advance', ticks: 100, move: -1 }, { type: 'fire' }, { type: 'advance', ticks: 1800, move: 1 },
  ];
  const wave = makeWave();
  assertEqual(run(createWave(wave), inputs), run(createWave(wave), inputs));
});

test('loop/advancing many ticks at once equals advancing one tick at a time', () => {
  const wave = makeWave();
  const many = adv(createWave(wave), 900, 1);
  let s = createWave(wave);
  const events = [];
  for (let i = 0; i < 900; i += 1) {
    const r = adv(s, 1, 1);
    s = r.state;
    events.push(...r.events);
  }
  assertEqual(s, many.state);
  assertEqual(events, many.events);
});
