// The only module that uses a clock. It runs a fixed-timestep loop: at Normal speed the simulation runs
// 60 ticks per second, at Slow 30. In Step mode it does nothing; the player advances time with the
// Advance control or the N key. Speed changes how fast time passes, never what happens in a tick.
const TICK_MS = 1000 / 60;
const RATE = { slow: 0.5, normal: 1 };
const MAX_TICKS_PER_FRAME = 8; // after a stall, drop the backlog instead of racing to catch up

export function createClock({ getSession, onTick }) {
  let last = null;
  let accumulated = 0;

  function frame(now) {
    const session = getSession();
    const rate = session && session.view === 'playing' && !session.confirmingRestart ? RATE[session.speed] ?? 0 : 0;
    if (rate > 0 && last !== null) {
      accumulated += Math.min(now - last, 100) * rate;
      let ticks = 0;
      while (accumulated >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
        onTick();
        accumulated -= TICK_MS;
        ticks += 1;
        if (getSession().view !== 'playing') {
          accumulated = 0;
          break;
        }
      }
      if (ticks === MAX_TICKS_PER_FRAME) accumulated = 0;
    } else {
      accumulated = 0;
    }
    last = now;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
