import type { Song, NoteSource } from './types';
import { Synth } from './audio';
import { matchNote, type PlayNote } from './scorer';
import { Staff } from './staff';
import { Keys } from './domkeyboard';

export class Game {
  private notes: PlayNote[] = [];
  private endTime = 0;
  private lastStart = 0; // start of the final note — finish shortly after it resolves
  private source?: NoteSource;
  private muted = false; // mic mode: the real instrument makes the sound

  private speed = 0.75;
  private startAt = 0;   // ctx-time anchor while playing
  private songTime = 0;  // authoritative position while paused
  private _playing = false;
  private raf = 0;
  private hits = 0;
  private total = 0;
  private loopA = -1;
  private loopB = -1;
  private demoMode = false;
  private demoResolve: (() => void) | null = null;

  // per-round play quality: full credit for prompt presses, less the longer
  // the wait-mode hold lasts; wrong presses are counted for a penalty
  private holdNote: PlayNote | null = null;
  private holdSince = 0;
  private qualitySum = 0;
  private wrongCount = 0;

  get roundQuality() { return { sum: this.qualitySum, wrong: this.wrongCount }; }

  onStateChange: (playing: boolean) => void = () => {};
  onGuide: (midi: number) => void = () => {};
  onAnyPlay: (midi: number) => void = () => {}; // every key press, playing or not (quiz listens here)

  constructor(
    private staff: Staff,
    private keys: Keys,
    private ctx: AudioContext,
    private synth: Synth,
    private onScore: (h: number, t: number) => void,
    private onFinish: (h: number, t: number) => void,
  ) {
    keys.onPress = (midi) => this.play(midi);
  }

  get playing() { return this._playing; }
  get position() { return this.now(); }

  loadSong(song: Song) {
    this.stopDemo(); // a demo from the previous section must not leak into this one
    this.pause();
    this.synth.cut(); // kill note tails still ringing from the old section
    this.notes = song.notes.map((n) => ({ ...n, hit: false, missed: false }));
    this.total = this.notes.length;
    this.endTime = this.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
    this.lastStart = this.notes.reduce((m, n) => Math.max(m, n.start), 0);
    this.clearLoop();
    this.staff.setSong(song);
    this.setPosition(0);
  }

  async setSource(source: NoteSource, muted: boolean) {
    this.source?.stop();
    this.source = source;
    this.muted = muted;
    source.onNoteOn = (midi) => this.play(midi);
    await source.start();
  }

  private now() {
    return this._playing ? (this.ctx.currentTime - this.startAt) * this.speed : this.songTime;
  }

  /** Change speed; rebase so the current position stays continuous. */
  setSpeed(mult: number) {
    if (this._playing) this.startAt = this.ctx.currentTime - this.now() / mult;
    this.speed = mult;
  }

  /** Move to song-time t. Notes at/after t become playable again; unplayed
   *  notes left behind t count as skipped (music never passes a note itself —
   *  wait mode holds on it — so only seeking can skip). */
  setPosition(t: number) {
    t = Math.max(0, Math.min(t, this.endTime + 0.5));
    this.songTime = t;
    this.holdNote = null;
    if (t <= 0) { this.qualitySum = 0; this.wrongCount = 0; } // fresh round
    if (this._playing) this.startAt = this.ctx.currentTime - t / this.speed;
    this.notes.forEach((n, i) => {
      if (n.start >= t - 0.01) {
        if (n.hit || n.missed) { n.hit = false; n.missed = false; this.staff.unmark(i); }
      } else if (!n.hit && !n.missed) {
        n.missed = true;
        this.staff.markMiss(i);
      }
    });
    this.hits = this.notes.filter((n) => n.hit).length;
    this.onScore(this.hits, this.total);
    this.staff.setTime(t);
    this.updateGuide();
  }

  playPause() { this._playing ? this.pause() : this.resume(); }

  /** Self-playing demo: the app presses each key as its note arrives.
   *  Resolves when the section ends (or stopDemo is called). */
  demo(): Promise<void> {
    this.stopDemo();
    this.setPosition(0);
    this.demoMode = true;
    this.resume();
    return new Promise((res) => (this.demoResolve = res));
  }

