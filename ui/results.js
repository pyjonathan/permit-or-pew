// The screens shown after a wave, a level, and the game: wave cleared, wave failed, level cleared,
// and the final summary. Plain HTML builders with no DOM access, so they can be tested in Node.
//
// Design: a big banner says at a glance whether the wave was cleared or failed (text, an icon, and
// colour; never colour alone), stat tiles give the numbers, "What went wrong" lists one line per
// mistake (the packet, what you did, what you should have done, which entry decided it) and each line
// expands to the full explanation, the wave's access list is shown beside it so the rules the mistakes
// refer to are always on the page (entries that caused mistakes are marked), and the sources are one
// collapsed section for further reading.
import { describeEntry, sourceLine } from '../engine/feedback.js';

const hearts = (health, max) => '♥'.repeat(Math.max(0, health)) + '♡'.repeat(Math.max(0, max - health));

function banner(esc, { kind, title, subtitle, button, action = 'proceed' }) {
  const icon = kind === 'pass' ? '✓' : '✗';
  return `<div class="banner ${kind}">
    <span class="banner-icon" aria-hidden="true">${icon}</span>
    <div class="banner-text"><h2 tabindex="-1">${esc(title)}</h2><p>${esc(subtitle)}</p></div>
    <button type="button" data-action="${action}" class="primary" id="btn-main">${esc(button)}</button>
  </div>`;
}

function tiles(esc, items) {
  return `<ul class="tiles">${items
    .map(([label, value]) => `<li class="tile"><span class="lbl">${esc(label)}</span><span class="num">${esc(value)}</span></li>`)
    .join('')}</ul>`;
}

function wrongList(esc, mistakes, { emptyText }) {
  if (mistakes.length === 0) return `<h3>What went wrong</h3><p class="nothing"><span aria-hidden="true">✓ </span>${esc(emptyText)}</p>`;
  const rows = mistakes
    .map(
      (m) => `<li><details class="miss" data-seq="${m.matchedSeq === null ? 'implicit' : m.matchedSeq}">
        <summary>
          <span class="miss-icon" aria-hidden="true">✗</span>
          <span class="miss-main"><code class="pk">${esc(m.packetText)}</code> <span class="miss-what">${esc(m.what)}</span></span>
          <span class="miss-fix">Should have: <strong>${esc(m.should)}</strong></span>
          <span class="miss-why">${esc(m.because)} <code class="entry">${esc(m.entryText)}</code></span>
        </summary>
        <div class="why">
          <ul>${m.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <p>${esc(m.advice)}</p>
        </div>
      </details></li>`,
    )
    .join('');
  return `<h3>What went wrong</h3>
    <ol class="wrong">${rows}</ol>
    <p class="note">Click a line to see the full explanation.</p>`;
}

// The wave's access list, so the entries named in the mistakes can be read and compared. Entries that caused
// mistakes are marked with how many. Opening a mistake line highlights its entry (see ui/render.js).
function aclBox(esc, acl, mistakes) {
  const counts = new Map();
  for (const m of mistakes) counts.set(m.matchedSeq === null ? 'implicit' : m.matchedSeq, (counts.get(m.matchedSeq === null ? 'implicit' : m.matchedSeq) ?? 0) + 1);
  const badge = (key) => {
    const n = counts.get(key);
    return n ? `<span class="badge">✗ caused ${n} mistake${n === 1 ? '' : 's'}</span>` : '';
  };
  const rows = acl
    .map((e) => `<li data-seq="${e.seq}" class="${counts.has(e.seq) ? 'hit' : ''}"><code>${esc(describeEntry(e))}</code>${badge(e.seq)}</li>`)
    .join('');
  const implicit = `<li data-seq="implicit" class="implicit${counts.has('implicit') ? ' hit' : ''}"><code>implicit deny: any packet that matches no entry above</code>${badge('implicit')}</li>`;
  return `<section class="aclbox" aria-labelledby="results-acl-heading">
    <h3 id="results-acl-heading">The access list</h3>
    <ol class="acl">${rows}${implicit}</ol>
    <p class="note">Checked from the top. The first entry that matches decides.</p>
  </section>`;
}

/**
 * One source as a list item: title and section, a link to open it, and the claim it supports. Only https
 * addresses become links (anything else is shown as plain text), and links open in a new tab with noopener.
 */
export function sourceItemHtml(esc, s) {
  const label = sourceLine(s);
  const link = s.url.startsWith('https://')
    ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(label)} (opens in a new tab)">Open the page</a>`
    : `<span class="src">${esc(s.url)}</span>`;
  return `<li><strong>${esc(label)}</strong> ${link}<br><span class="src">${esc(s.claim)}</span></li>`;
}

