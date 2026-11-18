// Renders the session into the page: briefing, wave review and summary screens, the ACL, the SVG
// playfield (formation, ship, bullets, network edge), the text version of the playfield, and the
// feedback region. render() is called on every simulation tick, so it only touches the DOM when
// something actually changed.
import { currentLevel, currentWaveData } from '../engine/state.js';
import { FIELD } from '../engine/loop.js';
import { describeEntry, describePacket, sourceLine } from '../engine/feedback.js';
import { briefingToHtml } from './briefing.js';
import { resultsHtml, sourceItemHtml } from './results.js';

const GAME_VIEWS = ['playing', 'paused'];
const STARS = Array.from({ length: 36 }, (_, i) => ({ x: (i * 197 + 53) % 700, y: (i * 89 + 31) % 520, r: i % 3 === 0 ? 2 : 1 }));

const byId = (id) => document.getElementById(id);
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paragraphs = (text) => text.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('');

function sourcesHtml(session, sourceIds) {
  const items = sourceIds
    .map((id) => session.doc.sources.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => sourceItemHtml(esc, s))
    .join('');
  return `<ul>${items}</ul>`;
}

function feedbackHtml(session) {
  if (session.hint) {
    return `<div class="fb fb-hint"><p><span class="tag">Hint ${session.hint.level} of 3:</span> ${esc(session.hint.text)}</p></div>`;
  }
  const fb = session.feedback;
  if (!fb) return '<p class="note">Your latest decision appears here. Every mistake is explained in full in the review after the wave.</p>';
  if (fb.kind === 'mistake') {
    return `<div class="fb fb-bad"><p><span class="tag"><span aria-hidden="true">✗ </span>Mistake:</span> ${esc(fb.message.replace(/^Mistake: /, ''))}</p>
      <p class="note">The full explanation is waiting in the review after the wave.</p></div>`;
  }
  return `<div class="fb fb-good"><p><span class="tag"><span aria-hidden="true">✓ </span>Correct:</span> ${esc(fb.message.replace(/^Correct: /, ''))}</p></div>`;
}

function screenHtml(session) {
  const level = currentLevel(session);
  switch (session.view) {
    case 'briefing':
      return `<h2 tabindex="-1">${esc(level.title)}</h2>
        <div class="brief">${briefingToHtml(level.briefing, esc)}</div>
        <p class="start-row"><button type="button" data-action="proceed" class="primary" id="btn-main">Start wave ${esc(level.waves[0].id)}</button> <span class="note">or press Enter</span></p>
        <details class="sources"><summary>Sources</summary>${sourcesHtml(session, level.sourceIds)}</details>`;
    default:
      return resultsHtml(session, esc);
  }
}

function aclHtml(wave, fb) {
  const decider = fb ? fb.matchedSeq : undefined;
  const entries = wave.acl
    .map((e) => `<li class="${e.seq === decider ? 'decider' : ''}"><code>${esc(describeEntry(e))}</code></li>`)
    .join('');
  const implicit = `<li class="implicit${decider === null ? ' decider' : ''}"><code>implicit deny: any packet that matches no entry above</code></li>`;
  return entries + implicit;
}

