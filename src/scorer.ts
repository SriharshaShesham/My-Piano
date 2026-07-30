import type { SongNote } from './types';

export type PlayNote = SongNote & { hit: boolean; missed: boolean };

export const HIT_WINDOW = 0.45; // seconds; wide + forgiving for kids
export const GROUP_EPS = 0.02;  // authored chords share an exact start; well under HIT_WINDOW

/** The next set of notes to play together: the earliest still-playable note
 *  plus every other within GROUP_EPS of it (a chord / a both-hands beat).
 *  Pure — the wait-mode loop and the guides both derive from this. */
export function pendingGroup(notes: PlayNote[]): PlayNote[] {
  let t0 = Infinity;
  for (const n of notes) if (!n.hit && !n.missed && n.start < t0) t0 = n.start;
  if (t0 === Infinity) return [];
  return notes.filter((n) => !n.hit && !n.missed && n.start <= t0 + GROUP_EPS);
}

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
