// Load → validate → start. Shows a clear error instead of starting if the content is not usable.
import { validate } from './engine/content.js';
import { FIELD } from './engine/loop.js';
import * as S from './engine/state.js';
import { createRenderer } from './ui/render.js';
import { createClock } from './ui/clock.js';
import { initControls } from './ui/controls.js';
import { createAudio } from './ui/audio.js';

const renderer = createRenderer();
const audio = createAudio();
// A read-only handle for diagnostics and the browser checks (they measure the real audio output level).
window.__permitOrPew = { audio };
let session = null;
let restartOpener = null;
let input = { getMove: () => 0 };

function updateSoundButton() {
  document.getElementById('btn-sound').textContent = audio.stats().muted ? 'Sound: off' : 'Sound: on';
}

// Turn what the game reported into sound. A call that changed nothing returns the same session object and
// never reaches here, so a sound can only play once.
function syncAudio(next) {
  const wantMusic = next.view === 'playing' && next.speed !== 'step' && !next.confirmingRestart;
  audio.setMusic(wantMusic ? next.levelIndex : null, next.speed === 'slow' ? 0.75 : 1);
  for (const name of next.sounds ?? []) audio.play(name);
}

function update(next) {
  if (next === session) return;
  session = next;
  renderer.render(session);
  syncAudio(session);
}

function handle(action) {
  if (!session) {
    if (action === 'reload') location.reload();
    return;
  }
  switch (action) {
    case 'hop-left':
      return update(S.act(session, { type: 'hop', dir: -1 }));
    case 'hop-right':
      return update(S.act(session, { type: 'hop', dir: 1 }));
    case 'fire':
      return update(S.act(session, { type: 'fire' }));
    case 'step':
      return session.speed === 'step' ? update(S.act(session, { type: 'advance', ticks: FIELD.stepTicks, move: 0 })) : undefined;
    case 'pause':
      return update(S.togglePause(session));
    case 'hint':
      return update(S.requestHint(session));
    case 'proceed':
      return update(S.proceed(session));
    case 'restart':
      restartOpener = document.activeElement;
      return update(S.requestRestart(session));
    case 'confirm-restart':
      update(S.confirmRestart(session));
      return restartOpener?.focus?.();
    case 'cancel-restart':
      update(S.cancelRestart(session));
      return restartOpener?.focus?.();
    case 'mute':
      audio.setMuted(!audio.stats().muted);
      return updateSoundButton();
    case 'reload':
      return location.reload();
    default:
  }
}

async function start() {
  input = initControls({
    handle,
    getSession: () => session,
    onGesture: () => audio.unlock(),
    onVolume: (value) => audio.setVolume(value),
    onSpeedChange: (speed) => session && update(S.setSpeed(session, speed)),
  });
  createClock({
    getSession: () => session,
    onTick: () => update(S.act(session, { type: 'advance', ticks: 1, move: input.getMove() })),
  });

  // Pause automatically if the tab is hidden, so packets do not dive unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session?.view === 'playing') update(S.togglePause(session));
  });

  let doc;
  try {
    const response = await fetch('data/levels.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    doc = await response.json();
  } catch (error) {
    renderer.showError('The levels could not be loaded', [
      'Permit or Pew needs to be opened through a web server, not directly from a file.',
      'Run "py serve.py" in the project folder, then open http://127.0.0.1:8000.',
      `Details: ${error.message}`,
    ]);
    return;
  }

  const result = validate(doc);
  if (!result.ok) {
    renderer.showError(
      'The level content has errors, so the game cannot start',
      result.errors.map((e) => `${e.levelId ?? 'file'}${e.waveId ? ` / wave ${e.waveId}` : ''}: ${e.message}`),
    );
    return;
  }

  update(S.createSession(doc));
}

start();
