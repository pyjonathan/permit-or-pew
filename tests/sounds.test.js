import { test, assert, assertEqual } from './harness.js';
import { SOUND_NAMES, SFX, TRACKS, noteFrequency, buildTrack, stepSeconds, trackSeconds } from '../ui/sounds.js';

// Pure sound data: note frequencies, effect recipes, and the music for each level. The audio layer
// (ui/audio.js) only plays what is described here, so the data can be checked without a speaker.

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

test('sounds/note frequencies follow equal temperament: A4 = 440 Hz, C4 about 261.63 Hz, an octave doubles', () => {
  assert(close(noteFrequency('A4'), 440), String(noteFrequency('A4')));
  assert(close(noteFrequency('C4'), 261.63, 0.02), String(noteFrequency('C4')));
  assert(close(noteFrequency('A5') / noteFrequency('A4'), 2, 1e-9), 'octave');
  assert(close(noteFrequency('C#4'), noteFrequency('Db4'), 1e-9), 'sharps and flats agree');
  assert(close(noteFrequency('G#4'), 415.30, 0.02), String(noteFrequency('G#4')));
});

test('sounds/an invalid note name is rejected', () => {
  let threw = false;
  try { noteFrequency('H9'); } catch { threw = true; }
  assert(threw, 'should throw');
});

test('sounds/the sound names are exactly the ones the game reports', () => {
  assertEqual([...SOUND_NAMES].sort(), ['delivered', 'fire', 'hint', 'hit-correct', 'hit-wrong', 'leak', 'pause', 'resume', 'wave-cleared', 'wave-failed', 'wave-start']);
});

test('sounds/every sound has a recipe, and every recipe is audible, short, and not too loud', () => {
  for (const name of SOUND_NAMES) {
    const recipe = SFX[name];
    assert(recipe && recipe.length > 0, `${name} has no recipe`);
    for (const seg of recipe) {
      assert(['square', 'triangle', 'sawtooth', 'sine'].includes(seg.wave), `${name}: wave ${seg.wave}`);
      assert(seg.f0 >= 40 && seg.f0 <= 8000 && (seg.f1 === undefined || (seg.f1 >= 40 && seg.f1 <= 8000)), `${name}: frequency out of range`);
      assert(seg.dur > 0 && seg.dur <= 0.6, `${name}: duration ${seg.dur}`);
      assert(seg.at >= 0 && seg.at + seg.dur <= 1.2, `${name}: ends too late`);
      assert(seg.gain > 0 && seg.gain <= 0.4, `${name}: gain ${seg.gain} (keep it low so overlapping sounds do not clip)`);
    }
  }
});

test('sounds/a mistake sounds clearly different from a correct decision (not just a different pitch)', () => {
  const bad = SFX['hit-wrong'][0];
  const good = SFX['hit-correct'][0];
  assert(bad.wave !== good.wave, 'different waveform');
  assert(Math.max(bad.f0, bad.f1 ?? 0) < Math.min(good.f0, good.f1 ?? good.f0), 'the mistake is lower than the correct hit');
});

test('sounds/the cleared jingle goes up and the failed jingle goes down', () => {
  const rising = SFX['wave-cleared'].map((s) => s.f0);
  const falling = SFX['wave-failed'].map((s) => s.f0);
  assertEqual(rising, [...rising].sort((a, b) => a - b));
  assertEqual(falling, [...falling].sort((a, b) => b - a));
});

test('sounds/there is one tune for each of the three levels', () => {
  assertEqual(TRACKS.length, 3);
  assertEqual(TRACKS.map((t) => t.id), ['level-1', 'level-2', 'level-3']);
  assert(TRACKS[0].bpm < TRACKS[1].bpm && TRACKS[1].bpm < TRACKS[2].bpm, 'each level is faster');
});

test('sounds/each tune is 8 bars of eighth notes: lead, bass, every note valid, nothing out of range', () => {
  for (const track of TRACKS) {
    const { steps, lengthBeats } = buildTrack(track);
    assertEqual(lengthBeats, 32, `${track.id}: 8 bars of 4 beats`);
    const lead = steps.filter((s) => s.voice === 'lead');
    const bass = steps.filter((s) => s.voice === 'bass');
    assertEqual(lead.length, 64, `${track.id}: 8 eighth notes per bar`);
    assertEqual(bass.length, 16, `${track.id}: 2 bass notes per bar`);
    for (const st of steps) {
      assert(st.freq >= 60 && st.freq <= 2000, `${track.id}: ${st.freq} Hz`);
      assert(st.beat >= 0 && st.beat + st.beats <= lengthBeats + 1e-9, `${track.id}: note runs past the end`);
    }
  }
});

test('sounds/the bass plays the root of each bar\'s chord', () => {
  const track = TRACKS[0];
  const { steps } = buildTrack(track);
  const bass = steps.filter((s) => s.voice === 'bass');
  track.bars.forEach(([root], bar) => {
    for (const st of bass.filter((b) => Math.floor(b.beat / 4) === bar)) assert(close(st.freq, noteFrequency(root), 1e-6), `bar ${bar}`);
  });
});

test('sounds/the tune loops cleanly: its length in seconds is bars x beats x 60 / bpm', () => {
  for (const track of TRACKS) assert(close(trackSeconds(track, 1), (32 * 60) / track.bpm, 1e-9), track.id);
});

test('sounds/a slower speed stretches the music (longer steps), a faster one shortens it', () => {
  const track = TRACKS[1];
  assert(close(stepSeconds(track, 1), 60 / track.bpm / 2, 1e-9), 'an eighth note is half a beat');
  assert(stepSeconds(track, 0.75) > stepSeconds(track, 1), 'slower speed, longer step');
  assert(close(stepSeconds(track, 0.5), stepSeconds(track, 1) * 2, 1e-9), 'half speed doubles it');
});

test('sounds/the same data always builds the same tune (no randomness)', () => {
  assertEqual(buildTrack(TRACKS[2]), buildTrack(TRACKS[2]));
});
