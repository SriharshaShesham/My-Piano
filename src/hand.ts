// Right-hand finger guide: highlights which finger plays the next note.
// ponytail: C-position mapping (thumb=C4 … pinky=G4, clamped beyond) —
// swap in per-song fingering tables when songs outgrow one hand position.
const STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const LETTER = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

export function fingerFor(midi: number, hand: 'L' | 'R' = 'R'): number {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  if (hand === 'L') {
    const steps = STEP[LETTER[pc]] + (oct - 3) * 7; // diatonic steps from C3
    return Math.max(1, Math.min(5, 5 - steps)); // pinky=C3 … thumb=G3
  }
  const steps = STEP[LETTER[pc]] + (oct - 4) * 7; // diatonic steps from middle C
  return Math.max(1, Math.min(5, steps + 1));
}

export const FINGER_NAMES = ['', 'Thumb', 'Pointer', 'Middle', 'Ring', 'Pinky'];

const NOTE_LABELS = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];
export function noteLabel(midi: number) { return NOTE_LABELS[((midi % 12) + 12) % 12]; }

// Right hand seen from above, fingers up: middle longest, pinky short and
// low, fingers fanned a few degrees from their knuckles, thumb off the side.
// [x, yTop, height, fan°] — capsules run into the palm so joints stay seamless.
const F_GEOM: [number, number, number, number][] = [
  [40, 34, 64, -6],  // 2 index
  [58, 24, 74, -1],  // 3 middle
  [76, 31, 67, 4],   // 4 ring
  [93, 48, 50, 9],   // 5 pinky
];

export class Hand {
  private parts: SVGElement[] = []; // index 1..5
  private badge: HTMLElement;
  private hand: 'L' | 'R' = 'R';

  constructor(private container: HTMLElement) {
    container.innerHTML = `
      <svg viewBox="0 0 130 142" aria-hidden="true">
        <g class="fng" data-f="1">
          <rect x="-8.5" y="-28" width="17" height="52" rx="8.5" transform="translate(30 98) rotate(-55)" />
          <text x="10" y="87">1</text>
        </g>
        ${F_GEOM.map(([x, y, h, fan], i) => `
        <g class="fng" data-f="${i + 2}">
          <rect x="${x - 8.5}" y="${y}" width="17" height="${h}" rx="8.5" transform="rotate(${fan} ${x} 96)" />
          <text x="${x + fan}" y="${y + 16}">${i + 2}</text>
        </g>`).join('')}
        <path class="palm" d="M 24 104 Q 22 88 38 88 L 96 88 Q 106 88 106 100 L 106 116 Q 106 138 82 140 L 52 140 Q 27 138 25 118 L 24 104 Z" />
      </svg>
      <div class="fbadge">&nbsp;</div>`;
    this.parts = [null as any, ...[...container.querySelectorAll<SVGElement>('.fng')]];
    this.badge = container.querySelector('.fbadge')!;
  }

  /** Which hand plays (practice drills use the left) — mirrors the graphic. */
  setHand(h: 'L' | 'R') {
    this.hand = h;
    this.container.classList.toggle('lefty', h === 'L');
  }

  /** Highlight the finger for this midi note; -1 clears. */
  setNote(midi: number) {
    const f = midi >= 0 ? fingerFor(midi, this.hand) : -1;
    for (let i = 1; i <= 5; i++) this.parts[i]?.classList.toggle('on', i === f);
    this.badge.innerHTML = f > 0 ? `${this.hand === 'L' ? 'Left' : ''} Finger ${f} · ${FINGER_NAMES[f]}` : '&nbsp;';
  }
}
