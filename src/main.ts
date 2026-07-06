import './style.css';
import { Game } from './game';
import { Staff, STAFF_H, PX_PER_SEC } from './staff';
import { Keys } from './domkeyboard';
import { Synth } from './audio';
import { SONGS, savePoints, getPoints, getProfiles, activeProfile, setActiveProfile, addProfile, loadSettings, saveSettings } from './curriculum';
import { Hand, fingerFor, FINGER_NAMES, noteLabel } from './hand';
import { Tutor, speak, type TutorScript } from './tutor';
import { ScreenSource, MidiSource } from './sources';
import { MicSource } from './mic';
import { selfTestScorer } from './scorer';
import type { NoteSource } from './types';

if (import.meta.env.DEV) selfTestScorer();

const ctx = new AudioContext();
const staff = new Staff(document.getElementById('sheet')!);
const keys = new Keys(document.getElementById('kb')!, 48, 3); // C3..B5
const synth = new Synth(ctx);

const progressText = document.getElementById('progressText')!;
const progressFill = document.getElementById('progressFill')!;
const overlay = document.getElementById('overlay')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const lessonTitle = document.getElementById('lessonTitle')!;
const menuEl = document.getElementById('menu')!;
const playviewEl = document.getElementById('playview')!;
const coursesEl = document.getElementById('courses')!;
const lessonNav = document.getElementById('lessons')!;
const srcBtns = [...document.querySelectorAll<HTMLButtonElement>('.src')];

let songIdx = 0;
let sectionIdx = 0;

/* Each section is practiced 3 rounds; the final modal auto-advances in 10s.
   Scoring: 20 points per section = 14 playing (timing quality minus a wrong-
   press penalty, BEST round counts) + 6 identification (quiz first-tries). */
const ROUNDS = 3;
const PLAY_PTS = 14;
const QUIZ_PTS = 6;
let round = 0;
let bestPlay = 0; // best playing score across rounds/retries of this section
let autoT = 0; // pending auto-restart timeout / countdown interval
function clearAuto() { clearTimeout(autoT); clearInterval(autoT); }

const starsOf = (pts: number) => Math.round((pts / 20) * 3);
const starStr = (n: number) => '⭐'.repeat(n) + '☆'.repeat(3 - n);

function showScore(h: number, t: number) {
  progressText.textContent = `${h}/${t}`;
  progressFill.style.width = t ? `${(h / t) * 100}%` : '0%';
}

async function restart() {
  await ctx.resume();
  overlay.classList.add('hidden');
  game.setPosition(0);
  game.resume();
}

function showFinish(_h: number, t: number) {
  const { sum, wrong } = game.roundQuality;
  const playPts = Math.min(PLAY_PTS, Math.round((PLAY_PTS * Math.max(0, sum - 0.25 * wrong)) / Math.max(t, 1)));
  bestPlay = Math.max(bestPlay, playPts);
  savePoints(SONGS[songIdx].id, sectionIdx, playPts); // partial credit if the kid quits here
  round++;

  if (round < ROUNDS) {
    overlay.innerHTML = `
      <div class="card">
        <div class="big">${playPts} / ${PLAY_PTS}</div>
        <h2>Round ${round} done!</h2>
        <p>${playPts < PLAY_PTS ? 'Quick fingers and right keys score more — ' : 'Perfect! '}round ${round + 1} of ${ROUNDS}!</p>
      </div>`;
    overlay.classList.remove('hidden');
    autoT = window.setTimeout(restart, 2500);
    return;
  }

  // all rounds played → pop quiz first, stars after (skipped if kid navigates away)
  runQuiz().then((quizPts) => { if (quizPts !== null) showStars(bestPlay + quizPts); });
}

