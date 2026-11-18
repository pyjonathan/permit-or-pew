// Session state: health, mistakes, retries, assistance, progress, and every view transition.
// Health starts at the maximum (3) for every level and after every retry. A mistake costs 1 health and a
// correct decision gives 1 back, never above the maximum. At 0 the wave fails. Health carries from the
// first wave of a level into the second. A mistake never freezes the game: it shows a one-line message and is stored
// with its full explanation for the after-action review at the end of the wave.
// Every function returns a new session and never mutates the one it was given.
// A call that changes nothing (for example a hint while playing) returns the very same session object, so the
// UI can tell it caused nothing. A call that changes something returns a new session whose `sounds` lists the
// sound moments that call caused (fire, hit-correct, hit-wrong, delivered, leak, wave-start, wave-cleared,
// wave-failed, pause, resume, hint).
import { evaluate, judge } from './acl.js';
import { createWave, tick } from './loop.js';
import { confirm, explain, mistakeSummary, shortMessage, workedSolution, workedStep } from './feedback.js';

const SPEEDS = ['step', 'slow', 'normal'];

// Copy everything except the (large, read-only) content document and the wave, which the loop clones itself.
function clone(session) {
  const { doc, wave, ...rest } = session;
  return { doc, wave, ...structuredClone(rest), sounds: [] }; // a call reports only the sounds it caused
}

export function createSession(doc, speed = 'normal') {
  return {
    doc,
    view: 'briefing',
    levelIndex: 0,
    waveIndex: 0,
    maxHealth: doc.maxHealth,
    health: doc.maxHealth, // full at the start of each level and on retry; carries between a level's two waves
    mistakes: { 'wrong-shot': 0, leak: 0 }, // cumulative, including failed attempts
    retries: 0,
    assistance: [], // [{ waveId, level }]
    completedWaves: [], // [{ levelId, waveId, correct, mistakes, retries, hints }]
    speed,
    wave: null,
    waveStats: null, // { correct, mistakes, retries, hints } for the current wave
    waveMistakes: [], // full records for the current attempt, shown in the review
    lastReview: [], // the review of the wave that just finished
    feedback: null, // latest decision: { kind: 'correct' | 'mistake', message, matchedSeq, ... }
    hint: null, // { level, text }
    hintLevel: 0,
    confirmingRestart: false,
    sounds: [], // the sound moments caused by the latest call: fire, hit-correct, hit-wrong, delivered, leak, ...
  };
}

export const currentLevel = (s) => s.doc.levels[s.levelIndex];
export const currentWaveData = (s) => currentLevel(s).waves[s.waveIndex];

function beginWave(s) {
  s.wave = createWave(currentWaveData(s));
  s.waveStats = { correct: 0, mistakes: 0, retries: 0, hints: 0 };
  s.waveMistakes = [];
  s.lastReview = [];
  s.feedback = null;
  s.hint = null;
  s.hintLevel = 0;
  s.view = 'playing';
  s.sounds.push('wave-start');
}

function finishWave(s) {
  s.completedWaves.push({ levelId: currentLevel(s).id, waveId: currentWaveData(s).id, ...s.waveStats });
  s.lastReview = structuredClone(s.waveMistakes);
  s.view = 'wave-summary';
  s.sounds.push('wave-cleared');
}

function failWave(s) {
  s.view = 'wave-failed';
  s.wave.frozen = true;
  s.sounds.push('wave-failed');
}

// Judge every resolved packet using the evaluator. The loop never decides correctness.
function applyEvents(s, events) {
  const wave = currentWaveData(s);
  for (const ev of events) {
    if (ev.type === 'fired') s.sounds.push('fire');
    if (ev.type !== 'resolved') continue;
    const packet = s.wave.packets.find((p) => p.id === ev.packetId);
    const result = evaluate(wave.acl, packet);
    const judgement = judge(result.decision, ev.action);
    packet.judgement = judgement;
    if (judgement === 'correct') {
      s.sounds.push(ev.action === 'shot' ? 'hit-correct' : 'delivered');
      s.waveStats.correct += 1;
      s.health = Math.min(s.maxHealth, s.health + 1); // a right decision gives 1 health back
      s.feedback = { kind: 'correct', matchedSeq: result.matchedSeq, ...confirm(wave.acl, result, packet, ev.action) };
      continue;
    }
    s.health -= 1;
    s.sounds.push(judgement === 'wrong-shot' ? 'hit-wrong' : 'leak');
    s.mistakes[judgement] += 1;
    s.waveStats.mistakes += 1;
    s.waveMistakes.push({
      packetId: packet.id,
      kind: judgement,
      decision: result.decision,
      matchedSeq: result.matchedSeq,
      sourceIds: currentLevel(s).sourceIds,
      ...mistakeSummary(wave.acl, result, packet, judgement),
      ...explain(wave.acl, result, packet, judgement),
    });
    s.feedback = { kind: 'mistake', matchedSeq: result.matchedSeq, message: shortMessage(result, packet, judgement) };
    if (s.health <= 0) {
      failWave(s); // the wave fails at once, even if this was its last packet
      return;
    }
  }
  if (s.wave.complete) finishWave(s);
}