function fieldSvg(w, session) {
  let svg = STARS.map((s) => `<circle class="star" cx="${s.x}" cy="${s.y}" r="${s.r}"/>`).join('');
  svg += `<rect class="network" x="0" y="${FIELD.edgeY}" width="${FIELD.w}" height="${FIELD.h - FIELD.edgeY}"/>`;
  svg += `<line class="network-line" x1="0" y1="${FIELD.edgeY}" x2="${FIELD.w}" y2="${FIELD.edgeY}"/>`;
  svg += `<text class="network-label" x="${FIELD.w / 2}" y="${FIELD.edgeY + 17}" text-anchor="middle">NETWORK (protected)</text>`;
  for (const p of w.packets) {
    if (p.status === 'pending' || p.status === 'resolved') continue;
    const port = p.port !== undefined && p.port !== null ? ` :${p.port}` : '';
    const faded = p.status === 'entering' ? ' opacity="0.7"' : '';
    svg += `<g class="packet"${faded} data-id="${esc(p.id)}" data-x="${p.x}" data-y="${p.y}" transform="translate(${p.x - FIELD.spriteW / 2} ${p.y - FIELD.spriteH / 2})">
      <rect width="${FIELD.spriteW}" height="${FIELD.spriteH}" rx="5"/>
      <text x="6" y="15">${esc(p.protocol.toUpperCase() + port)}</text>
      <text x="6" y="29">${esc(p.src)}</text>
      <text x="6" y="43">→ ${esc(p.dst)}</text></g>`;
  }
  for (const b of w.bullets) svg += `<rect class="bullet" x="${b.x - 2}" y="${b.y - 10}" width="4" height="14" rx="2"/>`;
  for (const fx of w.effects) {
    const packet = w.packets.find((p) => p.id === fx.packetId);
    const good = packet?.judgement === 'correct';
    svg += `<circle class="fx ${good ? 'fx-ok' : 'fx-bad'}" cx="${fx.x}" cy="${fx.y}" r="${12 + (24 - fx.ttl) * 1.6}" stroke-opacity="${(fx.ttl / 24).toFixed(2)}"/>`;
  }
  const sx = w.ship.x;
  svg += `<polygon class="ship" points="${sx},${FIELD.shipY - 16} ${sx - 20},${FIELD.shipY + 14} ${sx + 20},${FIELD.shipY + 14}"/>`;
  svg += `<text class="ship-label" x="${sx}" y="${FIELD.shipY + 29}" text-anchor="middle">firewall</text>`;
  if (session.view === 'paused') {
    svg += `<rect class="paused-veil" x="0" y="0" width="${FIELD.w}" height="${FIELD.h}"/><text class="paused-text" x="${FIELD.w / 2}" y="${FIELD.h / 2}" text-anchor="middle">PAUSED</text>`;
  }
  return svg;
}

function packetStatus(p, w) {
  switch (p.status) {
    case 'pending':
      return 'waiting to enter';
    case 'entering':
      return 'flying into the formation';
    case 'formation':
      return `in formation, will dive at ${(p.diveAt / 60).toFixed(0)} s`;
    case 'diving':
      return `diving, ${Math.round(((w.tick - p.diveAt) / w.diveTicks) * 100)}% of the way to the network`;
    default: {
      const what = p.resolution === 'shot' ? 'dropped by your shot' : 'let through to the network';
      if (p.judgement === 'correct') return `${what}: correct`;
      return `${what}: mistake (${p.judgement === 'wrong-shot' ? 'shot a permitted packet' : 'a denied packet leaked'})`;
    }
  }
}

const mirrorHtml = (w) => w.packets.map((p) => `<li>${esc(p.id)}: ${esc(describePacket(p))}: ${esc(packetStatus(p, w))}</li>`).join('');