function showStars(total: number) {
  savePoints(SONGS[songIdx].id, sectionIdx, total);
  const nextExists = sectionIdx + 1 < SONGS[songIdx].sections.length;
  overlay.innerHTML = `
    <div class="card">
      <div class="big">${starStr(starsOf(total))}</div>
      <h2>Great job!</h2>
      <p>You scored <b>${total} / 20</b> points!<br>Want to try again for a higher score?</p>
      <div class="card-btns">
        <button id="again">🔁 TRY AGAIN</button>
        ${nextExists ? '<button id="next">NEXT PART ➜</button>' : '<button id="toMenu">ALL SONGS</button>'}
      </div>
      ${nextExists ? '<p class="autonext">Next part in <b id="autoN">10</b>s…</p>' : ''}
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('again')!.addEventListener('click', () => { clearAuto(); round = 0; restart(); });
  document.getElementById('next')?.addEventListener('click', () => openSection(songIdx, sectionIdx + 1));
  document.getElementById('toMenu')?.addEventListener('click', showMenu);
  if (nextExists) {
    let n = 10;
    const numEl = document.getElementById('autoN')!;
    autoT = window.setInterval(() => {
      numEl.textContent = String(--n);
      if (n <= 0) openSection(songIdx, sectionIdx + 1);
    }, 1000);
  }
}

const game = new Game(staff, keys, ctx, synth, showScore, showFinish);
game.onStateChange = (playing) => {
  playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
};
const hand = new Hand(document.getElementById('hand')!);
game.onGuide = (midi) => hand.setNote(midi);

/* ---------- key-intro card: where's the new key? (center screen) ---------- */
const keyIntro = document.getElementById('keyIntro')!;
const SHORT_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const KI_WHITE = [0, 2, 4, 5, 7, 9, 11];
const KI_SHARP = [true, true, false, true, true, true, false];
// how to find each key by its black-key neighbours, indexed by pitch class
const KEY_HINTS = [
  'the white key just before the two black keys',            // C
  'the first of the two black keys',                         // C♯
  'the white key between the two black keys',                // D
  'the second of the two black keys',                        // D♯
  'the white key right after the two black keys',            // E
  'the white key just before the three black keys',          // F
  'the first of the three black keys',                       // F♯
  'the white key between the first and second of the three black keys', // G
  'the middle one of the three black keys',                  // G♯
  'the white key between the second and third of the three black keys', // A
  'the last of the three black keys',                        // A♯
  'the white key right after the three black keys',          // B
];
const keyHint = (midi: number) => KEY_HINTS[((midi % 12) + 12) % 12];

function showKeyIntro(midi: number) {
  const base = midi - (((midi % 12) + 12) % 12); // C of the note's octave
  const wW = 100 / 7;
  const bW = wW * 0.58;
  let kb = KI_WHITE.map((o) =>
    `<div class="kiw${base + o === midi ? ' hit' : ''}">${base + o === midi ? SHORT_NAMES[o] : ''}</div>`).join('');
  KI_SHARP.forEach((has, i) => {
    if (!has) return;
    const m = base + KI_WHITE[i] + 1;
    kb += `<div class="kib${m === midi ? ' hit' : ''}" style="width:${bW}%;left:${(i + 1) * wW - bW / 2}%">${m === midi ? SHORT_NAMES[KI_WHITE[i] + 1] : ''}</div>`;
  });
  keyIntro.innerHTML = `<h3>Find ${SHORT_NAMES[((midi % 12) + 12) % 12]} on the keyboard!</h3><div class="kikb">${kb}</div><div class="kihint">It's ${keyHint(midi)}!</div><div class="kiarrow">⬇ press the glowing key below ⬇</div>`;
  keyIntro.classList.remove('hidden');
}
const hideKeyIntro = () => keyIntro.classList.add('hidden');

/* The tutor holds the lesson until the kid actually presses the new key. */
let introAnswer: ((midi: number) => void) | null = null;
let introCancel: (() => void) | null = null;
function waitForKey(target: number): Promise<void> {
  return new Promise((res) => {
    const done = () => { clearTimeout(to); introAnswer = introCancel = null; res(); };
    const to = setTimeout(done, 20000); // patience timeout — never strand a shy kid
    introAnswer = (m) => { if (m % 12 === target % 12) done(); };
    introCancel = done;
  });
}

const tutor = new Tutor(document.getElementById('tutor')!, {
  demoNote: (midi) => {
    game.play(midi); // real key press: flash + sound (fires before the wait arms)
    hand.setNote(midi);
    keys.setGuide(midi); // hold the teal highlight on the real key
    showKeyIntro(midi); // centered "here's where it lives" card
    return waitForKey(midi); // tutor proceeds once the kid presses it
  },
  demoSection: () => { hideKeyIntro(); return game.demo(); },
  onStart: async () => { hideKeyIntro(); await ctx.resume(); game.setPosition(0); game.resume(); },
  onCancel: () => { hideKeyIntro(); introCancel?.(); game.stopDemo(); },
});

