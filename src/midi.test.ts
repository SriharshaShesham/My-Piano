import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { songFromMidi } from './midi';

function twoTrackMidi(melodyBase: number) {
  const m = new Midi();
  m.header.setTempo(100);
  const mel = m.addTrack();
  [0, 0.5, 1.0].forEach((t, i) => mel.addNote({ midi: melodyBase + i * 2, time: t, duration: 0.4 }));
  const bass = m.addTrack();
  bass.addNote({ midi: 36, time: 0, duration: 1.4 });
  return m.toArray().buffer as ArrayBuffer;
}

describe('songFromMidi', () => {
  it('splits highest track into melody, rest into backing', () => {
    const song = songFromMidi(twoTrackMidi(72), 'test');
    const melody = song.notes.filter((n) => !n.backing);
    const backing = song.notes.filter((n) => n.backing);
    expect(melody).toHaveLength(3);
    expect(backing).toHaveLength(1);
  });

  it('centers an off-keyboard melody into the playable range', () => {
    const song = songFromMidi(twoTrackMidi(100), 'high'); // way above the keyboard
    for (const n of song.notes.filter((x) => !x.backing)) {
      expect(n.midi).toBeGreaterThanOrEqual(48);
      expect(n.midi).toBeLessThanOrEqual(83);
    }
  });

  it('rejects an empty file', () => {
    const empty = new Midi().toArray().buffer as ArrayBuffer;
    expect(() => songFromMidi(empty, 'x')).toThrow();
  });
});
