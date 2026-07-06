import type { NoteSource } from './types';

// Computer-key → MIDI note for the 6 white keys Twinkle uses (C4..A4).
const KEY_MAP: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69,
};

export class ScreenSource implements NoteSource {
  readonly name = 'screen';
  onNoteOn: (midi: number, velocity: number) => void = () => {};

  private handler = (ev: KeyboardEvent) => {
    if (ev.repeat) return;
    const midi = KEY_MAP[ev.key.toLowerCase()];
    if (midi != null) { ev.preventDefault(); this.press(midi); }
  };

  /** On-screen key taps call this too (see Game's pointerdown handler). */
  press(midi: number) { this.onNoteOn(midi, 100); }

  start() { window.addEventListener('keydown', this.handler); }
  stop() { window.removeEventListener('keydown', this.handler); }
}

export class MidiSource implements NoteSource {
  readonly name = 'midi';
  onNoteOn: (midi: number, velocity: number) => void = () => {};
  private access: any;

  async start() {
    const nav = navigator as any;
    if (!nav.requestMIDIAccess) throw new Error('Web MIDI needs Chrome or Edge.');
    this.access = await nav.requestMIDIAccess();
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (m: any) => this.handle(m.data);
    }
  }

  private handle(data: Uint8Array) {
    const [status, note, vel] = data;
    // 0x90 = note-on; a note-on with velocity 0 is really a note-off.
    if ((status & 0xf0) === 0x90 && vel > 0) this.onNoteOn(note, vel);
  }

  stop() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) input.onmidimessage = null;
  }
}