  stopDemo() {
    if (!this.demoMode) return;
    this.demoMode = false;
    this.pause();
    this.synth.cut();
    this.setPosition(0);
    this.demoResolve?.();
    this.demoResolve = null;
  }

  resume() {
    if (this._playing) return;
    if (this.songTime >= this.endTime) this.setPosition(this.loopA >= 0 ? this.loopA : 0);
    this.startAt = this.ctx.currentTime - this.songTime / this.speed;
    this._playing = true;
    this.onStateChange(true);
    cancelAnimationFrame(this.raf);
    this.loop();
  }

  pause() {
    if (!this._playing) return;
    this.songTime = this.now();
    this._playing = false;
    this.onStateChange(false);
    cancelAnimationFrame(this.raf);
  }

  /** Practice loop over [a,b]; playback wraps until cleared. */
  setLoop(a: number, b: number) {
    if (b - a < 0.25) { this.clearLoop(); return; }
    this.loopA = Math.max(0, a);
    this.loopB = Math.min(b, this.endTime + 0.5);
    this.staff.setLoop(this.loopA, this.loopB);
  }

  clearLoop() {
    this.loopA = this.loopB = -1;
    this.staff.setLoop(-1, -1);
  }

  get hasLoop() { return this.loopA >= 0; }

  play(midi: number) {
    if (!this.muted) this.synth.play(midi, 100);
    this.keys.flash(midi);
    this.onAnyPlay(midi);
    const idx = this._playing ? matchNote(this.notes, midi, this.now()) : -1;
    if (idx >= 0) {
      if (!this.demoMode) {
        const heldMs = this.notes[idx] === this.holdNote ? performance.now() - this.holdSince : 0;
        this.qualitySum += heldMs > 1500 ? 0.4 : heldMs > 600 ? 0.7 : 1; // prompt = full credit
      }
      if (this.notes[idx] === this.holdNote) this.holdNote = null;
      this.notes[idx].hit = true;
      this.hits++;
      this.onScore(this.hits, this.total);
      this.staff.markHit(idx);
      this.updateGuide();
      this.burst();
    } else if (this._playing && !this.demoMode) {
      this.wrongCount++;
    }
  }

  private updateGuide() {
    const next = this.notes.find((n) => !n.hit && !n.missed);
    this.keys.setGuide(next ? next.midi : -1);
    this.onGuide(next ? next.midi : -1);
  }

  /** DOM particle burst at the cursor. */
  private burst() {
    const { x, y } = this.staff.cursorScreen();
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2;
      const d = 50 + Math.random() * 110;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.background = ['#00d2a0', '#ffd43b', '#ff8787', '#74c0fc'][i % 4];
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d - 60}px`);
      s.addEventListener('animationend', () => s.remove());
      document.body.appendChild(s);
    }
  }

  private loop = () => {
    if (!this._playing) return;
    let now = this.now();

    // Wait mode: hold on the next note until the right key is pressed —
    // unless this is a demo, in which case the app presses it itself.
    const next = this.notes.find((n) => !n.hit && !n.missed);
    if (next && now >= next.start) {
      if (this.demoMode) {
        this.play(next.midi);
      } else {
        if (this.holdNote !== next) { this.holdNote = next; this.holdSince = performance.now(); }
        now = next.start;
        this.startAt = this.ctx.currentTime - now / this.speed; // freeze the clock here
      }
    }
    this.staff.setTime(now);

    if (this.loopB >= 0 && now >= this.loopB + 0.25) {
      this.setPosition(this.loopA); // practice loop wraps
    } else if (this.loopB < 0 && (now > this.endTime + 1.2 || (!next && now > this.lastStart + 1))) {
      // all notes resolved → finish ~1s after the last strike instead of
      // scrolling out the final note's full duration in silence
      if (this.demoMode) { this.stopDemo(); return; } // demo over: rewind, no stars
      this.pause();
      this.songTime = this.endTime + 0.001;
      this.keys.setGuide(-1);
      this.onGuide(-1);
      this.onFinish(this.hits, this.total);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Debug: show the scene as it would look at song-time t. */
  previewAt(t: number) { this.setPosition(t); }
}