/* ---------- pop quiz: mystery notes after the last round ----------
   Shows a single note on the staff WITHOUT its letter label; the kid must
   find and play the key. Octave-forgiving. Two misses → reveal the answer. */
const quizEl = document.getElementById('quiz')!;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const PRAISE = ['🎉 YES! You found it!', '⭐ Superstar!', '🥳 Woohoo! That\'s it!'];
const MISS = ['🙈 Oops — not that one!', '🤔 Hmm, try another key!', '🐸 Almost! Hop to another key!'];
let quizGen = 0;
let quizOn = false;
let quizAnswer: ((midi: number) => void) | null = null;
game.onAnyPlay = (midi) => { quizAnswer?.(midi); introAnswer?.(midi); };

function cancelQuiz() {
  quizGen++;
  quizOn = false;
  quizAnswer = null;
  quizEl.classList.add('hidden');
  applyNoteLabels(); // back to whatever the ABC toggle says
}

/** A full mystery-note SEQUENCE from the section's pitches (e.g. C D D C C D
 *  C D D) shown unlabeled on the staff; the kid plays it in order. Resolves
 *  with the quiz points (first-try answers count), or null if cancelled. */
async function runQuiz(): Promise<number | null> {
  const gen = ++quizGen;
  const dead = () => gen !== quizGen;
  const sec = SONGS[songIdx].sections[sectionIdx].song;
  const pool = [...new Set(sec.notes.map((n) => n.midi))];
  const len = Math.min(9, Math.max(4, pool.length * 4));
  const seq = Array.from({ length: len }, () => pick(pool));
  const STEP = 0.9; // seconds between quiz notes on the staff

  quizOn = true;
  keys.setGuide(-1);
  hand.setNote(-1);
  staff.svg.classList.add('noletters'); // no giving away the answers
  staff.setSong({ ...sec, notes: seq.map((m, i) => ({ midi: m, start: i * STEP, duration: 0.45 })) });
  quizEl.classList.remove('hidden');
  quizEl.textContent = `🕵️ Quiz! Play all ${len} mystery notes in order!`;
  speak(`Quiz time! Can you name and play all ${len} mystery notes, one by one?`);

  let firstTry = 0;
  for (let i = 0; i < seq.length; i++) {
    const target = seq[i];
    staff.setTime(i * STEP); // scroll the current mystery note onto the cursor
    let wrong = 0;
    const found = await new Promise<boolean>((res) => {
      quizAnswer = (midi) => {
        if (dead()) { res(false); return; }
        if (midi % 12 === target % 12) { res(true); return; }
        wrong++;
        quizEl.textContent = `${pick(MISS)} (note ${i + 1} of ${len})`;
        if (wrong === 2) { // stuck → reveal: letters back + glowing key
          staff.svg.classList.remove('noletters');
          keys.setGuide(target);
          speak('Here is a hint — the key is glowing!');
        }
      };
    });
    quizAnswer = null;
    if (dead() || !found) return null;

    if (wrong === 0) firstTry++;
    staff.markHit(i); // note turns green
    if (wrong >= 2) { staff.svg.classList.add('noletters'); keys.setGuide(-1); } // hint off again
    quizEl.textContent = `${pick(PRAISE)} (${i + 1}/${len})`;
    await new Promise((r) => setTimeout(r, 350));
    if (dead()) return null;
  }

  const pts = Math.round(QUIZ_PTS * (firstTry / len));
  quizEl.textContent = `🏆 Quiz done — ${firstTry}/${len} on the first try! +${pts} points!`;
  speak(`You solved the whole quiz! ${firstTry} on the first try!`);
  await new Promise((r) => setTimeout(r, 2000));
  if (dead()) return null;

  cancelQuiz();
  game.loadSong(sec); // put the real section back on the staff
  return pts;
}

