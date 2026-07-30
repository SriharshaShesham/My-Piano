import { Midi } from '@tonejs/midi';
import type { Song, SongNote } from './types';

// Any .mid becomes a play-along: the highest-pitched track is the melody the
// kid plays; every other track auto-plays as backing (PianoBooster-style).
const KB_LO = 48, KB_HI = 83; // the on-screen keyboard, C3..B5

export function songFromMidi(buf: ArrayBuffer, title: string): Song {
  const midi = new Midi(buf);
  const tracks = midi.tracks.filter((t) => t.notes.length > 0);
  if (!tracks.length) throw new Error('No notes found in this MIDI file.');
  const avg = (t: (typeof tracks)[0]) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
  const melody = tracks.reduce((a, b) => (avg(b) > avg(a) ? b : a));

  const notes: SongNote[] = [];
  for (const t of tracks) {
    for (const n of t.notes) {
      notes.push({ midi: n.midi, start: n.time + 1.2, duration: Math.max(n.duration, 0.15), ...(t === melody ? {} : { backing: true as const }) });
    }
  }

  // center the melody on the keyboard (shift everything, so harmony survives),
  // then octave-fold any melody stragglers — an unreachable note = a stuck game
  const mel = notes.filter((n) => !n.backing);
  const median = mel.map((n) => n.midi).sort((a, b) => a - b)[mel.length >> 1];
  const shift = 12 * Math.round((66 - median) / 12); // aim the median at ~F♯4
  for (const n of notes) n.midi += shift;
  for (const n of mel) {
    while (n.midi < KB_LO) n.midi += 12;
    while (n.midi > KB_HI) n.midi -= 12;
  }

  notes.sort((a, b) => a.start - b.start);
  return { title, notes, bpm: midi.header.tempos[0]?.bpm ?? 120 };
}
