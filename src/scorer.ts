import type { SongNote } from './types';

export type PlayNote = SongNote & { hit: boolean; missed: boolean };

export const HIT_WINDOW = 0.45; // seconds; wide + forgiving for kids

/** Index of the nearest still-playable note of this pitch within the timing
 *  window, or -1 if none. Pure — no DOM, so it's unit-testable. */
export function matchNote(notes: PlayNote[], midi: number, now: number): number {
  let best = -1;
  let bestDist = HIT_WINDOW + 1;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.hit || n.missed || n.midi !== midi) continue;
    const d = Math.abs(n.start - now);
    if (d <= HIT_WINDOW && d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

// ponytail: one runnable check for the only non-trivial logic in the app.
// Runs on dev load (main.ts) and throws to the console if the matcher breaks.
export function selfTestScorer() {
  const mk = (midi: number, start: number): PlayNote =>
    ({ midi, start, duration: 0.5, hit: false, missed: false });
  const notes = [mk(60, 1.0), mk(60, 3.0), mk(62, 1.1)];
  console.assert(matchNote(notes, 60, 1.0) === 0, 'exact match');
  console.assert(matchNote(notes, 60, 1.3) === 0, 'in-window late');
  console.assert(matchNote(notes, 60, 2.0) === -1, 'out of window');
  console.assert(matchNote(notes, 64, 1.0) === -1, 'wrong pitch');
  notes[0].hit = true;
  console.assert(matchNote(notes, 60, 1.0) === -1, 'already-hit skipped');
  console.assert(matchNote(notes, 62, 1.1) === 2, 'nearest correct pitch');
  console.log('scorer self-test passed');
}
