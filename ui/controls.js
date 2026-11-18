// Keyboard and pointer input. Every action also exists as an on-screen button.
// In real-time speeds the arrow keys are held to move; in Step speed each press hops once.
// Space and Enter are left to a focused button so one key press never triggers two actions.
// After a game button is used, focus goes back to the playfield. Otherwise a clicked Pause button keeps
// focus and the next Space press would press Pause again instead of firing.
const LEFT = ['ArrowLeft', 'a', 'A'];
const RIGHT = ['ArrowRight', 'd', 'D'];
const OTHER = { p: 'pause', P: 'pause', h: 'hint', H: 'hint', n: 'step', N: 'step', m: 'mute', M: 'mute' };

const GAME_BUTTONS = new Set(['hop-left', 'hop-right', 'fire', 'pause', 'hint', 'step', 'mute']);

function focusPlayfield() {
  document.getElementById('field-heading')?.focus({ preventScroll: true });
}

export function initControls({ handle, onSpeedChange, onVolume, onGesture, getSession }) {
  const held = { left: false, right: false };
  let lastKeyAt = -Infinity;

  // Browsers only allow sound after the player has done something, so the first key press or click unlocks it.
  document.addEventListener('pointerdown', () => onGesture?.());

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    handle(button.dataset.action);
    if (GAME_BUTTONS.has(button.dataset.action)) focusPlayfield();
  });

  document.addEventListener('keydown', (event) => {
    lastKeyAt = performance.now();
    onGesture?.();
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (document.getElementById('restart-dialog').open) return; // the dialog handles its own keys
    const tag = event.target.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'INPUT') return;
    const onButton = tag === 'BUTTON' || tag === 'A';
    const stepMode = getSession()?.speed === 'step';

    if (LEFT.includes(event.key) || RIGHT.includes(event.key)) {
      const left = LEFT.includes(event.key);
      event.preventDefault();
      held[left ? 'left' : 'right'] = true;
      if (stepMode && !event.repeat) handle(left ? 'hop-left' : 'hop-right');
      return;
    }
    let action = OTHER[event.key];
    if (!action && event.key === ' ' && !onButton) action = 'fire';
    if (!action && event.key === 'Enter' && !onButton) action = 'proceed';
    if (!action) return;
    event.preventDefault();
    if (event.repeat && action === 'fire') return; // one shot per key press
    handle(action);
  });

  document.addEventListener('keyup', (event) => {
    if (LEFT.includes(event.key)) held.left = false;
    if (RIGHT.includes(event.key)) held.right = false;
  });
  window.addEventListener('blur', () => {
    held.left = false;
    held.right = false;
  });

  document.getElementById('speed').addEventListener('change', (event) => {
    onSpeedChange(event.target.value);
    // A change made with the pointer hands focus back to the game. A change made with the arrow keys keeps
    // focus on the menu so the player can keep choosing.
    if (performance.now() - lastKeyAt > 250) focusPlayfield();
  });

  const volume = document.getElementById('volume');
  volume.addEventListener('input', (event) => onVolume?.(Number(event.target.value) / 100));
  volume.addEventListener('change', () => {
    // moved with the mouse: hand focus back to the game; moved with the arrow keys: stay so they can keep adjusting
    if (performance.now() - lastKeyAt > 250) focusPlayfield();
  });

  document.getElementById('restart-dialog').addEventListener('cancel', (event) => {
    event.preventDefault(); // Esc: treat as Cancel so the session state stays in charge
    handle('cancel-restart');
  });

  return { getMove: () => (held.right ? 1 : 0) - (held.left ? 1 : 0) };
}
