// DOM piano keyboard: flexbox white keys + absolutely-positioned black keys.
// Layout engine guarantees it renders — no canvas sizing math to fail.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const HAS_SHARP = [true, true, false, true, true, true, false];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => NAMES[((midi % 12) + 12) % 12];

export class Keys {
  onPress: (midi: number) => void = () => {};
  private keyEls = new Map<number, HTMLElement>();
  private guideEls: HTMLElement[] = [];

  constructor(container: HTMLElement, start = 48, octaves = 3) {
    const whiteCount = octaves * 7;
    const whiteW = 100 / whiteCount;
    const blackW = whiteW * 0.58;

    for (let o = 0; o < octaves; o++) {
      for (let i = 0; i < 7; i++) {
        const midi = start + o * 12 + WHITE_OFFSETS[i];
        const key = document.createElement('div');
        key.className = 'wkey';
        key.dataset.midi = String(midi);
        key.addEventListener('pointerdown', () => this.onPress(midi));
        container.appendChild(key);
        this.keyEls.set(midi, key);
      }
    }
    for (let o = 0; o < octaves; o++) {
      for (let i = 0; i < 7; i++) {
        if (!HAS_SHARP[i]) continue;
        const midi = start + o * 12 + WHITE_OFFSETS[i] + 1;
        const key = document.createElement('div');
        key.className = 'bkey';
        key.style.width = `${blackW}%`;
        key.style.left = `${(o * 7 + i + 1) * whiteW - blackW / 2}%`;
        key.addEventListener('pointerdown', () => this.onPress(midi));
        container.appendChild(key);
        this.keyEls.set(midi, key);
      }
    }
  }

  flash(midi: number) {
    const el = this.keyEls.get(midi);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 160);
  }

  /** Highlight the key(s) to play next (teal + note name). A number, a list
   *  (a chord / both-hands beat), or -1 / [] to clear. */
  setGuide(midi: number | number[]) {
    for (const el of this.guideEls) {
      el.classList.remove('guide');
      el.querySelector('.label')?.remove();
    }
    this.guideEls = [];
    const midis = (Array.isArray(midi) ? midi : [midi]).filter((m) => m >= 0);
    for (const m of midis) {
      const el = this.keyEls.get(m);
      if (!el) continue;
      el.classList.add('guide');
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = noteName(m);
      el.appendChild(label);
      this.guideEls.push(el);
    }
    // keep the next key(s) on-screen when the keyboard overflows (narrow viewports)
    this.guideEls[0]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}
