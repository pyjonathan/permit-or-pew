// Drives the real game in headless Chrome with real key presses (Chrome DevTools Protocol).
// Developer tool, not part of the game: node tests/browser-check.mjs
// Needs Chrome or Edge. Set CHROME_PATH if it is not in a default location.
// It starts its own static server on port 8123, takes screenshots into the OS temp folder, and prints
// pass/fail per check. It never changes game state through hooks: it only presses keys and reads the page.
//
// How the "perfect play" bot works: it plans a flawless wave by playing the pure game engine in Node
// (try a shot, keep it if it works), then replays exactly those key presses in the browser. If the browser
// ends up with a perfect wave too, the browser and the engine agree.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../engine/state.js';
import { evaluate } from '../engine/acl.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTTP_PORT = 8123;
const DEBUG_PORT = 9333;
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(ROOT, path === '' ? 'index.html' : path.endsWith('/') ? path + 'index.html' : path);
  try {
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    const target = existsSync(file) && !extname(file) ? join(file, 'index.html') : file;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));

const profile = await mkdtemp(join(tmpdir(), 'pd-chrome-'));
const shots = join(tmpdir(), 'pd-shots');
await mkdir(shots, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1366,768', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForDebugger() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}
const ws = new WebSocket(await waitForDebugger());
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
const consoleProblems = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id) pending.get(msg.id)?.(msg);
  else if (msg.method === 'Runtime.exceptionThrown') consoleProblems.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleProblems.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') consoleProblems.push(msg.params.entry.text + ' ' + (msg.params.entry.url ?? ''));
  else if (msg.method === 'Fetch.requestPaused') handlePaused(msg.params);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (nextId += 1);
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
const LAPTOP = { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }; // a typical laptop viewport
await send('Emulation.setDeviceMetricsOverride', LAPTOP);

let rewriteLevels = null;
let rewriteModule = null; // { path, body }: serve different source for one module
async function handlePaused(params) {
  if (rewriteModule && params.request.url.endsWith(rewriteModule.path)) {
    await send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/javascript' }], body: Buffer.from(rewriteModule.body).toString('base64') });
    return;
  }
  if (rewriteLevels && params.request.url.endsWith('/data/levels.json')) {
    const raw = await (await fetch(params.request.url)).json();
    const body = Buffer.from(JSON.stringify(rewriteLevels(raw))).toString('base64');
    await send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body });
  } else {
    await send('Fetch.continueRequest', { requestId: params.requestId });
  }
}

// ---- helpers ----------------------------------------------------------------------------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '\n      ' + detail}`);
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
}
const KEYS = {
  ' ': { key: ' ', code: 'Space', vk: 32, text: ' ' },
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  n: { key: 'n', code: 'KeyN', vk: 78, text: 'n' },
  p: { key: 'p', code: 'KeyP', vk: 80, text: 'p' },
  m: { key: 'm', code: 'KeyM', vk: 77, text: 'm' },
  h: { key: 'h', code: 'KeyH', vk: 72, text: 'h' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
};
const keyParams = (name) => {
  const k = KEYS[name];
  return { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
};
async function keyDown(name) {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...keyParams(name), ...(k.text ? { text: k.text } : {}) });
}
const keyUp = (name) => send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams(name) });
async function press(name, wait = 12) {
  await keyDown(name);
  await keyUp(name);
  await sleep(wait);
}
const state = () =>
  js(`(() => {
    const q = (s) => document.querySelector(s);
    const a = document.activeElement;
    const f = q('#field');
    return {
      position: q('#position').textContent,
      health: q('#health-text').textContent,
      hearts: q('#health-hearts').textContent,
      gameVisible: !q('#game').hidden,
      screenH2: q('#screen h2')?.textContent ?? null,
      screenText: q('#screen').innerText,
      sourcesText: q('#screen details.sources')?.textContent ?? null,
      sourceLinks: [...document.querySelectorAll('#screen details.sources a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
      reviewItems: [...document.querySelectorAll('#screen .wrong > li')].map((li) => li.innerText),
      reviewFull: [...document.querySelectorAll('#screen .wrong > li')].map((li) => li.textContent.replace(/\\s+/g, ' ')),
      bannerClass: q('#screen .banner')?.className ?? null,
      bannerIcon: q('#screen .banner-icon')?.textContent ?? null,
      bannerBg: q('#screen .banner') ? getComputedStyle(q('#screen .banner')).backgroundColor : null,
      mainBottom: q('#btn-main')?.getBoundingClientRect().bottom ?? null,
      viewport: window.innerHeight,
      openMiss: document.querySelectorAll('#screen details.miss[open]').length,
      sourcesOpen: !!q('#screen details.sources')?.open,
      aclRows: [...document.querySelectorAll('#screen .aclbox li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
      aclBox: q('#screen .aclbox') ? (({ top, bottom, left }) => ({ top, bottom, left }))(q('#screen .aclbox').getBoundingClientRect()) : null,
      missBox: q('#screen .wrong') ? (({ left }) => ({ left }))(q('#screen .wrong').getBoundingClientRect()) : null,
      hlSeqs: [...document.querySelectorAll('#screen .aclbox li.hl')].map((li) => li.dataset.seq),
      openSeqs: [...document.querySelectorAll('#screen details.miss[open]')].map((d) => d.dataset.seq),
      entryChips: [...document.querySelectorAll('#screen details.miss .entry')].map((e) => e.textContent),
      feedback: q('#feedback').innerText,
      counts: q('#counts').textContent,
      active: a?.id || a?.tagName,
      pause: q('#btn-pause').textContent,
      decider: q('#acl li.decider code')?.textContent ?? null,
      aclCount: document.querySelectorAll('#acl li').length,
      mirror: [...document.querySelectorAll('#mirror li')].map((l) => l.textContent),
      sprites: [...document.querySelectorAll('#field .packet')].map((g) => ({ id: g.dataset.id, x: Number(g.dataset.x), y: Number(g.dataset.y), text: g.textContent.replace(/\\s+/g, ' ').trim() })),
      tick: Number(f.dataset.tick ?? -1),
      shipX: Number(f.dataset.shipX ?? -1),
      bullets: Number(f.dataset.bullets ?? -1),
      dialogOpen: q('#restart-dialog').open,
      disabled: Object.fromEntries([...document.querySelectorAll('#controls button')].map((b) => [b.dataset.action, b.disabled])),
      speed: q('#speed').value,
    };
  })()`);