export function createRenderer() {
  let previousView = null;
  let screenKey = null;
  const last = { feedback: null, acl: null, mirror: null, controls: null, counts: null, hidden: null };

  // On a results screen, opening a mistake line highlights the access-list entry that decided it.
  // (Details elements fire "toggle" without bubbling, so listen in the capture phase.)
  byId('screen').addEventListener(
    'toggle',
    (event) => {
      if (!event.target.matches?.('details.miss')) return;
      const screen = byId('screen');
      const open = [...screen.querySelectorAll('details.miss[open]')].map((d) => d.dataset.seq);
      for (const li of screen.querySelectorAll('.aclbox li')) li.classList.toggle('hl', open.includes(li.dataset.seq));
    },
    true,
  );

  function setControls(session) {
    const v = session.view;
    const playing = v === 'playing';
    const key = `${v}|${session.speed}`;
    if (key === last.controls) return;
    last.controls = key;
    for (const node of document.querySelectorAll('[data-action="hop-left"],[data-action="hop-right"],[data-action="fire"]')) node.disabled = !playing;
    byId('btn-pause').disabled = !(playing || v === 'paused');
    byId('btn-pause').textContent = v === 'paused' ? 'Resume' : 'Pause';
    byId('btn-hint').disabled = v !== 'paused';
    byId('btn-step').disabled = !(playing && session.speed === 'step');
    byId('speed').value = session.speed;
  }

  function render(session) {
    const view = session.view;
    const isGame = GAME_VIEWS.includes(view);
    const level = currentLevel(session);
    const wave = currentWaveData(session);

    // Status line and health
    const time = session.wave && isGame ? ` · Time ${(session.wave.tick / 60).toFixed(1)} s` : '';
    byId('position').textContent = `Level ${session.levelIndex + 1} of ${session.doc.levels.length} · Wave ${wave.id}${time}`;
    const healthText = `Health ${session.health} of ${session.maxHealth}`;
    if (byId('health-text').textContent !== healthText) {
      byId('health-text').textContent = healthText;
      byId('health-hearts').textContent = '♥'.repeat(Math.max(0, session.health)) + '♡'.repeat(Math.max(0, session.maxHealth - session.health));
    }

    // Which area is visible
    if (last.hidden !== String(isGame)) {
      byId('game').hidden = !isGame;
      last.hidden = String(isGame);
    }

    // Screens (briefing, review, summaries, failed)
    const key = `${view}|${session.levelIndex}|${session.waveIndex}|${session.completedWaves.length}|${session.retries}|${session.health}`;
    const screen = byId('screen');
    if (isGame) {
      if (screen.innerHTML !== '') screen.innerHTML = '';
      screenKey = null;
    } else if (key !== screenKey) {
      screen.innerHTML = screenHtml(session);
      screen.classList.toggle('wide', view === 'briefing');
      screen.classList.toggle('results', ['wave-summary', 'wave-failed', 'level-summary', 'session-summary'].includes(view));
      screenKey = key;
      screen.querySelector('h2')?.focus();
    }

    // Game area
    if (isGame && session.wave) {
      const fb = session.feedback;
      const aclKey = `${level.id}|${wave.id}|${fb ? fb.matchedSeq : 'x'}`;
      if (aclKey !== last.acl) {
        byId('acl').innerHTML = aclHtml(wave, fb);
        last.acl = aclKey;
      }
      const field = byId('field');
      field.innerHTML = fieldSvg(session.wave, session);
      // Read-only mirrors of the simulation, used by the browser checks and by anyone inspecting the page.
      field.dataset.tick = String(session.wave.tick);
      field.dataset.shipX = String(session.wave.ship.x);
      field.dataset.bullets = String(session.wave.bullets.length);
      const mirror = mirrorHtml(session.wave);
      if (mirror !== last.mirror) {
        byId('mirror').innerHTML = mirror;
        last.mirror = mirror;
      }
      byId('ship-text').textContent = `Your ship is ${Math.round(((session.wave.ship.x - FIELD.shipMinX) / (FIELD.shipMaxX - FIELD.shipMinX)) * 100)}% of the way from the left edge to the right edge. Bullets in the air: ${session.wave.bullets.length} of ${FIELD.maxBullets}.`;
      const counts = `Handled correctly: ${session.waveStats.correct} of ${session.wave.packets.length}. Mistakes this attempt: ${session.waveMistakes.length}.`;
      if (counts !== last.counts) {
        byId('counts').textContent = counts;
        last.counts = counts;
      }
      const html = feedbackHtml(session);
      if (html !== last.feedback) {
        byId('feedback').innerHTML = html;
        last.feedback = html;
      }
    } else {
      last.acl = last.mirror = last.feedback = last.counts = null;
    }

    setControls(session);

    // Restart confirmation dialog
    const dialog = byId('restart-dialog');
    if (session.confirmingRestart && !dialog.open) {
      dialog.showModal();
      byId('btn-cancel-restart').focus();
    } else if (!session.confirmingRestart && dialog.open) {
      dialog.close();
    }

    // Focus: move it deliberately when a new screen opens or play begins
    if (view !== previousView) {
      if (view === 'playing' && previousView && previousView !== 'paused') byId('field-heading').focus();
    }
    previousView = view;
  }

  function showError(title, lines) {
    byId('game').hidden = true;
    last.hidden = 'false';
    for (const node of document.querySelectorAll('#controls button')) node.disabled = true;
    byId('screen').innerHTML = `<h2 tabindex="-1">${esc(title)}</h2>
      ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      <button type="button" data-action="reload" class="primary">Try loading again</button>`;
    byId('position').textContent = 'Content error';
    byId('screen').querySelector('h2').focus();
  }

  return { render, showError };
}
