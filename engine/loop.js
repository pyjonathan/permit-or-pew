// Pure game loop for the Galaga-style playfield. Time is an integer tick count; there are no timers,
// DOM, or randomness here. The only code that uses a clock is ui/clock.js, which calls tick() with
// { type: "advance" } at the chosen pace. Everything is a function of the tick number, so a wave
// replays identically.
//
// Playfield: 700 x 560 abstract units. Packets enter, hold in a formation, then dive to the network
// edge (y = 540) one at a time. The ship moves along y = 500 and fires bullets that travel up.

export const FIELD = {
  w: 700,
  h: 560,
  edgeY: 540,
  shipY: 500,
  shipMinX: 30,
  shipMaxX: 670,
  shipStartX: 350,
  shipSpeed: 5, // units per tick
  hop: 50, // units, used in step mode
  bulletSpeed: 9, // units per tick
  bulletStartY: 480,
  maxBullets: 2,
  spriteW: 118,
  spriteH: 46,
  enterStagger: 10, // ticks between packets starting to enter
  enterTicks: 40,
  stepTicks: 15, // ticks advanced by one key press in step mode
};

const BOB = [0, 2, 3, 2];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;

/** Centre of formation slot i: 5 columns, x = 70 + 140c, y = 70 + 60r. */
export function slotPosition(i) {
  return { x: 70 + 140 * (i % 5), y: 70 + 60 * Math.floor(i / 5) };
}

/**
 * Where a packet is at a given tick, and what it is doing. Pure function of the tick.
 * packet: { slot, diveAt, path, index }. Returns { status, x, y }.
 */
export function packetPosition(packet, tick, diveTicks) {
  const slot = slotPosition(packet.slot);
  const enterAt = FIELD.enterStagger * packet.index;
  if (tick < enterAt) return { status: 'pending', x: slot.x, y: -60 };
  if (tick < enterAt + FIELD.enterTicks) {
    const t = (tick - enterAt) / FIELD.enterTicks;
    const ease = t * (2 - t);
    // Each packet drops straight into its own column, so sprites do not cross each other on the way in.
    return { status: 'entering', x: slot.x, y: round2(-60 + (slot.y + 60) * ease) };
  }
  if (tick < packet.diveAt) {
    const bob = BOB[(Math.floor(tick / 8) + packet.index) % 4];
    return { status: 'formation', x: slot.x, y: slot.y + bob };
  }
  const t = Math.min(1, (tick - packet.diveAt) / diveTicks);
  const y = slot.y + (FIELD.edgeY - slot.y) * t;
  let x = slot.x;
  const wave = (amp, cycles) => amp * Math.sin(2 * Math.PI * cycles * t);
  if (packet.path === 'sway') x += wave(55, 1.5);
  else if (packet.path === 'swoop-in') x += (350 - slot.x) * 0.5 * t + wave(40, 1);
  else if (packet.path === 'zigzag') x += wave(50, 3);
  const half = FIELD.spriteW / 2 + 1;
  return { status: 'diving', x: round2(clamp(x, half, FIELD.w - half)), y: round2(y) };
}

function refresh(state) {
  for (const p of state.packets) {
    if (p.status === 'resolved') continue;
    const pos = packetPosition(p, state.tick, state.diveTicks);
    p.status = pos.status;
    p.x = pos.x;
    p.y = pos.y;
  }
}

export function createWave(wave) {
  const state = {
    waveId: wave.id,
    diveTicks: wave.diveTicks,
    tick: 0,
    ship: { x: FIELD.shipStartX },
    bullets: [],
    nextBulletId: 1,
    effects: [], // { x, y, ttl, packetId }: decoration only
    frozen: false,
    complete: false,
    packets: wave.packets.map((p, index) => ({
      ...p,
      index,
      status: 'pending',
      x: 0,
      y: -60,
      resolution: null, // 'shot' | 'passed'
      judgement: null, // set by engine/state.js
    })),
  };
  refresh(state);
  return state;
}

function resolve(state, packet, action, events) {
  packet.status = 'resolved';
  packet.resolution = action;
  state.effects.push({ x: packet.x, y: Math.min(packet.y, FIELD.edgeY), ttl: 24, packetId: packet.id });
  events.push({ type: 'resolved', packetId: packet.id, action });
}

function fire(state) {
  if (state.bullets.length >= FIELD.maxBullets) return false;
  state.bullets.push({ id: state.nextBulletId, x: state.ship.x, y: FIELD.bulletStartY });
  state.nextBulletId += 1;
  return true;
}

const hits = (bullet, p) =>
  Math.abs(bullet.x - p.x) <= FIELD.spriteW / 2 && Math.abs(bullet.y - p.y) <= FIELD.spriteH / 2;

function advanceOne(state, move, events) {
  state.tick += 1;
  state.ship.x = clamp(state.ship.x + move * FIELD.shipSpeed, FIELD.shipMinX, FIELD.shipMaxX);
  refresh(state);

  // Bullets, in the order they were fired. A bullet hits the packet nearest the ship (largest y).
  const survivors = [];
  for (const bullet of state.bullets) {
    bullet.y -= FIELD.bulletSpeed;
    if (bullet.y < 0) continue;
    const target = state.packets
      .filter((p) => p.status !== 'resolved' && p.status !== 'pending' && hits(bullet, p))
      .sort((a, b) => b.y - a.y)[0];
    if (target) resolve(state, target, 'shot', events);
    else survivors.push(bullet);
  }
  state.bullets = survivors;

  // Packets that finish their dive are let through.
  for (const p of state.packets) {
    if (p.status === 'diving' && state.tick >= p.diveAt + state.diveTicks) resolve(state, p, 'passed', events);
  }

  for (const fx of state.effects) fx.ttl -= 1;
  state.effects = state.effects.filter((fx) => fx.ttl > 0);

  if (!state.complete && state.packets.every((p) => p.status === 'resolved')) {
    state.complete = true;
    events.push({ type: 'wave-complete' });
  }
}

/**
 * Apply one input. Returns { state, events } and never mutates the state it was given.
 * input: { type: "advance", ticks?, move? } | { type: "fire" } | { type: "hop", dir } | null
 * move and dir are -1, 0, or 1. "advance" is the only input that moves time forward.
 */
export function tick(waveState, input) {
  const state = structuredClone(waveState);
  const events = [];
  if (!input || state.frozen || state.complete) return { state, events };

  if (input.type === 'advance') {
    const ticks = Math.max(1, Math.floor(input.ticks ?? 1));
    const move = clamp(Math.round(input.move ?? 0), -1, 1);
    for (let i = 0; i < ticks && !state.complete; i += 1) advanceOne(state, move, events);
  } else if (input.type === 'fire') {
    if (fire(state)) events.push({ type: 'fired' });
  } else if (input.type === 'hop') {
    state.ship.x = clamp(state.ship.x + Math.sign(input.dir) * FIELD.hop, FIELD.shipMinX, FIELD.shipMaxX);
  }
  return { state, events };
}