async function load(path = '/') {
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}${path}` });
  for (let i = 0; i < 100; i += 1) {
    await sleep(50);
    try {
      if (await js(`document.readyState === 'complete' && (document.querySelector('#position')?.textContent !== 'Loading…' || document.querySelector('#screen h2'))`)) break;
    } catch { /* navigating */ }
  }
  await sleep(100);
}
async function chooseSpeedByKeyboard(target) {
  await js(`document.getElementById('speed').focus()`);
  const order = ['step', 'slow', 'normal'];
  let guard = 0;
  while ((await state()).speed !== target && guard < 5) {
    // ArrowUp goes toward Step; ArrowDown (not mapped above) goes toward Normal.
    await press('ArrowUp');
    guard += 1;
  }
  await js(`document.activeElement.blur()`);
  if ((await state()).speed !== target) throw new Error(`could not select ${target} (options ${order})`);
}
const levels = JSON.parse(await readFile(join(ROOT, 'data/levels.json'), 'utf8'));
const allWaves = levels.levels.flatMap((l) => l.waves);

// ---- the planner: plays the pure engine to find a flawless set of key presses --------------
function startSession(levelIndex, waveIndex) {
  let s = S.createSession({ ...levels });
  s = { ...s, speed: 'step', levelIndex, waveIndex };
  return S.proceed(s);
}
const STEP = { type: 'advance', ticks: 15, move: 0 };
function planFlawlessWave(levelIndex, waveIndex) {
  const wave = levels.levels[levelIndex].waves[waveIndex];
  const denied = new Set(wave.packets.filter((p) => evaluate(wave.acl, p).decision === 'deny').map((p) => p.id));
  let s = startSession(levelIndex, waveIndex);
  const keys = [];
  for (let guard = 0; guard < 400 && s.view === 'playing'; guard += 1) {
    const candidates = s.wave.packets
      .filter((p) => denied.has(p.id) && ['entering', 'formation', 'diving'].includes(p.status))
      .sort((a, b) => b.y - a.y);
    let done = false;
    for (const cand of candidates) {
      let t = s;
      const hops = Math.round((cand.x - t.wave.ship.x) / 50);
      const moves = [];
      for (let i = 0; i < Math.abs(hops); i += 1) {
        t = S.act(t, { type: 'hop', dir: Math.sign(hops) });
        moves.push(hops > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      t = S.act(t, { type: 'fire' });
      for (let i = 0; i < 4; i += 1) t = S.act(t, STEP);
      const hit = t.wave.packets.find((p) => p.id === cand.id);
      if (t.waveMistakes.length === s.waveMistakes.length && hit.resolution === 'shot') {
        keys.push(...moves, ' ', 'n', 'n', 'n', 'n');
        s = t;
        done = true;
        break;
      }
    }
    if (!done) {
      keys.push('n');
      s = S.act(s, STEP);
    }
  }
  return { keys, final: s };
}
async function mouseClick(selector) {
  // Scroll the target into view first, as a person would, then click its centre with real mouse events.
  const p = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(40);
}
// Step speed: hop under a sprite (by its x on the page), fire, and let the bullet travel.
async function shootAt(id) {
  const st = await state();
  const sprite = st.sprites.find((p) => p.id === id);
  if (!sprite) throw new Error(`no sprite ${id}`);
  const hops = Math.round((sprite.x - st.shipX) / 50);
  for (let i = 0; i < Math.abs(hops); i += 1) await press(hops > 0 ? 'ArrowRight' : 'ArrowLeft');
  await press(' ');
  for (let i = 0; i < 4; i += 1) await press('n');
}
async function replay(keys) {
  for (const k of keys) await press(k, 6);
}
async function doNothingUntilOver() {
  for (let guard = 0; guard < 400; guard += 1) {
    const s = await state();
    if (!s.gameVisible) return s;
    await press('n', 4);
  }
  throw new Error('wave did not end');
}

// ---- scenarios --------------------------------------------------------------------------
try {
  // S1: fresh start, briefing, sources
  await load('/');
  let s = await state();
  check('S1 fresh start shows the first briefing before any packets (AC1)', !s.gameVisible && /Level 1/.test(s.screenH2 ?? '') && s.sprites.length === 0, JSON.stringify(s.screenH2));
  const brief = await js(`(() => {
    const cards = [...document.querySelectorAll('#screen .card h3')].map((h) => h.textContent);
    const start = document.getElementById('btn-main').getBoundingClientRect();
    const words = document.querySelector('#screen .brief').innerText.split(/\\s+/).filter(Boolean).length;
    const longestParagraph = Math.max(0, ...[...document.querySelectorAll('#screen .brief p')].map((p) => p.innerText.split(/\\s+/).length));
    return { cards, startBottom: start.bottom, viewport: window.innerHeight, words, longestParagraph, scrolls: document.documentElement.scrollHeight > window.innerHeight };
  })()`);
  check('S1 the briefing is split into short cards with headings (not a wall of text)', brief.cards.length >= 3 && brief.cards.includes('Your job'), JSON.stringify(brief.cards));
  check('S1 the briefing is short: about 120 words, no long paragraph', brief.words <= 140 && brief.longestParagraph <= 35, JSON.stringify(brief));
  check('S1 on a 1366x768 laptop the whole briefing, including the Start button, is visible without scrolling', brief.startBottom <= brief.viewport, JSON.stringify(brief));
  check('S1 the briefing tells the player what to do in plain words and that mistakes do not stop the game', /Denied\? Shoot it/.test(s.screenText) && /Permitted\? Let it through/.test(s.screenText) && /never stops for a mistake/.test(s.screenText), s.screenText.slice(0, 200));
  check('S1 the briefing lists real sources behind a "Sources" control, with section and link (FR-022)', /Sources/.test(s.screenText) && /Cisco/.test(s.sourcesText ?? '') && /RFC 4632/.test(s.sourcesText ?? '') && /3\.1 Basic Concept/.test(s.sourcesText ?? '') && s.sourceLinks.some((l) => l.href === 'https://www.rfc-editor.org/rfc/rfc4632') && s.sourceLinks.every((l) => l.target === '_blank' && /noopener/.test(l.rel)) && !/TODO/.test(s.sourcesText ?? ''), JSON.stringify(s.sourceLinks));
  check('S1 health starts full (3 of 3, three hearts); focus is on the briefing heading', s.health === 'Health 3 of 3' && s.hearts === '♥♥♥' && s.active === 'H2', `${s.health} ${s.hearts} ${s.active}`);
  await screenshot('01-briefing');

  let passBannerBg = null;
  // S2: wave 1.1 at Step speed, hand-driven with the keyboard
  await press('Enter');
  s = await state();
  check('S2 Enter on the briefing starts wave 1.1 and focus moves to the playfield', s.gameVisible && /Wave 1\.1/.test(s.position) && s.active === 'field-heading', `${s.position} ${s.active}`);
  check('S2 the ACL shows 3 entries plus the implicit deny row', s.aclCount === 4, String(s.aclCount));
  await chooseSpeedByKeyboard('step');
  check('S2 Step speed can be chosen with the keyboard; the Advance button is enabled (AC14)', (await state()).disabled.step === false);
  for (let i = 0; i < 10; i += 1) await press('n');
  s = await state();
  check('S2 after 150 ticks all 8 packets are in the formation, each showing its headers', s.sprites.length === 8 && s.sprites.every((p) => /→/.test(p.text) && /(TCP|UDP|ICMP)/.test(p.text)), JSON.stringify(s.sprites.map((p) => p.text)));
  check('S2 the text mirror lists all 8 packets as in formation', s.mirror.length === 8 && s.mirror.every((l) => /in formation/.test(l)), JSON.stringify(s.mirror));
  await screenshot('02-formation');

  // AC2: shoot denied p4 (slot 3, x = 490): ship 350 -> 500 is 3 hops
  for (let i = 0; i < 3; i += 1) await press('ArrowRight');
  await press(' ');
  for (let i = 0; i < 4; i += 1) await press('n');
  s = await state();
  check('S2 shooting the denied packet p4 destroys it and health stays full (AC2)', !s.sprites.some((p) => p.id === 'p4') && s.health === 'Health 3 of 3', s.health);
  check('S2 the confirmation names entry 20 in text', /Correct/.test(s.feedback) && /Entry 20/.test(s.feedback), s.feedback);
  check('S2 the deciding ACL entry is highlighted', /^20 deny/.test(s.decider ?? ''), String(s.decider));
  const tickAfterGood = s.tick;

  // AC3: shoot permitted p5 (slot 4, x = 630): 3 more hops -> 650
  for (let i = 0; i < 3; i += 1) await press('ArrowRight');
  await press(' ');
  for (let i = 0; i < 4; i += 1) await press('n');
  s = await state();
  check('S2 shooting a permitted packet costs 1 health (AC3)', s.health === 'Health 2 of 3' && s.hearts === '♥♥♡', `${s.health} ${s.hearts}`);
  check('S2 the game did NOT pause: time advanced, controls are enabled, no review screen', s.tick > tickAfterGood && s.gameVisible && s.disabled.fire === false && s.pause === 'Pause', `${s.tick} ${s.pause}`);
  check('S2 a one-line mistake message names the deciding entry (entry 30 for p5) in text', /Mistake/.test(s.feedback) && /Entry 30/.test(s.feedback) && /permits/.test(s.feedback), s.feedback);
  check('S2 the mistake counter shows 1', /Mistakes this attempt: 1/.test(s.counts), s.counts);
  check('S2 the long explanation is NOT shown during play (it is saved for the review)', !/stops checking/.test(s.feedback) && /review/.test(s.feedback), s.feedback);
  await screenshot('03-mistake-in-play');

  // AC6: fire at a gap (x = 150 is between sprite columns)
  const before = await state();
  for (let i = 0; i < 10; i += 1) await press('ArrowLeft');
  await press(' ');
  for (let i = 0; i < 4; i += 1) await press('n');
  s = await state();
  check('S2 a bullet that hits nothing changes nothing (AC6)', s.health === before.health && s.feedback === before.feedback && s.bullets === 0, `${s.health} ${s.bullets}`);

  // At most 2 bullets in flight
  await press(' '); await press(' '); await press(' ');
  s = await state();
  check('S2 at most 2 bullets can be in the air at once', s.bullets === 2, String(s.bullets));
  for (let i = 0; i < 4; i += 1) await press('n');

  // A right decision gives 1 health back: shoot the denied packet p7
  const lowHealth = (await state()).health;
  await shootAt('p7');
  s = await state();
  check('S2 a correct decision gives 1 health back: 2 -> 3, shown as three hearts again', lowHealth === 'Health 2 of 3' && s.health === 'Health 3 of 3' && s.hearts === '♥♥♥' && /Correct/.test(s.feedback), `${lowHealth} -> ${s.health} ${s.hearts}`);

  // Hints while paused (AC7)
  await press('p');
  s = await state();
  check('S2 P pauses: time stops, the button says Resume, Hint is enabled, the playfield says PAUSED', s.pause === 'Resume' && s.disabled.hint === false, s.pause);
  const pausedTick = s.tick;
  await press('n'); await press(' ');
  check('S2 nothing moves while paused', (await state()).tick === pausedTick);
  await press('h'); const h1 = (await state()).feedback;
  await press('h'); const h2 = (await state()).feedback;
  await press('h'); const h3 = (await state()).feedback;
  check('S2 hint 1 explains the method; hint 2 is a worked step; hint 3 is the full solution (AC7)', /Hint 1 of 3/.test(h1) && /first entry/.test(h1) && /Hint 2 of 3/.test(h2) && /entry 10/.test(h2) && /Hint 3 of 3/.test(h3) && /(Shoot it|Let it pass)/.test(h3), `${h1} | ${h2} | ${h3}`);
  await press('p');

  // Finish the wave doing nothing more: p2 (denied) will leak
  s = await doNothingUntilOver();
  check('S2 the wave ends in a review screen, not a pause (AC9)', /Wave 1\.1 cleared/.test(s.screenH2 ?? ''), String(s.screenH2));
  check('S2 the results list one line per mistake: 1 wrong shot + 1 leak', s.reviewItems.length === 2 && s.reviewItems.some((t) => /You shot it/.test(t)) && s.reviewItems.filter((t) => /It got through/.test(t)).length === 1, JSON.stringify(s.reviewItems.map((t) => t.slice(0, 40))));
  check('S2 each line says what you did, what you should have done, and which entry decided it', s.reviewItems.every((t) => /(You shot it|It got through)/.test(t) && /Should have:/.test(t) && /Entry \d+ (permits|denies) it/.test(t)), s.reviewItems[0]);
  check('S2 the full explanation is inside each line (why earlier entries did not match, and a next step)', s.reviewFull.every((t) => /(does not match|is the first match)/.test(t) && /should have been/.test(t)), s.reviewFull[0]);
  check('S2 the wave summary is not presented as a clean run', /not a clean run/.test(s.screenText) && /Right\s*6 of 8/.test(s.screenText), s.screenText.slice(0, 200));
  check('S2 a cleared wave shows a green PASS banner with a check mark and the word cleared', /banner pass/.test(s.bannerClass ?? '') && s.bannerIcon === '✓' && /cleared/.test(s.screenH2 ?? ''), JSON.stringify([s.bannerClass, s.bannerIcon]));
  check('S2 the Next wave button is visible without scrolling', s.mainBottom !== null && s.mainBottom <= s.viewport, JSON.stringify([s.mainBottom, s.viewport]));
  check('S2 the mistake lines start collapsed and the sources start collapsed', s.openMiss === 0 && s.sourcesOpen === false, JSON.stringify([s.openMiss, s.sourcesOpen]));
  check('S2 the results page shows the wave\'s access list: all 3 entries and the implicit deny', s.aclRows.length === 4 && /^10 permit tcp any host 10\.0\.0\.5 eq 443/.test(s.aclRows[0]) && /^20 deny tcp any any eq 23/.test(s.aclRows[1]) && /^30 permit ip any any/.test(s.aclRows[2]) && /implicit deny/.test(s.aclRows[3]), JSON.stringify(s.aclRows));
  check('S2 the entries that caused mistakes are marked: entry 30 (the wrong shot) and entry 20 (the leak)', /✗ caused 1 mistake/.test(s.aclRows[1]) && /✗ caused 1 mistake/.test(s.aclRows[2]) && !/caused/.test(s.aclRows[0]), JSON.stringify(s.aclRows));
  check('S2 each mistake line shows the text of the rule that decided it', s.entryChips.length === 2 && s.entryChips.includes('30 permit ip any any') && s.entryChips.includes('20 deny tcp any any eq 23'), JSON.stringify(s.entryChips));
  check('S2 the access list sits beside the mistakes and is visible without scrolling', s.aclBox && s.missBox && s.aclBox.left > s.missBox.left && s.aclBox.top >= 0 && s.aclBox.bottom <= s.viewport, JSON.stringify([s.aclBox, s.missBox, s.viewport]));
  passBannerBg = s.bannerBg;
  await screenshot('04-wave-review');
  await mouseClick('#screen details.miss summary');
  s = await state();
  const expanded = await js(`(() => { const d = document.querySelector('#screen details.miss[open] .why'); return d ? { visible: d.getBoundingClientRect().height > 0, text: d.innerText } : null; })()`);
  check('S2 clicking a mistake line expands the full explanation', s.openMiss === 1 && expanded && expanded.visible && /should have been/.test(expanded.text), JSON.stringify(expanded));
  check('S2 opening a mistake line highlights its rule in the access list', s.openSeqs.length === 1 && s.hlSeqs.length === 1 && s.hlSeqs[0] === s.openSeqs[0], JSON.stringify([s.openSeqs, s.hlSeqs]));
  await screenshot('04b-wave-review-expanded');
  await mouseClick('#screen details.sources summary');
  s = await state();
  const sourcesVisible = await js(`(() => { const d = document.querySelector('#screen details.sources[open] ul'); return d ? { visible: d.getBoundingClientRect().height > 0, text: d.innerText } : null; })()`);
  check('S2 clicking Sources expands the sources (title, section, URL) for further reading', s.sourcesOpen && sourcesVisible && sourcesVisible.visible && /How ACLs work/.test(sourcesVisible.text) && s.sourceLinks.some((l) => l.href.startsWith('https://www.cisco.com/')) && /first match/i.test(sourcesVisible.text) && !/TODO/.test(sourcesVisible.text), JSON.stringify(sourcesVisible));
  await screenshot('04c-sources-open');

  // S3: a full perfect game, planned on the pure engine and replayed with real key presses
  await load('/');
  await press('Enter');
  await chooseSpeedByKeyboard('step');
  let perfect = true;
  const notes = [];
  for (let i = 0; i < allWaves.length; i += 1) {
    const plan = planFlawlessWave(Math.floor(i / 2), i % 2);
    const engineOk = plan.final.view === 'wave-summary' && plan.final.waveStats.mistakes === 0 && plan.final.waveStats.correct === 8;
    await replay(plan.keys);
    s = await state();
    const browserOk = /cleared/.test(s.screenH2 ?? '') && /Right\s*8 of 8/.test(s.screenText) && /Mistakes \(all attempts\)\s*0/.test(s.screenText) && /No mistakes\. A clean run\./.test(s.screenText);
    notes.push(`${allWaves[i].id}: ${plan.keys.length} keys, engine ${engineOk ? 'perfect' : 'NOT perfect'}, browser ${browserOk ? 'perfect' : 'NOT perfect'}`);
    if (!engineOk || !browserOk) perfect = false;
    if (i === 0) await screenshot('05-wave-clean');
    await press('Enter'); // next wave / finish level
    s = await state();
    if (/^Level \d cleared/.test(s.screenH2 ?? '')) {
      await press('Enter'); // next level / final summary
      s = await state();
      if (/^Level/.test(s.screenH2 ?? '') && !/cleared/.test(s.screenH2)) {
        await press('Enter');
        await chooseSpeedByKeyboard('step');
      }
    }
  }
  check('S3 all 6 waves (48 packets) can be played perfectly; the browser matches the engine on every wave', perfect, notes.join(' | '));
  s = await state();
  check('S3 a perfect keyboard-only game reaches the session summary (AC11)', /All waves cleared/.test(s.screenH2 ?? ''), String(s.screenH2));
  check('S3 the final summary shows 6 of 6 waves, 0 wrong shots, 0 leaks, 0 retries, 0 hints, separately, and says it is not proof of mastery', /Waves cleared\s*6 of 6/.test(s.screenText) && /Wrong shots\s*0/.test(s.screenText) && /Leaks\s*0/.test(s.screenText) && /Retries\s*0/.test(s.screenText) && /Hints\s*0/.test(s.screenText) && /not proof/.test(s.screenText) && /Play again/.test(s.screenText), s.screenText.slice(0, 300));
  await screenshot('06-session-summary');

  // S4: fail a wave for real (health 3 -> 0 with three wrong shots), retry, health restored, mistakes kept
  await load('/');
  await press('Enter');
  await chooseSpeedByKeyboard('step');
  for (let i = 0; i < 10; i += 1) await press('n');
  await shootAt('p5');
  s = await state();
  check('S4 wrong shot 1: health 2 of 3', s.health === 'Health 2 of 3', s.health);
  await shootAt('p6');
  s = await state();
  check('S4 wrong shot 2: health 1 of 3, one heart left, the game is still going', s.health === 'Health 1 of 3' && s.hearts === '♥♡♡' && s.gameVisible, `${s.health} ${s.hearts}`);
  await screenshot('07a-one-health-left');
  await shootAt('p8');
  s = await state();
  check('S4 health reaching 0 fails the wave at once, mid-wave (AC10)', /Wave 1\.1 failed/.test(s.screenH2 ?? '') && !s.gameVisible, `${s.screenH2}`);
  check('S4 the failed wave lists the 3 mistakes of that attempt, one line each', s.reviewItems.length === 3 && s.reviewItems.every((t) => /You shot it/.test(t) && /Should have: let it through/.test(t)), JSON.stringify(s.reviewItems.map((t) => t.slice(0, 30))));
  check('S4 it says a retry starts on 3 of 3 and earlier mistakes stay counted', /Retry starts you on 3 of 3/.test(s.screenText) && /stay counted/.test(s.screenText), s.screenText.slice(0, 220));
  check('S4 a failed wave shows a red FAIL banner with a cross and the word failed', /banner fail/.test(s.bannerClass ?? '') && s.bannerIcon === '✗' && /failed/.test(s.screenH2 ?? ''), JSON.stringify([s.bannerClass, s.bannerIcon, s.screenH2]));
  check('S4 pass and fail are different in words, icon, and background colour (never colour alone)', passBannerBg && s.bannerBg && passBannerBg !== s.bannerBg && s.bannerIcon !== '✓', `pass ${passBannerBg} vs fail ${s.bannerBg}`);
  check('S4 the Retry button is visible without scrolling even with 3 mistakes listed', s.mainBottom !== null && s.mainBottom <= s.viewport, JSON.stringify([s.mainBottom, s.viewport]));
  check('S4 the failed wave also shows the access list, with the entry that caused the 3 mistakes (the catch-all, entry 30) marked', s.aclRows.length === 4 && /✗ caused 3 mistakes/.test(s.aclRows[2]) && !/caused/.test(s.aclRows[0]) && !/caused/.test(s.aclRows[1]), JSON.stringify(s.aclRows));
  check('S4 each of the 3 lines says what to do instead and which entry decided it, at a glance', s.reviewItems.every((t) => /Entry \d+ permits it/.test(t)), JSON.stringify(s.reviewItems.map((t) => t.slice(0, 60))));
  await screenshot('07-wave-failed');
  await press('Enter');
  s = await state();
  check('S4 Retry restarts only that wave at time 0 with health restored to 3 of 3', /Wave 1\.1/.test(s.position) && s.health === 'Health 3 of 3' && s.tick === 0, `${s.position} ${s.health} ${s.tick}`);
  const retryPlan = planFlawlessWave(0, 0);
  await replay(retryPlan.keys);
  s = await state();
  check('S4 the retried wave finishes with 1 retry and the 3 earlier mistakes still counted', /Retries\s*1/.test(s.screenText) && /Mistakes \(all attempts\)\s*3/.test(s.screenText) && /8 of 8/.test(s.screenText), s.screenText.slice(0, 260));

  // S5: restart with Escape and Confirm (AC12)
  await load('/');
  await press('Enter');
  await chooseSpeedByKeyboard('step');
  await press('n');
  await js(`document.getElementById('btn-restart').focus()`);
  await press('Enter');
  s = await state();
  check('S5 Restart opens a confirmation dialog', s.dialogOpen, String(s.dialogOpen));
  const tickWhileOpen = s.tick;
  await press('n');
  check('S5 time does not advance while the dialog is open', (await state()).tick === tickWhileOpen);
  await press('Escape', 50);
  s = await state();
  check('S5 Escape cancels: session preserved, focus back on Restart', !s.dialogOpen && s.tick === tickWhileOpen && s.active === 'btn-restart', JSON.stringify([s.dialogOpen, s.tick, s.active]));
  await press('Enter');
  await js(`document.querySelector('[data-action="confirm-restart"]').click()`);
  s = await state();
  check('S5 Confirm returns to the first briefing and clears the session', !s.gameVisible && /Level 1/.test(s.screenH2 ?? '') && s.health === 'Health 3 of 3', JSON.stringify([s.screenH2, s.health]));

  // S6: real-time play: the clock runs by itself, held keys move the ship, Space fires, P pauses
  await load('/');
  await press('Enter');
  s = await state();
  check('S6 the default speed is Normal', s.speed === 'normal', s.speed);
  const t0 = s.tick;
  await sleep(1200);
  const t1 = (await state()).tick;
  check('S6 at Normal the simulation runs by itself at about 60 ticks per second', t1 - t0 >= 55 && t1 - t0 <= 90, `${t1 - t0} ticks in 1.2 s`);
  await chooseSpeedByKeyboard('slow');
  const u0 = (await state()).tick;
  await sleep(1200);
  const u1 = (await state()).tick;
  check('S6 at Slow it runs at about 30 ticks per second', u1 - u0 >= 25 && u1 - u0 <= 48, `${u1 - u0} ticks in 1.2 s`);
  await keyDown('ArrowRight');
  await sleep(700);
  const moving = await state();
  await keyUp('ArrowRight');
  await sleep(60);
  const stopped1 = await state();
  await sleep(300);
  const stopped2 = await state();
  check('S6 holding Right moves the ship continuously; releasing stops it', moving.shipX > 350 + 40 && stopped2.shipX === stopped1.shipX && stopped2.shipX >= moving.shipX, `${moving.shipX} -> ${stopped2.shipX}`);
  await keyDown('Space'.length ? ' ' : ' ');
  await keyUp(' ');
  await sleep(100);
  check('S6 Space fires a bullet in real time', (await state()).bullets >= 1, String((await state()).bullets));
  await press('p');
  const pa = await state();
  await sleep(500);
  check('S6 pausing stops time and the ship', (await state()).tick === pa.tick && pa.pause === 'Resume');
  await press('p');
  await screenshot('08-real-time');
  await chooseSpeedByKeyboard('step');
  const stepTick = (await state()).tick;
  await sleep(500);
  check('S6 in Step speed nothing moves until the player advances time', (await state()).tick === stepTick);

  // S6b: regression for the focus bug. After clicking a button with the mouse, Space must still FIRE,
  // not press that button again. Real mouse events.
  await load('/');
  await press('Enter');
  await mouseClick('#btn-pause');
  s = await state();
  check('S6b a mouse click on Pause pauses the game', s.pause === 'Resume', s.pause);
  await mouseClick('#btn-pause');
  s = await state();
  const tickAfterResume = s.tick;
  check('S6b a mouse click on Resume resumes the game', s.pause === 'Pause', s.pause);
  check('S6b after the click the playfield has focus, not the Pause button', s.active === 'field-heading', s.active);
  await press(' ');
  await sleep(60);
  s = await state();
  check('S6b pressing Space after un-pausing with the mouse FIRES and does not pause again', s.pause === 'Pause' && s.bullets >= 1 && s.tick > tickAfterResume, `pause=${s.pause} bullets=${s.bullets}`);
  const shipBefore = (await state()).shipX;
  await mouseClick('[data-action="hop-right"]');
  const shipAfterHop = (await state()).shipX;
  await press(' ');
  s = await state();
  check('S6b the same holds for the move buttons: a click hops once, then Space fires instead of hopping again', shipAfterHop === shipBefore + 50 && s.shipX >= shipAfterHop && s.shipX < shipAfterHop + 50 + 60 && s.bullets >= 1, `${shipBefore} -> ${shipAfterHop} -> ${s.shipX}, bullets ${s.bullets}`);
  await mouseClick('#btn-pause');
  await mouseClick('#btn-hint');
  await mouseClick('#btn-pause');
  await press(' ');
  s = await state();
  check('S6b and after using Hint with the mouse', s.pause === 'Pause', s.pause);
  // A speed change made with the pointer (no key press) also hands focus back to the playfield.
  await sleep(400); // a person cannot reach the menu with the mouse within a few milliseconds of a key press
  await js(`(() => { const sp = document.getElementById('speed'); sp.focus(); sp.value = 'slow'; sp.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(250);
  s = await state();
  check('S6b a speed change made with the pointer hands focus back to the playfield', s.active === 'field-heading', s.active);

  // S12: sound. Measured on the real audio output (an analyser after the master volume), not just "a sound was requested".
  const audioStats = () => js('window.__permitOrPew.audio.stats()');
  const peakNow = () => js('window.__permitOrPew.audio.peak()');
  const loudest = async (ms) => {
    let best = 0;
    const end = Date.now() + ms;
    while (Date.now() < end) { best = Math.max(best, await peakNow()); await sleep(25); }
    return best;
  };
  await load('/');
  let au = await audioStats();
  check('S12 before any key press there is no audio yet (browsers require a user action first)', au.state === 'none' && au.music === 'off', JSON.stringify(au));
  await press('Enter');
  await sleep(400);
  au = await audioStats();
  check('S12 after the first key press the audio is running and the level 1 music is playing', au.state === 'running' && au.music === 'level-1', JSON.stringify(au));
  const musicPeak = await loudest(500);
  check('S12 the music is really audible on the output (not silent)', musicPeak > 0.01, 'peak ' + musicPeak.toFixed(4));
  const playedBefore = au.played;
  await press(' ');
  await sleep(40);
  au = await audioStats();
  check('S12 firing plays the fire sound', au.played > playedBefore && au.lastSound === 'fire', JSON.stringify(au));
  await press('m');
  await sleep(150);
  au = await audioStats();
  const mutedPeak = await loudest(400);
  s = await state();
  const soundLabel = await js("document.getElementById('btn-sound').textContent");
  check('S12 M mutes: the button says Sound: off, and the real output is silent even though the music keeps its place', au.muted && soundLabel === 'Sound: off' && mutedPeak < 0.003, JSON.stringify([au.muted, soundLabel, mutedPeak.toFixed(5)]));
  const playedMuted = au.played;
  await press(' ');
  await sleep(40);
  check('S12 while muted, effects are not played', (await audioStats()).played === playedMuted);
  await press('m');
  await sleep(150);
  const backPeak = await loudest(500);
  check('S12 M again turns sound back on, and the output is audible again', !(await audioStats()).muted && backPeak > 0.01 && (await js("document.getElementById('btn-sound').textContent")) === 'Sound: on', 'peak ' + backPeak.toFixed(4));
  await press('p');
  await sleep(150);
  au = await audioStats();
  check('S12 pausing stops the music, and resuming starts it again', au.music === 'off');
  await press('p');
  await sleep(150);
  check('S12 resuming brings the music back', (await audioStats()).music === 'level-1');
  await mouseClick('#btn-sound');
  s = await state();
  const afterClickMuted = (await audioStats()).muted;
  const playedAfterClick = (await audioStats()).played;
  await press(' ');
  await sleep(40);
  s = await state();
  check('S12 after clicking Sound with the mouse, Space still fires (focus returns to the playfield) and the game is muted', afterClickMuted && s.active === 'field-heading' && s.bullets >= 1 && (await audioStats()).played === playedAfterClick, JSON.stringify([afterClickMuted, s.active, s.bullets]));
  await mouseClick('#btn-sound'); // unmute again
  await js(`(() => { const v = document.getElementById('volume'); v.value = 0; v.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  const zeroPeak = await loudest(300);
  check('S12 the volume slider at 0 silences the output', zeroPeak < 0.003 && (await audioStats()).volume === 0, 'peak ' + zeroPeak.toFixed(5));
  await js(`(() => { const v = document.getElementById('volume'); v.value = 60; v.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await chooseSpeedByKeyboard('step');
  await sleep(200);
  check('S12 in Step speed nothing moves, so there is no music', (await audioStats()).music === 'off');
  await screenshot('10-sound-controls');

  // S7: narrow window and reduced motion
  await load('/');
  await press('Enter');
  await chooseSpeedByKeyboard('step');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(200);
  for (let i = 0; i < 10; i += 1) await press('n');
  for (let i = 0; i < 3; i += 1) await press('ArrowRight');
  await press(' ');
  for (let i = 0; i < 4; i += 1) await press('n');
  await screenshot('09-narrow-reduced-motion');
  const layout = await js(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const scroll = document.getElementById('acl-scroll');
    const fx = document.querySelector('.fx');
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      aclScrolls: getComputedStyle(scroll).overflowY === 'auto' && getComputedStyle(scroll).maxHeight !== 'none',
      aclAbovePlayfield: r('#acl-panel').bottom <= r('#field-panel').top + 1,
      fieldWidth: r('#field').width,
      fxHidden: fx ? getComputedStyle(fx).display === 'none' : 'no-effect-on-screen',
      hasFireButton: !!document.querySelector('[data-action="fire"]'),
    };
  })()`);
  check('S7 narrow 375px window: no horizontal page scroll', layout.overflowX <= 1, JSON.stringify(layout));
  check('S7 narrow window: ACL stacks above the playfield in its own scroll box', layout.aclScrolls && layout.aclAbovePlayfield, JSON.stringify(layout));
  check('S7 narrow window: the playfield scales to fit and Fire is still available', layout.fieldWidth <= 375 && layout.hasFireButton, JSON.stringify(layout));
  check('S7 reduced motion removes the decorative hit rings', layout.fxHidden === true || layout.fxHidden === 'no-effect-on-screen', JSON.stringify(layout));
  await send('Emulation.setDeviceMetricsOverride', LAPTOP);
  await send('Emulation.setEmulatedMedia', { features: [] });

  // S8: accessibility basics
  await load('/');
  await press('Enter');
  await chooseSpeedByKeyboard('step');
  for (let i = 0; i < 10; i += 1) await press('n');
  const names = await js(`(() => {
    const controls = [...document.querySelectorAll('button, select, [role="region"][tabindex]')];
    const nameOf = (el) => (el.getAttribute('aria-label') || el.innerText || el.labels?.[0]?.innerText || '').trim();
    return {
      unnamed: controls.filter((c) => !nameOf(c)).map((c) => c.outerHTML.slice(0, 60)),
      count: controls.length,
      healthShown: /Health \\d of \\d/.test(document.getElementById('health-text').textContent),
      svgNamed: !!document.getElementById('field').getAttribute('aria-labelledby'),
      langSet: document.documentElement.lang === 'en',
      liveRegion: document.getElementById('feedback').getAttribute('aria-live'),
    };
  })()`);
  check('S8 every button, menu, and scroll region has an accessible name (AC13)', names.unnamed.length === 0 && names.count >= 9, JSON.stringify(names));
  check('S8 health is shown as text; the playfield picture is labelled; the page language is set; feedback is a live region (AC16)', names.healthShown && names.svgNamed && names.langSet && names.liveRegion === 'polite', JSON.stringify(names));
  s = await state();
  check('S8 state is also shown as text: health, ship position, and every packet status (AC15)', /Health \d of \d/.test(s.health) && s.mirror.length === 8 && s.mirror.every((l) => /(in formation|flying|diving|waiting|dropped|let through)/.test(l)), JSON.stringify(s.mirror.slice(0, 2)));

  // S9: bad content shows a content error and starts nothing
  await send('Fetch.enable', { patterns: [{ urlPattern: '*levels.json*' }] });
  rewriteLevels = (doc) => {
    doc.levels[0].waves[0].packets[2] = { ...doc.levels[0].waves[0].packets[2], protocol: 'icmp', port: 7 };
    return doc;
  };
  await load('/');
  s = await state();
  check('S9 invalid content shows an error naming the wave and starts nothing (FR-021)', /content has errors/.test(s.screenH2 ?? '') && /1\.1/.test(s.screenText) && !s.gameVisible && s.sprites.length === 0, s.screenText);
  check('S9 the controls are disabled on the error screen', Object.values(s.disabled).every(Boolean), JSON.stringify(s.disabled));
  rewriteLevels = null;
  await send('Fetch.disable');

  // S9b: if the game cannot start (for example an old cached file that no longer matches), the page says so.
  await send('Fetch.enable', { patterns: [{ urlPattern: '*feedback.js*' }] });
  rewriteModule = { path: '/engine/feedback.js', body: 'export const nothingElse = 1;' };
  await load('/');
  await sleep(700);
  s = await state();
  check('S9b if a module cannot load, the page says "The game did not start" instead of staying on Loading…', /did not start/.test(s.screenH2 ?? '') && s.position === 'Loading…', JSON.stringify([s.screenH2, s.position]));
  check('S9b and it says how to fix it: Ctrl+Shift+R, or py serve.py', /Ctrl\+Shift\+R/.test(s.screenText) && /py serve\.py/.test(s.screenText), s.screenText.slice(0, 260));
  rewriteModule = null;
  await send('Fetch.disable');
  consoleProblems.length = 0; // that run produced the deliberate module error above, which is the point of the check

  // S10: the in-browser test runner
  await load('/tests/');
  await sleep(800);
  const runner = await js(`document.getElementById('summary').textContent`);
  check('S10 the browser test runner reports a pass', /^PASS: \d+ of \d+/.test(runner), runner);
  console.log('      ' + runner);

  check('No console errors or exceptions during the whole run', consoleProblems.length === 0, consoleProblems.join(' | '));
} catch (error) {
  check('The check script itself ran to the end', false, error.stack);
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed. Screenshots: ${shots}`);
  ws.close();
  chrome.kill();
  server.close();
  process.exit(failed.length ? 1 : 0);
}
