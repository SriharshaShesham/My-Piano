export type SongNote = { midi: number; start: number; duration: number };
export type Song = { title: string; notes: SongNote[]; bpm: number };

// A NoteSource turns some input (screen taps, USB-MIDI, later the mic) into
// note-on events. Everything downstream — clock, scorer, renderer — is
// source-agnostic, so adding an input is just another implementation here.
export interface NoteSource {
  readonly name: string;
  onNoteOn: (midi: number, velocity: number) => void;
  start(): Promise<void> | void;
  stop(): void;
}