/** Generate an excited intro from the section's actually-new notes. */
function buildIntro(si: number, sec: number): TutorScript {
  const s = SONGS[si];
  const seen = new Set<number>();
  for (let i = 0; i < sec; i++) s.sections[i].song.notes.forEach((n) => seen.add(n.midi));
  const uniq = [...new Set(s.sections[sec].song.notes.map((n) => n.midi))];
  const fresh = uniq.filter((m) => !seen.has(m)).slice(0, 4);
  const list = (a: string[]) =>
    a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
  const freshNames = list(fresh.map(noteLabel));

  let intro: string;
  if (fresh.length === 0) {
    intro = `Wow, you already know every note in this! Let's put the whole song together!`;
  } else if (si === 0 && sec === 0) {
    intro = `Welcome to your very first lesson! Let's learn the note ${freshNames}!`;
  } else if (sec === 0) {
    intro = `Time for ${s.title}! First, let's meet ${fresh.length === 1 ? 'the note' : 'the notes'} ${freshNames}!`;
  } else {
    const known = list([...seen].sort((a, b) => a - b).slice(0, 3).map(noteLabel));
    intro = `Now that you know ${known}, let's learn ${fresh.length === 1 ? 'a brand new note' : `${fresh.length} new notes`}: ${freshNames}!`;
  }
  const demo = fresh.map((m) => ({
    midi: m,
    say: `${noteLabel(m)}! It's ${keyHint(m)}. Press it with your ${FINGER_NAMES[fingerFor(m)].toLowerCase()}!`,
  }));
  return { intro, demo };
}

/* ---------- profiles ---------- */
const profilesEl = document.getElementById('profiles')!;

function renderProfiles() {
  const active = activeProfile(); // creates the first profile on first run
  profilesEl.innerHTML = '';
  getProfiles().forEach((p) => {
    const b = document.createElement('button');
    b.className = 'profile' + (p.id === active.id ? ' active' : '');
    b.innerHTML = `<span class="pavatar">${p.emoji}</span>${p.name}`;
    b.addEventListener('click', () => {
      setActiveProfile(p.id);
      applySettings();
      renderMenu();
    });
    profilesEl.appendChild(b);
  });
  const add = document.createElement('button');
  add.className = 'profile add';
  add.textContent = '＋';
  add.title = 'Add a player';
  add.addEventListener('click', () => {
    const name = prompt("What's your name?")?.trim();
    if (!name) return;
    addProfile(name.slice(0, 12));
    applySettings();
    renderMenu();
  });
  profilesEl.appendChild(add);
}

function applySettings() {
  const s = loadSettings();
  const sp = s.speed ?? 0.75;
  speedRange.value = String(sp);
  speedVal.textContent = `${sp}×`;
  game.setSpeed(sp);
  chooseSource(s.source ?? 'screen', true);
  applyToggles();
}

/* ---------- option toggles: skip intro + ABC letters (persisted) ---------- */
const skipIntroBtn = document.getElementById('skipIntroBtn')!;
const abcBtn = document.getElementById('abcBtn')!;

function applyNoteLabels() {
  staff.svg.classList.toggle('noletters', loadSettings().noteLabels === false);
}
function applyToggles() {
  const s = loadSettings();
  skipIntroBtn.classList.toggle('active', !!s.skipIntro);
  abcBtn.classList.toggle('active', s.noteLabels !== false);
  if (!quizOn) applyNoteLabels(); // never un-hide mid-quiz
}
skipIntroBtn.addEventListener('click', () => {
  saveSettings({ skipIntro: !loadSettings().skipIntro });
  applyToggles();
});
abcBtn.addEventListener('click', () => {
  saveSettings({ noteLabels: loadSettings().noteLabels === false });
  applyToggles();
});

/* ---------- views ---------- */
function showMenu() {
  clearAuto();
  cancelQuiz();
  overlay.classList.add('hidden'); // finish popup must not survive navigation
  tutor.cancel();
  game.pause();
  renderMenu();
  playviewEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
}

