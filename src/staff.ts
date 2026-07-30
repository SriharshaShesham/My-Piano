import type { Song, SongNote } from './types';

// Hand-rolled SVG staff. Vector = crisp at any dpr/zoom (the canvas raster
// pipeline this replaces is what blurred). Monophonic kid songs only need
// heads/stems/ledgers/sharps — no engraving library required.
const S = 30;                    // staff line spacing
const TOP = 70;                  // y of top treble line (lines at 70..190)
const C4_Y = TOP + 5 * S;        // 220 middle C: one ledger below the treble staff
const BASS_TOP = C4_Y + S;       // 250 top bass line (middle C = one ledger above it)
const TREBLE_MID = TOP + 2 * S;  // 130 middle line, treble
const BASS_MID = BASS_TOP + 2 * S; // 310 middle line, bass
export const STAFF_H = 430;      // grand staff: treble 70..190 + bass 250..370 + margins
export const PX_PER_SEC = 130;   // horizontal scroll speed at 1×
const CURSOR_FRAC = 0.42;
const CLEF_W = 120;

const PC: { l: string; s: boolean }[] = [
  { l: 'C', s: false }, { l: 'C', s: true }, { l: 'D', s: false }, { l: 'D', s: true },
  { l: 'E', s: false }, { l: 'F', s: false }, { l: 'F', s: true }, { l: 'G', s: false },
  { l: 'G', s: true }, { l: 'A', s: false }, { l: 'A', s: true }, { l: 'B', s: false },
];
const STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function staffPos(midi: number) {
  const pc = PC[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return { y: C4_Y - (STEP[pc.l] + (oct - 4) * 7) * (S / 2), sharp: pc.s };
}
function noteLetter(midi: number) {
  const pc = PC[((midi % 12) + 12) % 12];
  return pc.l + (pc.s ? '♯' : '');
}

export function timeToX(t: number) { return t * PX_PER_SEC; }

const NS = 'http://www.w3.org/2000/svg';
function el(name: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e as SVGElement;
}

function noteGlyph(n: SongNote, beat: number, bass: boolean, chord: boolean): SVGGElement {
  const { y, sharp } = staffPos(n.midi);
  const g = el('g', { class: 'snote', transform: `translate(${timeToX(n.start)} ${y})` }) as SVGGElement;
  // ledger lines between the note's OWN staff (treble or bass) and the note
  const topLine = bass ? BASS_TOP : TOP;
  const botLine = topLine + 4 * S;
  for (let ly = botLine + S; ly <= y; ly += S) g.appendChild(el('line', { x1: -26, x2: 26, y1: ly - y, y2: ly - y, class: 'ledger' }));
  for (let ly = topLine - S; ly >= y; ly -= S) g.appendChild(el('line', { x1: -26, x2: 26, y1: ly - y, y2: ly - y, class: 'ledger' }));
  const beats = n.duration / beat;
  const open = beats >= 2;
  g.appendChild(el('ellipse', { rx: 14.5, ry: 10.5, transform: 'rotate(-18)', class: open ? 'head open' : 'head' }));
  if (beats < 4 && !chord) { // ponytail: chords render as stacked heads, no stem; shared-stem engraving deferred
    const up = y >= (bass ? BASS_MID : TREBLE_MID); // stems up below the middle line, down above
    g.appendChild(up
      ? el('line', { x1: 13.5, y1: -4, x2: 13.5, y2: -92, class: 'stem' })
      : el('line', { x1: -13.5, y1: 4, x2: -13.5, y2: 92, class: 'stem' }));
  }
  if (sharp) {
    const t = el('text', { x: -36, y: 9, class: 'acc' });
    t.textContent = '♯';
    g.appendChild(t);
  }
  // beginner aid: the note names itself (white on filled heads, dark on open)
  const label = el('text', { class: open ? 'nlabel dark' : 'nlabel', y: 1 });
  label.textContent = noteLetter(n.midi);
  g.appendChild(label);
  return g;
}

export class Staff {
  readonly svg: SVGSVGElement;
  private lines: SVGElement[] = [];
  private clefLines: SVGElement[] = [];
  private scroll: SVGGElement;
  private cursor: SVGElement;
  private loopRect: SVGElement;
  private noteEls: SVGGElement[] = [];
  private w = 0;
  private lastT = 0;

  constructor(container: HTMLElement) {
    // viewBox + preserveAspectRatio="none": width stays 1:1 (viewBox width tracks
    // clientWidth in resize()), height scales STAFF_H → whatever vertical space
    // <main> leaves. Lets the staff shrink on short/landscape phones.
    this.svg = el('svg', { class: 'staff', viewBox: `0 0 100 ${STAFF_H}`, preserveAspectRatio: 'none' }) as SVGSVGElement;

    const linesG = el('g', { class: 'lines' });
    for (const top of [TOP, BASS_TOP]) for (let i = 0; i < 5; i++) {
      const l = el('line', { x1: 0, y1: top + i * S, x2: 100, y2: top + i * S });
      this.lines.push(l);
      linesG.appendChild(l);
    }
    this.svg.appendChild(linesG);

    this.scroll = el('g', { class: 'scroll' }) as SVGGElement;
    this.svg.appendChild(this.scroll);

    // loop-region highlight lives in the scroll layer so it moves with the notes
    this.loopRect = el('rect', { class: 'loop-region', y: 10, height: STAFF_H - 20, rx: 12, width: 0 });
    this.scroll.appendChild(this.loopRect);

    // clef sits on top so scrolled-past notes disappear behind it
    const clefG = el('g', { class: 'clef-group' });
    clefG.appendChild(el('rect', { x: 0, y: 0, width: CLEF_W, height: STAFF_H, class: 'clef-bg' }));
    for (const top of [TOP, BASS_TOP]) for (let i = 0; i < 5; i++) {
      const l = el('line', { x1: 0, y1: top + i * S, x2: CLEF_W, y2: top + i * S });
      this.clefLines.push(l);
      clefG.appendChild(l);
    }
    // brace joining the two staves (ponytail: square bracket, not an engraved curly brace)
    for (const seg of [
      { x1: 8, y1: TOP, x2: 8, y2: BASS_TOP + 4 * S }, // spine
      { x1: 8, y1: TOP, x2: 18, y2: TOP },             // top cap
      { x1: 8, y1: BASS_TOP + 4 * S, x2: 18, y2: BASS_TOP + 4 * S }, // bottom cap
    ]) clefG.appendChild(el('line', seg));
    const treble = el('text', { x: 30, y: TOP + 4 * S + 6, class: 'clef' });
    treble.textContent = '𝄞';
    clefG.appendChild(treble);
    // ponytail: bass clef glyph baseline mirrors the treble one; nudge if a font sits it oddly
    const bass = el('text', { x: 30, y: BASS_TOP + 3 * S, class: 'clef bass' });
    bass.textContent = '𝄢';
    clefG.appendChild(bass);
    this.svg.appendChild(clefG);

    this.cursor = el('rect', { y: 16, width: 30, height: STAFF_H - 32, rx: 10, class: 'cursor' });
    this.svg.appendChild(this.cursor);

    container.appendChild(this.svg);
    this.resize();
    // Element-level observer: the sheet can change width without a window
    // resize (layout settling, font load, panel changes) — track the svg itself.
    new ResizeObserver(() => this.resize()).observe(this.svg);
  }

  resize() {
    const w = this.svg.clientWidth || this.svg.parentElement?.clientWidth || 0;
    if (!w || w === this.w) return;
    this.w = w;
    this.svg.setAttribute('viewBox', `0 0 ${this.w} ${STAFF_H}`);
    for (const l of this.lines) l.setAttribute('x2', String(this.w));
    this.cursor.setAttribute('x', String(this.cursorX() - 15));
    this.setTime(this.lastT); // re-align the scroll to the moved cursor
  }

  cursorX() { return this.w * CURSOR_FRAC; }

  /** Screen position of the cursor mid-staff (for reward bursts). */
  cursorScreen() {
    const r = this.svg.getBoundingClientRect();
    return { x: r.left + this.cursorX(), y: r.top + r.height * 0.5 };
  }

  setSong(song: Song) {
    this.scroll.innerHTML = '';
    this.scroll.appendChild(this.loopRect); // survives song swaps
    this.setLoop(-1, -1);
    const beat = 60 / song.bpm;
    // notes sharing a hand + start are a chord (drawn stemless, stacked)
    const key = (n: SongNote) => `${n.hand ?? 'R'}@${Math.round(n.start * 100)}`;
    const counts = new Map<string, number>();
    for (const n of song.notes) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1);
    this.noteEls = song.notes.map((n) => {
      const g = noteGlyph(n, beat, n.hand === 'L', counts.get(key(n))! > 1);
      this.scroll.appendChild(g);
      return g;
    });
    this.setTime(0);
  }

  /** Scroll the notation so song-time t sits on the cursor. */
  setTime(t: number) {
    this.lastT = t;
    this.scroll.setAttribute('transform', `translate(${this.cursorX() - timeToX(t)} 0)`);
  }

  /** Song-time under a given screen x (for drag-seek and loop selection). */
  screenXToTime(clientX: number): number {
    const r = this.svg.getBoundingClientRect();
    const x = clientX - r.left;
    return this.lastT + (x - this.cursorX()) / PX_PER_SEC;
  }

  /** Highlight [a,b] as the practice-loop region; a<0 hides it. */
  setLoop(a: number, b: number) {
    if (a < 0 || b <= a) { this.loopRect.setAttribute('width', '0'); return; }
    this.loopRect.setAttribute('x', String(timeToX(a)));
    this.loopRect.setAttribute('width', String(timeToX(b) - timeToX(a)));
  }

  markHit(i: number) { this.noteEls[i]?.classList.add('hit'); }
  markMiss(i: number) { this.noteEls[i]?.classList.add('miss'); }
  unmark(i: number) { this.noteEls[i]?.classList.remove('hit', 'miss'); }
  clearMarks() { for (const g of this.noteEls) g.classList.remove('hit', 'miss'); }
}
