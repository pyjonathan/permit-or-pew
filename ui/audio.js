// Plays the game's sound with the Web Audio API: effects and a looping tune for each level. Everything is
// synthesized in the browser from the data in ui/sounds.js (no sound files, nothing to download).
//
// Browsers only allow sound after the player has done something (a key press or a click), so the audio
// context is created by unlock(), which the controls call on the first key press or click. Sound is only
// ever an extra layer: every fact it carries is also shown as text.
import { SFX, TRACKS, buildTrack } from './sounds.js';

const MUSIC_LEVEL = 0.3; // how loud the music is next to the effects
const LOOKAHEAD = 0.15; // seconds of music scheduled ahead of the clock
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createAudio({ AudioContextClass } = {}) {
  const Ctx = AudioContextClass ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let analyser = null;
  let samples = null;
  let muted = false;
  let volume = 0.6;
  let played = 0;
  let lastSound = null;
  let wanted = { index: null, speed: 1 }; // what the game wants playing, applied once audio is unlocked
  const music = { index: null, speed: 1, steps: [], length: 0, bus: null, timer: null, cursor: 0, loopStart: 0 };

  function build() {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    sfxBus = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    samples = new Uint8Array(analyser.fftSize);
    sfxBus.connect(master);
    master.connect(analyser); // measured after the master volume, so a muted game measures as silent
    analyser.connect(ctx.destination);
  }

  /** Call from a user action (key press or click). Creates the audio context and lets it start. */
  function unlock() {
    if (!Ctx) return false;
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    if (wanted.index !== null && music.index === null) startMusic(wanted.index, wanted.speed);
    return true;
  }

  function tone(bus, wave, f0, f1, start, dur, gain) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, start);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Play a named sound effect. Returns true if it was scheduled. */
  function play(name) {
    const recipe = SFX[name];
    if (!recipe || !ctx || muted) return false;
    const t = ctx.currentTime + 0.005;
    for (const seg of recipe) tone(sfxBus, seg.wave, seg.f0, seg.f1, t + seg.at, seg.dur, seg.gain);
    played += 1;
    lastSound = name;
    return true;
  }

  // ---- music: a small look-ahead scheduler, so notes are queued on the audio clock, not on a timer ----
  function pump() {
    const track = TRACKS[music.index];
    const beatSeconds = 60 / (track.bpm * music.speed);
    for (;;) {
      const step = music.steps[music.cursor];
      const when = music.loopStart + step.beat * beatSeconds;
      if (when > ctx.currentTime + LOOKAHEAD) break;
      const dur = step.beats * beatSeconds * 0.9;
      if (step.voice === 'lead') tone(music.bus, 'square', step.freq, undefined, when, dur, 0.07);
      else tone(music.bus, 'triangle', step.freq, undefined, when, dur, 0.12);
      music.cursor += 1;
      if (music.cursor >= music.steps.length) {
        music.cursor = 0;
        music.loopStart += music.length * beatSeconds;
      }
    }
  }

  function stopMusic() {
    if (music.timer !== null) clearInterval(music.timer);
    music.timer = null;
    if (music.bus && ctx) {
      const old = music.bus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.03); // quick fade so notes already queued do not blare
      setTimeout(() => old.disconnect(), 400);
    }
    music.bus = null;
    music.index = null;
  }

  function startMusic(index, speed) {
    stopMusic();
    const built = buildTrack(TRACKS[index]);
    music.index = index;
    music.speed = speed;
    music.steps = [...built.steps].sort((a, b) => a.beat - b.beat);
    music.length = built.lengthBeats;
    music.cursor = 0;
    music.loopStart = ctx.currentTime + 0.05;
    music.bus = ctx.createGain(); // a fresh bus each time, so a stopped tune can never leak into the next
    music.bus.gain.value = MUSIC_LEVEL;
    music.bus.connect(master);
    music.timer = setInterval(pump, 25);
    pump();
  }

  /** Ask for a level's tune (0, 1, 2) at a tempo factor, or null for silence. Safe to call every frame. */
  function setMusic(index, speed = 1) {
    wanted = { index, speed };
    if (!ctx) return; // applied by unlock() once the player has done something
    if (index === null) {
      if (music.index !== null) stopMusic();
    } else if (music.index !== index || music.speed !== speed) {
      startMusic(index, speed);
    }
  }

  function applyVolume() {
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.01);
  }

  function setMuted(value) {
    muted = Boolean(value);
    applyVolume();
  }

  function setVolume(value) {
    volume = clamp(value, 0, 1);
    applyVolume();
  }

  /** Current output level from 0 (silence) to 1, measured after the master volume. */
  function peak() {
    if (!ctx) return 0;
    analyser.getByteTimeDomainData(samples);
    let max = 0;
    for (const v of samples) max = Math.max(max, Math.abs(v - 128));
    return max / 128;
  }

  function stats() {
    return {
      state: ctx ? ctx.state : 'none',
      muted,
      volume,
      music: music.index === null ? 'off' : TRACKS[music.index].id,
      played,
      lastSound,
    };
  }

  return { unlock, play, setMusic, setMuted, setVolume, peak, stats };
}
