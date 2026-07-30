import { describe, it, expect } from 'vitest';
import { matchNote, pendingGroup, type PlayNote } from './scorer';

const mk = (midi: number, start: number, hand?: 'L' | 'R'): PlayNote =>
  ({ midi, start, duration: 0.5, hit: false, missed: false, ...(hand ? { hand } : {}) });

describe('matchNote', () => {
  it('matches the nearest playable note of the pitch inside the window', () => {
    const notes = [mk(60, 1.0), mk(60, 3.0), mk(62, 1.1)];
    expect(matchNote(notes, 60, 1.0)).toBe(0);
    expect(matchNote(notes, 60, 1.3)).toBe(0); // late but in-window
    expect(matchNote(notes, 60, 2.0)).toBe(-1); // out of window
    expect(matchNote(notes, 64, 1.0)).toBe(-1); // wrong pitch
    expect(matchNote(notes, 62, 1.1)).toBe(2);
  });

  it('skips already-resolved notes', () => {
    const notes = [mk(60, 1.0), mk(60, 1.2)];
    notes[0].hit = true;
    expect(matchNote(notes, 60, 1.0)).toBe(1);
    notes[1].missed = true;
    expect(matchNote(notes, 60, 1.0)).toBe(-1);
  });
});

describe('pendingGroup', () => {
  it('groups a chord, shrinks as tones land, then advances', () => {
    const notes = [mk(60, 1.0), mk(64, 1.0), mk(67, 1.0), mk(72, 2.0)];
    expect(pendingGroup(notes)).toHaveLength(3);
    notes[0].hit = notes[1].hit = true;
    expect(pendingGroup(notes).map((n) => n.midi)).toEqual([67]);
    notes[2].hit = true;
    expect(pendingGroup(notes).map((n) => n.midi)).toEqual([72]);
  });

  it('groups both hands landing on the same beat', () => {
    const notes = [mk(60, 1.0, 'R'), mk(48, 1.0, 'L'), mk(62, 1.5, 'R')];
    expect(pendingGroup(notes).map((n) => n.midi).sort()).toEqual([48, 60]);
  });

  it('returns empty when everything is resolved', () => {
    const notes = [mk(60, 1.0)];
    notes[0].hit = true;
    expect(pendingGroup(notes)).toHaveLength(0);
  });
});