function openSection(si: number, sec: number, withTutor = true) {
  clearAuto();
  cancelQuiz();
  round = 0;
  bestPlay = 0;
  songIdx = si;
  sectionIdx = sec;
  const s = SONGS[si];
  game.loadSong(s.sections[sec].song);
  lessonTitle.textContent = `${s.emoji} ${s.title}`;
  renderChips();
  overlay.classList.add('hidden');
  menuEl.classList.add('hidden');
  playviewEl.classList.remove('hidden');
  tutor.cancel();
  if (withTutor) {
    ctx.resume(); // opened via user tap — unlock audio for the demo + TTS
    if (loadSettings().skipIntro) game.resume(); // straight into the lesson
    else tutor.run(buildIntro(si, sec));
  }
}

function renderMenu() {
  renderProfiles();
  coursesEl.innerHTML = '';
  SONGS.forEach((s, si) => {
    const done = s.sections.filter((_, i) => getPoints(s.id, i) > 0).length;
    const whole = starsOf(getPoints(s.id, s.sections.length - 1));
    const b = document.createElement('button');
    b.className = 'lesson-row';
    b.innerHTML = `
      <span class="num">${s.emoji}</span>
      <span class="name">${s.title}<small>${done}/${s.sections.length} parts</small></span>
      <span class="stars">${starStr(whole)}</span>`;
    b.addEventListener('click', () => openSection(si, 0));
    coursesEl.appendChild(b);
  });
}

function renderChips() {
  lessonNav.innerHTML = '';
  SONGS[songIdx].sections.forEach((sec, i) => {
    const b = document.createElement('button');
    b.className = 'lesson' + (i === sectionIdx ? ' active' : '');
    const pts = getPoints(SONGS[songIdx].id, i);
    b.textContent = `${i + 1}. ${sec.title}${pts ? ` · ${pts}pt ${'⭐'.repeat(starsOf(pts))}` : ''}`;
    b.addEventListener('click', () => openSection(songIdx, i));
    lessonNav.appendChild(b);
  });
}

document.getElementById('back')!.addEventListener('click', showMenu);

/* ---------- input sources ---------- */
const screen = new ScreenSource();
const midi = new MidiSource();
const mic = new MicSource(ctx);
let currentSrc = 'screen';

const micReadout = document.getElementById('micReadout')!;
mic.onDetect = (d) => {
  micReadout.classList.toggle('live', d.live);
  micReadout.textContent = d.midi > 0
    ? `🎤 ${noteLabel(d.midi)} · ${d.freq.toFixed(0)} Hz · clarity ${d.clarity.toFixed(2)} · rms ${d.rms.toFixed(3)}`
    : `🎤 listening… · rms ${d.rms.toFixed(3)}`;
};

/** quiet=true (boot/auto-detect): fall back to Tap silently instead of alerting. */
async function chooseSource(name: string, quiet = false) {
  const source: NoteSource = name === 'midi' ? midi : name === 'mic' ? mic : screen;
  const muted = name === 'mic'; // mic mode keeps the app silent
  try {
    await game.setSource(source, muted);
    currentSrc = name;
    saveSettings({ source: name });
    micReadout.classList.toggle('hidden', name !== 'mic');
    srcBtns.forEach((b) => b.classList.toggle('active', b.dataset.src === name));
  } catch (e: any) {
    if (quiet) { if (name !== 'screen') chooseSource('screen', true); return; }
    const msg = e?.name === 'NotAllowedError'
      ? 'Access was blocked. Click the 🎤/🔒 icon in the address bar and allow it, then try again.'
      : e?.message ?? 'Could not start that input.';
    alert(msg);
    chooseSource('screen', true); // don't leave a dead source selected
  }
}
srcBtns.forEach((b) => b.addEventListener('click', () => chooseSource(b.dataset.src!)));

/* ---------- device detection ---------- */
const midiBtn = srcBtns.find((b) => b.dataset.src === 'midi')!;
const micBtn = srcBtns.find((b) => b.dataset.src === 'mic')!;

async function detectDevices() {
  // Mic: only grey the button out when capture is truly impossible (no
  // getUserMedia = insecure context or unsupported browser). Pre-permission
  // enumerateDevices() lies on Safari, so never trust it to disable the button.
  micBtn.disabled = !navigator.mediaDevices?.getUserMedia;

  // MIDI: never prompt at boot — only auto-connect if permission is already
  // granted. Hot-plug: keyboard appears → switch to it; disappears → Tap.
  try {
    const perm = await navigator.permissions.query({ name: 'midi' as PermissionName });
    if (perm.state !== 'granted') return;
    const access: any = await (navigator as any).requestMIDIAccess();
    const update = () => {
      const has = access.inputs.size > 0;
      midiBtn.disabled = !has;
      if (has && currentSrc === 'screen') chooseSource('midi', true);
      if (!has && currentSrc === 'midi') chooseSource('screen', true);
    };
    access.onstatechange = update;
    update();
  } catch { /* no Web MIDI / permissions API → manual buttons still work */ }
}