/**
 * Apply an input while playing: { type: "advance", ticks?, move? } | { type: "fire" } | { type: "hop", dir }.
 * Ignored in every other view, and while the restart confirmation is open.
 */
export function act(session, input) {
  if (session.view !== 'playing' || session.confirmingRestart) return session;
  const s = clone(session);
  const { state, events } = tick(s.wave, input);
  s.wave = state;
  applyEvents(s, events);
  return s;
}

function advance(s) {
  if (s.view === 'wave-summary') {
    if (s.waveIndex === 0) {
      s.waveIndex = 1;
      beginWave(s);
    } else {
      s.view = 'level-summary';
    }
  } else if (s.view === 'level-summary') {
    if (s.levelIndex === s.doc.levels.length - 1) {
      s.view = 'session-summary';
    } else {
      s.levelIndex += 1;
      s.waveIndex = 0;
      s.health = s.maxHealth; // every level starts on full health
      s.view = 'briefing';
    }
  }
}

function retry(s) {
  s.health = s.maxHealth; // a retry always starts on full health
  s.retries += 1;
  s.waveStats.retries += 1;
  s.waveStats.correct = 0;
  s.wave = createWave(currentWaveData(s));
  s.waveMistakes = [];
  s.feedback = null;
  s.hint = null;
  s.hintLevel = 0;
  s.view = 'playing';
  s.sounds.push('wave-start');
}

/** The "Enter" action: does whatever the current screen's main button does. */
export function proceed(session) {
  const s = clone(session);
  switch (s.view) {
    case 'briefing':
      beginWave(s);
      break;
    case 'wave-summary':
    case 'level-summary':
      advance(s);
      break;
    case 'wave-failed':
      retry(s);
      break;
    case 'paused':
      s.view = 'playing';
      s.wave = { ...s.wave, frozen: false };
      s.hint = null;
      s.hintLevel = 0;
      s.sounds.push('resume');
      break;
    default:
      return session;
  }
  return s;
}

export function togglePause(session) {
  if (session.view === 'paused') return proceed(session);
  if (session.view !== 'playing') return session;
  const s = clone(session);
  s.view = 'paused';
  s.wave = { ...s.wave, frozen: true };
  s.hint = null;
  s.hintLevel = 0;
  s.sounds.push('pause');
  return s;
}

/** The packet closest to reaching the network, or the next one to dive if none is diving yet. */
function currentPacket(s) {
  const open = s.wave.packets.filter((p) => p.status !== 'resolved');
  const diving = open.filter((p) => p.status === 'diving');
  if (diving.length > 0) return diving.sort((a, b) => b.y - a.y)[0];
  return open.sort((a, b) => a.diveAt - b.diveAt)[0] ?? null;
}

/** Hint 1: the wave's method hint. Hint 2: a worked step. Hint 3: the full solution (generated). */
export function requestHint(session) {
  if (session.view !== 'paused') return session;
  const s = clone(session);
  const wave = currentWaveData(s);
  const level = Math.min(s.hintLevel + 1, 3);
  let text;
  if (level === 1) {
    text = wave.hints[0];
  } else {
    const packet = currentPacket(s);
    if (!packet) {
      text = 'No packet is left in this wave.';
    } else {
      const result = evaluate(wave.acl, packet);
      text = level === 2 ? workedStep(wave.acl, result, packet) : workedSolution(wave.acl, result, packet);
    }
  }
  s.hintLevel = level;
  s.hint = { level, text };
  s.assistance.push({ waveId: wave.id, level });
  s.waveStats.hints += 1;
  s.sounds.push('hint');
  return s;
}

export function retryWave(session) {
  return session.view === 'wave-failed' ? proceed(session) : session;
}

export function setSpeed(session, speed) {
  if (!SPEEDS.includes(speed)) return session;
  return { ...session, speed, sounds: [] };
}

export function requestRestart(session) {
  return { ...session, confirmingRestart: true, sounds: [] };
}

export function cancelRestart(session) {
  return { ...session, confirmingRestart: false, sounds: [] };
}

export function confirmRestart(session) {
  return createSession(session.doc, session.speed);
}
