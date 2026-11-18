// Sound data for the game: note frequencies, the recipe for each sound effect, and the music for each
// level. Pure data and pure functions, no audio API, so it can be checked in Node. ui/audio.js plays it.
//
// To change how the game sounds, edit the numbers here: every volume ("gain"), pitch ("f0"/"f1" in Hz),
// and length ("dur" in seconds) is in one place. Keep gains low (at most 0.4) so overlapping sounds do not
// distort.

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency in Hz for a note name such as "A4", "C#4", or "Db3" (equal temperament, A4 = 440 Hz). */
export function noteFrequency(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note name: ${name}`);
  const [, letter, accidental, octave] = m;
  const midi = 12 * (Number(octave) + 1) + SEMITONES[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// ---- sound effects -----------------------------------------------------------------------------------------
// Each effect is a list of short tones: { wave, f0 (start Hz), f1 (optional end Hz, a glide), at (seconds
// after the sound starts), dur (seconds), gain }.

export const SFX = {
  // you fired: a short falling "pew"
  fire: [{ wave: 'square', f0: 880, f1: 220, at: 0, dur: 0.09, gain: 0.12 }],
  // you shot a packet you should shoot: a bright rising pop
  'hit-correct': [
    { wave: 'triangle', f0: 500, f1: 1100, at: 0, dur: 0.1, gain: 0.2 },
    { wave: 'square', f0: 1500, at: 0.08, dur: 0.08, gain: 0.08 },
  ],
  // you shot a packet you should have let through: a low harsh buzz (clearly not the happy pop)
  'hit-wrong': [{ wave: 'sawtooth', f0: 160, f1: 90, at: 0, dur: 0.3, gain: 0.22 }],
  // a packet you should let through reached the network: a soft double ding
  delivered: [
    { wave: 'sine', f0: 880, at: 0, dur: 0.12, gain: 0.15 },
    { wave: 'sine', f0: 1320, at: 0.06, dur: 0.12, gain: 0.1 },
  ],
  // a packet you should have shot got through: a falling alarm
  leak: [
    { wave: 'sawtooth', f0: 400, f1: 110, at: 0, dur: 0.35, gain: 0.22 },
    { wave: 'square', f0: 90, at: 0.05, dur: 0.3, gain: 0.12 },
  ],
  'wave-start': [
    { wave: 'square', f0: 523.25, at: 0, dur: 0.08, gain: 0.14 },
    { wave: 'square', f0: 659.25, at: 0.08, dur: 0.08, gain: 0.14 },
    { wave: 'square', f0: 783.99, at: 0.16, dur: 0.12, gain: 0.14 },
  ],
  // wave cleared: a rising arpeggio
  'wave-cleared': [
    { wave: 'square', f0: 523.25, at: 0, dur: 0.12, gain: 0.16 },
    { wave: 'square', f0: 659.25, at: 0.12, dur: 0.12, gain: 0.16 },
    { wave: 'square', f0: 783.99, at: 0.24, dur: 0.12, gain: 0.16 },
    { wave: 'triangle', f0: 1046.5, at: 0.36, dur: 0.3, gain: 0.2 },
  ],
  // wave failed: a falling, gloomy line
  'wave-failed': [
    { wave: 'sawtooth', f0: 392, at: 0, dur: 0.18, gain: 0.16 },
    { wave: 'sawtooth', f0: 329.63, at: 0.18, dur: 0.18, gain: 0.16 },
    { wave: 'sawtooth', f0: 261.63, at: 0.36, dur: 0.18, gain: 0.16 },
    { wave: 'sawtooth', f0: 196, at: 0.54, dur: 0.4, gain: 0.18 },
  ],
  pause: [{ wave: 'triangle', f0: 440, f1: 330, at: 0, dur: 0.09, gain: 0.12 }],
  resume: [{ wave: 'triangle', f0: 330, f1: 440, at: 0, dur: 0.09, gain: 0.12 }],
  hint: [
    { wave: 'sine', f0: 1000, at: 0, dur: 0.08, gain: 0.12 },
    { wave: 'sine', f0: 1250, at: 0.09, dur: 0.08, gain: 0.12 },
  ],
};

/** The sound moments the game can report (see engine/state.js). */
export const SOUND_NAMES = Object.keys(SFX);

// ---- music -------------------------------------------------------------------------------------------------
// One tune per level: 8 bars of 4 beats. Each bar is a chord: [bass root, [three notes the lead arpeggiates]].
// The lead plays eight eighth notes per bar following the pattern (indexes into the chord); the first four
// bars use patterns[0], the last four use patterns[1]. The bass plays the root on beats 1 and 3.
// Each level is faster than the last, and in a darker key.

export const TRACKS = [
  {
    id: 'level-1', // C major
    bpm: 128,
    patterns: [[0, 1, 2, 1, 0, 1, 2, 1], [2, 1, 0, 1, 2, 2, 1, 0]],
    bars: [
      ['C3', ['C4', 'E4', 'G4']], ['G2', ['B3', 'D4', 'G4']], ['A2', ['C4', 'E4', 'A4']], ['F2', ['C4', 'F4', 'A4']],
      ['C3', ['C4', 'E4', 'G4']], ['F2', ['C4', 'F4', 'A4']], ['G2', ['B3', 'D4', 'G4']], ['C3', ['C4', 'E4', 'G4']],
    ],
  },
  {
    id: 'level-2', // A minor
    bpm: 140,
    patterns: [[0, 1, 2, 1, 0, 1, 2, 1], [2, 1, 0, 2, 1, 0, 1, 2]],
    bars: [
      ['A2', ['C4', 'E4', 'A4']], ['F2', ['C4', 'F4', 'A4']], ['C3', ['C4', 'E4', 'G4']], ['G2', ['B3', 'D4', 'G4']],
      ['A2', ['C4', 'E4', 'A4']], ['F2', ['C4', 'F4', 'A4']], ['G2', ['B3', 'D4', 'G4']], ['E3', ['B3', 'E4', 'G#4']],
    ],
  },
  {
    id: 'level-3', // E minor, the fastest and most driving
    bpm: 152,
    patterns: [[0, 2, 1, 2, 0, 2, 1, 2], [2, 2, 1, 0, 2, 2, 1, 0]],
    bars: [
      ['E2', ['B3', 'E4', 'G4']], ['C3', ['C4', 'E4', 'G4']], ['G2', ['B3', 'D4', 'G4']], ['D3', ['A3', 'D4', 'F#4']],
      ['E2', ['B3', 'E4', 'G4']], ['C3', ['C4', 'E4', 'G4']], ['D3', ['A3', 'D4', 'F#4']], ['B2', ['B3', 'D#4', 'F#4']],
    ],
  },
];

const BEATS_PER_BAR = 4;

/** Seconds for one eighth note at a speed factor (1 = the tune's own tempo, 0.75 = slower). */
export function stepSeconds(track, speed = 1) {
  return 60 / (track.bpm * speed) / 2;
}

/** Seconds the whole loop lasts at a speed factor. */
export function trackSeconds(track, speed = 1) {
  return (track.bars.length * BEATS_PER_BAR * 60) / (track.bpm * speed);
}

/** The notes of one loop: [{ beat, beats, freq, voice }] and the loop's length in beats. */
export function buildTrack(track) {
  const steps = [];
  track.bars.forEach(([root, chord], bar) => {
    const pattern = track.patterns[bar < 4 ? 0 : 1];
    const start = bar * BEATS_PER_BAR;
    pattern.forEach((index, i) => steps.push({ beat: start + i * 0.5, beats: 0.5, freq: noteFrequency(chord[index]), voice: 'lead' }));
    for (const offset of [0, 2]) steps.push({ beat: start + offset, beats: 1.5, freq: noteFrequency(root), voice: 'bass' });
  });
  return { steps, lengthBeats: track.bars.length * BEATS_PER_BAR };
}