/* ---------- transport + speed ---------- */
playBtn.addEventListener('click', async () => {
  tutor.cancel(); // impatient kid wins
  clearAuto();
  if (quizOn) { // bailing out of the quiz → restore the real section
    cancelQuiz();
    game.loadSong(SONGS[songIdx].sections[sectionIdx].song);
  }
  await ctx.resume(); // AudioContext needs a user gesture
  overlay.classList.add('hidden');
  game.playPause();
});

const speedRange = document.getElementById('speedRange') as HTMLInputElement;
const speedVal = document.getElementById('speedVal')!;
speedRange.addEventListener('input', () => {
  const s = parseFloat(speedRange.value);
  game.setSpeed(s);
  speedVal.textContent = `${s}×`;
  saveSettings({ speed: s });
});

/* ---------- drag-to-seek + loop selection on the staff ----------
   Middle band (where the notes are) = grab the paper and scrub.
   Top/bottom margins = drag to select a practice loop; tap to clear it. */
const MARGIN = 52;
let mode: 'seek' | 'select' | null = null;
let downX = 0;
let downT = 0;
let selA = 0;
let dragged = false;
let wasPlaying = false;

staff.svg.addEventListener('pointerdown', (e) => {
  staff.svg.setPointerCapture(e.pointerId);
  const y = e.clientY - staff.svg.getBoundingClientRect().top;
  mode = y < MARGIN || y > STAFF_H - MARGIN ? 'select' : 'seek';
  downX = e.clientX;
  dragged = false;
  wasPlaying = game.playing;
  if (wasPlaying) game.pause();
  if (mode === 'seek') downT = game.position;
  else selA = staff.screenXToTime(e.clientX);
});
staff.svg.addEventListener('pointermove', (e) => {
  if (!mode) return;
  const dx = e.clientX - downX;
  if (Math.abs(dx) > 6) dragged = true;
  if (!dragged) return;
  if (mode === 'seek') {
    game.setPosition(downT - dx / PX_PER_SEC); // grab the paper: drag right = go back
  } else {
    const b = staff.screenXToTime(e.clientX);
    game.setLoop(Math.min(selA, b), Math.max(selA, b));
  }
});
staff.svg.addEventListener('pointerup', () => {
  if (mode === 'select' && !dragged) game.clearLoop(); // tap in margin clears
  if (wasPlaying) game.resume();
  mode = null;
});

/* ---------- boot ---------- */
renderMenu();
applySettings();
detectDevices();

// Debug hooks for screenshots: ?song=si,sec opens a section; ?at=SECONDS scrubs.
const params = new URLSearchParams(location.search);
const sng = params.get('song');
if (sng) {
  const [si, sec] = sng.split(',').map(Number);
  openSection(si || 0, sec || 0, false); // no tutor without a user gesture
}
const at = params.get('at');
if (at) setTimeout(() => game.previewAt(parseFloat(at)), 300);
const lp = params.get('loop');
if (lp) setTimeout(() => { const [a, b] = lp.split(',').map(Number); game.setLoop(a, b); }, 300);
// ?quiz starts the pop quiz on the opened section (visual check only).
if (params.has('quiz') && sng) setTimeout(() => runQuiz(), 400);
// ?ki=MIDI freezes the key-intro card (visual check only).
const ki = params.get('ki');
if (ki) showKeyIntro(parseInt(ki, 10));
// ?tut freezes the tutor bubble with the generated intro (visual check only).
if (params.has('tut') && sng) {
  const [si, sec] = sng.split(',').map(Number);
  const t = document.getElementById('tutor')!;
  t.classList.remove('hidden');
  t.querySelector('.ttxt')!.textContent = buildIntro(si || 0, sec || 0).intro;
}
