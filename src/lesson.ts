import './lesson.css';
import { Synth } from './audio';

/* ---------- Sheet music: three middle-C quarter notes ---------- */
// Staff lines are at y=70..190 (spacing 30). Middle C sits on the first
// ledger line below the staff: y = 190 + 30 = 220.
const NOTES_X = [420, 570, 720];
const noteG = document.getElementById('notes')!;
noteG.innerHTML = NOTES_X.map((x) => `
  <g transform="translate(${x} 220)">
    <line x1="-26" y1="0" x2="26" y2="0" stroke-width="3.5" />
    <ellipse rx="14.5" ry="10.5" transform="rotate(-18)" />
    <line x1="13.5" y1="-4" x2="13.5" y2="-92" stroke-width="4" />
  </g>`).join('');

/* ---------- Keyboard: 3 octaves, middle C highlighted ---------- */
const kb = document.getElementById('kb')!;
const START = 48; // C3
const OCTAVES = 3;
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const HAS_SHARP = [true, true, false, true, true, true, false];

const ctx = new AudioContext();
const synth = new Synth(ctx);

const whiteCount = OCTAVES * 7;
const whiteW = 100 / whiteCount;
const blackW = whiteW * 0.58;

function press(el: HTMLElement, midi: number) {
  ctx.resume();
  synth.play(midi, 100);
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 150);
}

for (let o = 0; o < OCTAVES; o++) {
  for (let i = 0; i < 7; i++) {
    const midi = START + o * 12 + WHITE_OFFSETS[i];
    const key = document.createElement('div');
    key.className = 'wkey';
    if (midi === 60) {
      key.classList.add('active');
      key.innerHTML = '<span class="label">C</span>';
    }
    key.addEventListener('pointerdown', () => press(key, midi));
    kb.appendChild(key);
  }
}
// black keys on top, centered on the boundary right of their white key
for (let o = 0; o < OCTAVES; o++) {
  for (let i = 0; i < 7; i++) {
    if (!HAS_SHARP[i]) continue;
    const midi = START + o * 12 + WHITE_OFFSETS[i] + 1;
    const whiteIndex = o * 7 + i;
    const key = document.createElement('div');
    key.className = 'bkey';
    key.style.width = `${blackW}%`;
    key.style.left = `${(whiteIndex + 1) * whiteW - blackW / 2}%`;
    key.addEventListener('pointerdown', () => press(key, midi));
    kb.appendChild(key);
  }
}

/* ---------- Controls ---------- */
document.getElementById('gotIt')!.addEventListener('click', () => {
  document.getElementById('modal')!.classList.add('hidden');
});
document.getElementById('pause')!.addEventListener('click', () => {
  // ponytail: pause is a no-op until the lesson loop is wired in
});