function sourcesDetails(esc, session, sourceIds) {
  const items = sourceIds
    .map((id) => session.doc.sources.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => sourceItemHtml(esc, s))
    .join('');
  return `<details class="sources"><summary>Sources: read more</summary><ul>${items}</ul></details>`;
}

function wavesTable(esc, waves) {
  return `<table><thead><tr><th scope="col">Wave</th><th scope="col">Right (final attempt)</th><th scope="col">Mistakes (all attempts)</th><th scope="col">Retries</th><th scope="col">Hints</th></tr></thead><tbody>${waves
    .map((w) => `<tr><td>${esc(w.waveId)}</td><td>${w.correct}</td><td>${w.mistakes}</td><td>${w.retries}</td><td>${w.hints}</td></tr>`)
    .join('')}</tbody></table>`;
}

/** HTML for the wave-summary, wave-failed, level-summary, and session-summary views. */
export function resultsHtml(session, esc) {
  const level = session.doc.levels[session.levelIndex];
  const wave = level.waves[session.waveIndex];
  const max = session.maxHealth;

  if (session.view === 'wave-failed') {
    const stats = session.waveStats;
    return `${banner(esc, {
      kind: 'fail',
      title: `Wave ${wave.id} failed`,
      subtitle: `Your health reached 0. Retry starts you on ${max} of ${max}, and your mistakes stay counted.`,
      button: 'Retry this wave',
    })}
    ${tiles(esc, [
      ['Right so far', `${stats.correct} of ${wave.packets.length}`],
      ['Mistakes this attempt', session.waveMistakes.length],
      ['Health', `${hearts(0, max)} 0 of ${max}`],
      ['Retries', stats.retries],
    ])}
    <div class="results-grid"><div>${wrongList(esc, session.waveMistakes, { emptyText: 'No mistakes recorded.' })}</div>${aclBox(esc, wave.acl, session.waveMistakes)}</div>
    ${sourcesDetails(esc, session, level.sourceIds)}`;
  }

  if (session.view === 'wave-summary') {
    const w = session.completedWaves[session.completedWaves.length - 1];
    const clean = w.mistakes === 0;
    return `${banner(esc, {
      kind: 'pass',
      title: `Wave ${w.waveId} cleared`,
      subtitle: clean ? 'No mistakes. A clean run.' : `Cleared, but not a clean run: ${w.mistakes} mistake${w.mistakes === 1 ? '' : 's'}.`,
      button: session.waveIndex === 0 ? 'Next wave' : 'Finish level',
    })}
    ${tiles(esc, [
      ['Right', `${w.correct} of ${wave.packets.length}`],
      ['Mistakes (all attempts)', w.mistakes],
      ['Health', `${hearts(session.health, max)} ${session.health} of ${max}`],
      ['Retries', w.retries],
      ['Hints', w.hints],
    ])}
    <div class="results-grid"><div>${wrongList(esc, session.lastReview, { emptyText: 'Nothing went wrong on this wave.' })}</div>${aclBox(esc, wave.acl, session.lastReview)}</div>
    ${sourcesDetails(esc, session, level.sourceIds)}`;
  }

  if (session.view === 'level-summary') {
    const waves = session.completedWaves.filter((w) => w.levelId === level.id);
    return `${banner(esc, {
      kind: 'pass',
      title: `Level ${session.levelIndex + 1} cleared`,
      subtitle: `Health now ${session.health} of ${max}. Every level starts on ${max}.`,
      button: session.levelIndex === session.doc.levels.length - 1 ? 'See the final summary' : 'Next level',
    })}
    ${wavesTable(esc, waves)}`;
  }

  if (session.view === 'session-summary') {
    const m = session.mistakes;
    return `${banner(esc, {
      kind: 'pass',
      title: 'All waves cleared',
      subtitle: 'You got through the whole game.',
      button: 'Play again',
      action: 'restart',
    })}
    ${tiles(esc, [
      ['Waves cleared', `${session.completedWaves.length} of 6`],
      ['Wrong shots', m['wrong-shot']],
      ['Leaks', m.leak],
      ['Retries', session.retries],
      ['Hints', session.assistance.length],
    ])}
    ${wavesTable(esc, session.completedWaves)}
    <p>Getting through the game is not proof that you can read ACLs without help, because hints and retries are counted separately above.</p>`;
  }

  return '';
}
