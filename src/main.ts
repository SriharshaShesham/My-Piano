import './style.css';
import { Game } from './game';
import { Staff, STAFF_H, PX_PER_SEC } from './staff';
import { Keys } from './domkeyboard';
import { Synth } from './audio';
import { SONGS, DRILLS, savePoints, getPoints, getProfiles, activeProfile, setActiveProfile, addProfile, updateProfile, loadSettings, saveSettings, getDailyDone, markDrillDone, type Profile, type SongEntry } from './curriculum';
import { initAuth, signInWithGoogle, activateProfile as activateAuth, signOutGoogle } from './sync';
import { Hand, fingerFor, FINGER_NAMES, noteLabel } from './hand';
import { Tutor, speak, type TutorScript } from './tutor';
import { Coach } from './coach';
import { playVoice, stopVoice, noteVoice, type VoiceLine } from './voice';
import { ScreenSource, MidiSource } from './sources';
import { songFromMidi } from './midi';
import { MicSource } from './mic';
import { selfTestScorer, selfTestGroup } from './scorer';
import type { NoteSource, Song } from './types';

if (import.meta.env.DEV) { selfTestScorer(); selfTestGroup(); }

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
const gateEl = document.getElementById('profileGate')!;
const landingEl = document.getElementById('landing')!;
const profilePageEl = document.getElementById('profilePage')!;
const gateProfilesEl = document.getElementById('gateProfiles')!;
const drillsEl = document.getElementById('drills')!;
const practiceEl = document.getElementById('practice')!;
const songsViewEl = document.getElementById('songsView')!;
const songsListEl = document.getElementById('songsList')!;

const VIEWS = [gateEl, landingEl, profilePageEl, menuEl, practiceEl, songsViewEl, playviewEl];
function show(view: HTMLElement) {
  VIEWS.forEach((v) => v.classList.toggle('hidden', v !== view));
}

let songIdx = 0;
let sectionIdx = 0;
let practiceDrill: string | null = null; // playview is a daily drill, not a lesson
let freeSong: Song | null = null;        // playview is an imported MIDI file — no rounds/quiz/points

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
  if (lessonStage) { advanceTwoHandStage(t); return; } // two-hand lesson: R→L→Both staging
  if (freeSong) { // imported MIDI: play for fun, no scoring
    overlay.innerHTML = `
      <div class="card">
        <div class="big">🎉</div>
        <h2>You played it!</h2>
        <div class="card-btns">
          <button id="again">🔁 AGAIN</button>
          <button id="toSongs">🎵 SONGS</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('again')!.addEventListener('click', restart);
    document.getElementById('toSongs')!.addEventListener('click', showSongs);
    return;
  }
  if (practiceDrill) { // daily drill: no rounds/quiz/points — mark it and done
    markDrillDone(practiceDrill);
    overlay.innerHTML = `
      <div class="card">
        <div class="big">✅</div>
        <h2>Practice done!</h2>
        <p>Great fingers! That's one for today.</p>
        <div class="card-btns">
          <button id="again">🔁 AGAIN</button>
          <button id="toHome">🏠 DONE</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('again')!.addEventListener('click', restart);
    document.getElementById('toHome')!.addEventListener('click', showLanding);
    return;
  }

  const { sum, wrong, total } = game.roundQuality;
  // divide by the notes the learner actually owed (hands-separate plays fewer)
  const playPts = Math.min(PLAY_PTS, Math.round((PLAY_PTS * Math.max(0, sum - 0.25 * wrong)) / Math.max(total || t, 1)));
  bestPlay = Math.max(bestPlay, playPts);
  savePoints(SONGS[songIdx].id, sectionIdx, playPts); // partial credit if the kid quits here
  round++;

  const gen = openGen;
  if (round < ROUNDS) {
    // coach reacts to the round first, then the points toast + auto-restart
    const clip = playPts >= PLAY_PTS ? 'PerfectScore' : playPts >= 9 ? 'GoodJob' : 'TryAgain';
    coach.play(clip).then(() => {
      if (gen !== openGen) return; // navigated away mid-clip
      overlay.innerHTML = `
        <div class="card">
          <div class="big">${playPts} / ${PLAY_PTS}</div>
          <h2>Round ${round} done!</h2>
          <p>${playPts < PLAY_PTS ? 'Quick fingers and right keys score more — ' : 'Perfect! '}round ${round + 1} of ${ROUNDS}!</p>
        </div>`;
      overlay.classList.remove('hidden');
      autoT = window.setTimeout(restart, 2500);
    });
    return;
  }

  // all rounds played → pop quiz, celebrate, then the stars modal
  (async () => {
    const quizPts = await runQuiz();
    if (quizPts === null || gen !== openGen) return;
    await coach.play('SectionComplete');
    if (gen !== openGen) return;
    showStars(bestPlay + quizPts);
  })();
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

const coach = new Coach(document.getElementById('coach')!);
let openGen = 0; // bumped on every navigation; stale async flows check it and bail

const game = new Game(staff, keys, ctx, synth, showScore, showFinish);
game.onStateChange = (playing) => {
  playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
};
const handL = new Hand(document.getElementById('handL')!); handL.setHand('L');
const handR = new Hand(document.getElementById('handR')!); handR.setHand('R');
game.onGuide = (notes) => {
  handR.setNote(notes.filter((n) => n.hand !== 'L').map((n) => n.midi)); // untagged notes → right
  handL.setNote(notes.filter((n) => n.hand === 'L').map((n) => n.midi));
};
/** Show only the hand widget(s) a piece actually uses. */
function showHandWidgets(hasR: boolean, hasL: boolean) {
  document.getElementById('handR')!.classList.toggle('hidden', !hasR);
  document.getElementById('handL')!.classList.toggle('hidden', !hasL);
}

/* ---------- hands practice mode (Right / Left / Both) ---------- */
const handBtns = [...document.querySelectorAll<HTMLButtonElement>('.hnd')];
const handsModeEl = document.getElementById('handsMode')!;
let curHands: 'L' | 'R' | 'both' = 'both';
let lessonStage: 'L' | 'R' | 'both' | null = null; // non-null while a two-hand lesson is stepping R→L→Both

function applyHands(mode: 'L' | 'R' | 'both') {
  curHands = mode;
  game.setHands(mode);
  handBtns.forEach((b) => b.classList.toggle('active', b.dataset.hand === mode));
  if (lessonStage) lessonStage = mode; // manual switch mid-lesson keeps the stage in sync
}
handBtns.forEach((b) => b.addEventListener('click', () => applyHands(b.dataset.hand as 'L' | 'R' | 'both')));

/** Configure the play view for a song: widget visibility, the toggle, default mode. */
function setupHands(song: Song, dflt: 'L' | 'R' | 'both') {
  const hasR = song.notes.some((n) => n.hand !== 'L'); // untagged (mono) notes → right
  const hasL = song.notes.some((n) => n.hand === 'L');
  const both = hasR && hasL;
  showHandWidgets(hasR, hasL);
  handsModeEl.classList.toggle('hidden', !both); // toggle only matters for two-hand pieces
  applyHands(both ? dflt : hasL ? 'L' : 'R');
  micGuard();
}

/** Mic hears one note at a time — can't play both hands together. Force separate. */
function micGuard() {
  const bothBtn = handBtns.find((b) => b.dataset.hand === 'both')!;
  const block = currentSrc === 'mic' && !handsModeEl.classList.contains('hidden');
  bothBtn.disabled = block;
  bothBtn.title = block ? 'Mic hears one note at a time — use Tap or USB MIDI for both hands' : '';
  if (block && curHands === 'both') applyHands('R');
}

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

let demoGen = 0; // cancels the multi-step demo flow when the tutor is skipped
const tutor = new Tutor(document.getElementById('tutor')!, {
  demoNote: (midi) => {
    game.play(midi); // real key press: flash + sound (fires before the wait arms)
    handR.setNote(midi);
    keys.setGuide(midi); // hold the teal highlight on the real key
    showKeyIntro(midi); // centered "here's where it lives" card
    return waitForKey(midi); // tutor proceeds once the kid presses it
  },
  demoSection: async () => {
    const g = ++demoGen;
    hideKeyIntro();
    await coach.play('WatchMeIntro');
    if (g !== demoGen) return;
    await game.demo();
    if (g !== demoGen) return;
    await coach.play('YourTurn');
  },
  onStart: async () => { hideKeyIntro(); await ctx.resume(); game.setPosition(0); game.resume(); },
  onCancel: () => { demoGen++; hideKeyIntro(); introCancel?.(); coach.stop(); game.stopDemo(); },
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
  stopVoice();
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
  handR.setNote(-1); handL.setNote(-1);
  staff.svg.classList.add('noletters'); // no giving away the answers
  staff.setSong({ ...sec, notes: seq.map((m, i) => ({ midi: m, start: i * STEP, duration: 0.45 })) });
  await coach.play('QuizTime'); // "can you find the mystery notes?"
  if (dead()) return null;
  quizEl.classList.remove('hidden');
  quizEl.textContent = `🕵️ Quiz! Play all ${len} mystery notes in order!`;

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
        if (wrong === 1) coach.play('TryAgain'); // wrong key → coach cheers them on
        if (wrong === 2) { // stuck → reveal: letters back + glowing key
          staff.svg.classList.remove('noletters');
          keys.setGuide(target);
          coach.play('QuizHint'); // "look for the glowing key!"
        }
      };
    });
    quizAnswer = null;
    if (dead() || !found) return null;

    coach.stop(); // right answer cuts any TryAgain/hint clip short
    if (wrong === 0) firstTry++;
    staff.markHit(i); // note turns green
    if (wrong >= 2) { staff.svg.classList.add('noletters'); keys.setGuide(-1); } // hint off again
    quizEl.textContent = `${pick(PRAISE)} (${i + 1}/${len})`;
    await playVoice(pick(['found_1', 'found_2', 'found_3'] as VoiceLine[]));
    if (dead()) return null;
  }

  const pts = Math.round(QUIZ_PTS * (firstTry / len));
  quizEl.textContent = `🏆 Quiz done — ${firstTry}/${len} on the first try! +${pts} points!`;
  await playVoice(firstTry === len ? 'quiz_done_perfect' : 'quiz_done');
  await new Promise((r) => setTimeout(r, 800));
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

  // fixed lines so every one has a pre-generated character voice file
  let intro: string;
  let introAudio: VoiceLine;
  if (fresh.length === 0) {
    intro = `Wow, you already know every note in this! Let's put the whole song together!`;
    introAudio = 'know_all';
  } else if (si === 0 && sec === 0) {
    intro = `Welcome to your very first lesson! Let's learn the note ${freshNames}!`;
    introAudio = 'first_lesson';
  } else if (fresh.length === 1) {
    intro = 'Time to learn a brand new note!';
    introAudio = 'new_note_one';
  } else {
    intro = 'Time to learn some brand new notes!';
    introAudio = 'new_note_many';
  }
  const demo = fresh.map((m) => ({
    midi: m,
    say: `${noteLabel(m)}! It's ${keyHint(m)}. Press it with your ${FINGER_NAMES[fingerFor(m)].toLowerCase()}!`,
    audio: noteVoice(m) ?? undefined, // unmapped midi → Web Speech fallback
  }));
  return { intro, introAudio, demo };
}

/* ---------- profile gate (launch screen) + add-profile chooser ---------- */
let googleReady = false; // GIS loaded + client id configured

const G_SVG = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.3 34.9 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;
const LOCAL_WARN = "A local profile lives only in this browser — clearing browser data erases it, and it won't follow you to other devices. Sign in with Google to keep progress safe.";

/** Round photo + Google badge for google profiles, emoji for local. */
function avatarHTML(p: Profile) {
  return p.picture
    ? `<span class="pavatar gphoto"><img src="${p.picture}" alt="" referrerpolicy="no-referrer"><span class="gbadge">${G_SVG}</span></span>`
    : `<span class="pavatar">${p.emoji ?? '👤'}</span>`;
}

function chooserContent() {
  return `
    <div class="chooser-btns">
      ${googleReady ? `<button class="gbtn ch-google">${G_SVG} Sign in with Google</button>` : ''}
      <button class="gbtn ch-local">🐻 Local profile</button>
    </div>
    <p class="chooser-warn">${LOCAL_WARN}</p>`;
}

function wireChooser(root: HTMLElement) {
  root.querySelector('.ch-google')?.addEventListener('click', googleSignInFlow);
  root.querySelector('.ch-local')?.addEventListener('click', localCreateFlow);
}

async function googleSignInFlow() {
  overlay.classList.add('hidden');
  ctx.resume(); // the click is the audio-unlock gesture
  const p = await signInWithGoogle(); // interactive: popup happens inside the gesture
  if (!p) { showGate(); return; } // declined/blocked — back to the gate
  applySettings();
  showLanding();
}

function localCreateFlow() {
  const name = prompt("What's your name?")?.trim();
  if (!name) return;
  overlay.classList.add('hidden');
  addProfile(name.slice(0, 12));
  ctx.resume();
  applySettings();
  showLanding();
}

function showChooser() {
  overlay.innerHTML = `
    <div class="card">
      <h2>Add a player</h2>
      ${chooserContent()}
      <div class="card-btns"><button id="chCancel">CANCEL</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  wireChooser(overlay);
  document.getElementById('chCancel')!.addEventListener('click', () => overlay.classList.add('hidden'));
}

function renderGate() {
  const ps = getProfiles();
  gateProfilesEl.innerHTML = '';
  ps.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'profile';
    b.innerHTML = `${avatarHTML(p)}${p.name}`;
    b.addEventListener('click', () => {
      setActiveProfile(p.id);
      ctx.resume(); // the gate tap is the gesture that unlocks audio
      applySettings();
      showLanding(); // enter immediately on cached data…
      activateAuth(p); // …auth + sync catch up in the background (google only)
    });
    gateProfilesEl.appendChild(b);
  });
  const add = document.createElement('button');
  add.className = 'profile add';
  add.innerHTML = `<span class="pavatar">＋</span>${ps.length ? '' : 'Add a player'}`;
  add.title = 'Add a player';
  add.addEventListener('click', showChooser); // ＋ is the only way in — never auto-prompt
  gateProfilesEl.appendChild(add);
}

function applySettings() {
  const s = loadSettings();
  const sp = s.speed ?? 0.75;
  speedRange.value = String(sp);
  speedVal.textContent = `${sp}×`;
  game.setSpeed(sp);
  chooseSource(s.source ?? 'screen', true);
  applyToggles();
  document.getElementById('pvAvatar')!.innerHTML = avatarHTML(activeProfile());
}

/* ---------- persisted option toggles (managed on the profile page) ---------- */
function applyNoteLabels() {
  staff.svg.classList.toggle('noletters', loadSettings().noteLabels === false);
}
function applyToggles() {
  const s = loadSettings();
  coach.enabled = s.videos !== false; // Interactive videos setting
  if (!quizOn) applyNoteLabels(); // never un-hide mid-quiz
}

/* ---------- views + navigation ---------- */
/** Every navigation goes through here: bumps the generation counter so all
 *  pending async flows (clips, quiz, tutor, auto-advance) bail cleanly. */
function teardown() {
  openGen++;
  clearAuto();
  cancelQuiz();
  coach.stop();
  overlay.classList.add('hidden'); // popups must not survive navigation
  tutor.cancel();
  window.speechSynthesis?.cancel(); // stop any two-hand stage narration
  lessonStage = null;
  freeSong = null;
  game.pause();
}

function showGate() {
  teardown();
  renderGate();
  show(gateEl);
}

function showLanding() {
  teardown();
  renderLanding();
  show(landingEl);
}

function showProfilePage() {
  teardown();
  renderProfilePage();
  show(profilePageEl);
}

function showPractice() {
  teardown();
  renderDrills();
  show(practiceEl);
}

function showSongs() {
  teardown();
  renderSongs();
  show(songsViewEl);
}

function showMenu() {
  const fromLesson = !playviewEl.classList.contains('hidden') && !practiceDrill;
  teardown();
  renderMenu();
  show(menuEl);
  if (fromLesson) coach.play('Goodbye'); // non-blocking wave over the menu
}

/** Two-hand lesson: teach one hand at a time, then together. Each stage shows a
 *  prompt, then plays that hand in wait-mode (the other hand auto-plays). */
const STAGE_PROMPT = {
  R: ['✋', 'Right hand first!', 'Just the melody — play with your right hand.'],
  L: ['🤚', 'Now the left hand!', 'Just the bass — play with your left hand.'],
  both: ['🙌', 'Both hands together!', "Now put them together — you've got this!"],
} as const;

function startTwoHandStage(stage: 'L' | 'R' | 'both') {
  lessonStage = stage;
  applyHands(stage);
  game.setPosition(0);
  const gen = openGen;
  const [emoji, title, sub] = STAGE_PROMPT[stage];
  overlay.innerHTML = `<div class="card"><div class="big">${emoji}</div><h2>${title}</h2><p>${sub}</p></div>`;
  overlay.classList.remove('hidden');
  speak(`${title} ${sub}`);
  autoT = window.setTimeout(() => {
    if (gen !== openGen) return;
    overlay.classList.add('hidden');
    ctx.resume();
    game.resume(); // wait-mode for this hand
  }, 2600);
}

/** A two-hand lesson stage finished → advance R→L→Both, or score the Both pass. */
function advanceTwoHandStage(t: number) {
  const gen = openGen;
  if (lessonStage === 'R') { coach.play('GoodJob').then(() => gen === openGen && startTwoHandStage('L')); return; }
  if (lessonStage === 'L') { coach.play('GoodJob').then(() => gen === openGen && startTwoHandStage('both')); return; }
  const { sum, wrong, total } = game.roundQuality; // both-hands pass → full 20-point score
  const pts = Math.min(20, Math.round((20 * Math.max(0, sum - 0.25 * wrong)) / Math.max(total || t, 1)));
  lessonStage = null;
  coach.play('SectionComplete').then(() => gen === openGen && showStars(pts));
}

/** Short "these are the two parts" intro shown once when a two-hand lesson opens. */
async function teachConcept() {
  const gen = openGen;
  overlay.innerHTML = `<div class="card">
      <div class="big">🎵</div>
      <h2>Two parts!</h2>
      <p>The <b>melody</b> is the tune — your right hand ✋<br>
         The <b>bass</b> is the low notes — your left hand 🤚</p>
    </div>`;
  overlay.classList.remove('hidden');
  await speak('This song has two parts. The melody is the tune — your right hand plays it. The bass is the low notes — your left hand plays it.');
  if (gen !== openGen) return;
  await new Promise((r) => { autoT = window.setTimeout(r, 500); });
  if (gen !== openGen) return;
  overlay.classList.add('hidden');
}

/** Standalone "Music Words" lesson: hear the melody alone, the bass alone, then both. */
async function runConceptLesson(s: SongEntry) {
  const gen = openGen;
  const full = s.sections[0].song;
  const onlyHand = (h: 'L' | 'R'): Song =>
    ({ ...full, notes: full.notes.filter((n) => (h === 'R' ? n.hand !== 'L' : n.hand === 'L')) });
  const step = async (emoji: string, title: string, body: string, say: string, song: Song) => {
    if (gen !== openGen) return false;
    overlay.innerHTML = `<div class="card"><div class="big">${emoji}</div><h2>${title}</h2><p>${body}</p></div>`;
    overlay.classList.remove('hidden');
    await speak(say);
    if (gen !== openGen) return false;
    overlay.classList.add('hidden');
    game.loadSong(song);
    setupHands(song, 'both');
    await game.demo(); // app plays this part hands-free
    return gen === openGen;
  };
  if (!await step('🎵', 'The Melody', 'The tune — your right hand ✋. Listen!', 'The melody is the tune. Your right hand plays it. Listen!', onlyHand('R'))) return;
  if (!await step('🎵', 'The Bass', 'The low notes — your left hand 🤚. Listen!', 'The bass is the low notes underneath. Your left hand plays it. Listen!', onlyHand('L'))) return;
  if (!await step('🎶', 'Together!', 'Melody and bass together make music!', 'Now both together. The melody and the bass make music!', full)) return;
  savePoints(s.id, 0, 20); // listening it through = done, or Continue targets it forever
  overlay.innerHTML = `<div class="card">
      <div class="big">🌟</div><h2>You did it!</h2>
      <p>Now you know <b>melody</b> and <b>bass</b>!</p>
      <div class="card-btns"><button id="conceptDone">🏠 Done</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('conceptDone')!.addEventListener('click', showMenu);
}

function openSection(si: number, sec: number, withTutor = true) {
  const fromMenu = !menuEl.classList.contains('hidden');
  teardown();
  const gen = openGen;
  practiceDrill = null;
  lessonStage = null;
  round = 0;
  bestPlay = 0;
  songIdx = si;
  sectionIdx = sec;
  const s = SONGS[si];
  game.loadSong(s.sections[sec].song);
  setupHands(s.sections[sec].song, 'both');
  lessonTitle.textContent = `${s.emoji} ${s.title}`;
  renderChips();
  show(playviewEl);
  if (!withTutor) return;
  ctx.resume(); // opened via user tap — unlock audio for the clips + TTS
  (async () => {
    if (s.category === 'concept') { await runConceptLesson(s); return; } // listen-only "what is melody/bass"
    if (s.category === 'twohand') { // teach hands separately, then together
      if (fromMenu) { await coach.play('LessonWelcome'); if (gen !== openGen) return; await teachConcept(); }
      if (gen !== openGen) return;
      startTwoHandStage('R');
      return;
    }
    if (s.category === 'songs') {
      // Songs library: play the tune through once so they hear it, then hand over
      await coach.play('WatchMeIntro');
      if (gen !== openGen) return;
      await game.demo();
      if (gen !== openGen) return;
      await coach.play('YourTurn');
      if (gen !== openGen) return;
      game.resume(); // wait-mode from the top
      return;
    }
    if (fromMenu) await coach.play('LessonWelcome'); // lesson launched → welcome
    if (gen !== openGen) return;
    if (loadSettings().skipIntro) { game.resume(); return; } // straight in
    const script = buildIntro(si, sec);
    if (script.demo.length) await coach.play('NewNoteIntro'); // "a brand new key!"
    if (gen !== openGen) return;
    tutor.run(script);
  })();
}

function openDrill(id: string) {
  const d = DRILLS.find((x) => x.id === id);
  if (!d) return;
  teardown();
  practiceDrill = id;
  game.loadSong(d.song);
  setupHands(d.song, d.hand);
  lessonTitle.textContent = `${d.emoji} ${d.hand === 'L' ? 'Left hand' : 'Right hand'} · ${d.title}`;
  lessonNav.innerHTML = ''; // no section chips in practice
  show(playviewEl);
  ctx.resume();
  game.resume(); // wait-mode holds on the first note until the kid plays it
}

/* ---------- landing ---------- */
const landingAvatar = document.getElementById('landingAvatar')!;
const overallFill = document.getElementById('overallFill')!;
const overallPct = document.getElementById('overallPct')!;
const learnTitle = document.getElementById('learnTitle')!;
const practiceCount = document.getElementById('practiceCount')!;

/** Next section worth playing: first untouched, else first not-yet-perfect.
 *  Learning track only — the Songs library is play-for-fun, not the curriculum. */
function continueTarget(): [number, number] | null {
  for (const pass of [(p: number) => p === 0, (p: number) => p < 20]) {
    for (let si = 0; si < SONGS.length; si++) {
      if (SONGS[si].category === 'songs') continue;
      for (let sec = 0; sec < SONGS[si].sections.length; sec++)
        if (pass(getPoints(SONGS[si].id, sec))) return [si, sec];
    }
  }
  return null;
}

function renderLanding() {
  const p = activeProfile();
  landingAvatar.innerHTML = `${avatarHTML(p)}${p.name}`;
  cloudChip.classList.toggle('hidden', p.kind !== 'google');
  const learn = SONGS.filter((s) => s.category !== 'songs'); // progress bar tracks the curriculum only
  const total = learn.reduce((n, s) => n + s.sections.length, 0) * 20;
  const earned = learn.reduce((n, s) => n + s.sections.reduce((m, _, i) => m + getPoints(s.id, i), 0), 0);
  const pct = Math.round((earned / total) * 100);
  overallFill.style.width = `${pct}%`;
  overallPct.textContent = `${pct}% · ${earned} / ${total} points`;
  learnTitle.textContent = earned > 0 ? 'Continue Learning' : 'Start Learning';
  document.getElementById('continueBtn')!.textContent = earned > 0 ? '▶ Continue' : '▶ Start';
  const done = getDailyDone();
  practiceCount.textContent = `${done.size} / ${DRILLS.length} done today`;
  const songCount = SONGS.filter((s) => s.category === 'songs').length;
  document.getElementById('songsCount')!.textContent = `${songCount} to play`;
}

function renderDrills() {
  const done = getDailyDone();
  drillsEl.innerHTML = '';
  const levels = [...new Set(DRILLS.map((d) => d.level))].sort((a, b) => a - b);
  levels.forEach((lv) => {
    const rows = DRILLS.filter((d) => d.level === lv);
    const head = document.createElement('h3');
    head.textContent = `${rows[0].emoji} Level ${lv} · ${rows[0].title}`;
    drillsEl.appendChild(head);
    rows.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'lesson-row';
      b.innerHTML = `
        <span class="num">${d.hand === 'R' ? '✋' : '🤚'}</span>
        <span class="name">${d.hand === 'R' ? 'Right hand' : 'Left hand'}</span>
        <span class="stars">${done.has(d.id) ? '✅' : '⬜'}</span>`;
      b.addEventListener('click', () => openDrill(d.id));
      drillsEl.appendChild(b);
    });
  });
}

function renderSongs() {
  songsListEl.innerHTML = '';
  SONGS.forEach((s, si) => {
    if (s.category !== 'songs') return; // keep the true SONGS index for openSection
    const whole = starsOf(getPoints(s.id, s.sections.length - 1));
    const b = document.createElement('button');
    b.className = 'lesson-row';
    b.innerHTML = `
      <span class="num">${s.emoji}</span>
      <span class="name">${s.title}</span>
      <span class="stars">${starStr(whole)}</span>`;
    b.addEventListener('click', () => openSection(si, 0));
    songsListEl.appendChild(b);
  });
  const open = document.createElement('button');
  open.className = 'lesson-row';
  open.innerHTML = `
    <span class="num">📂</span>
    <span class="name">Play your own MIDI file<small>the melody is yours — the rest plays along</small></span>
    <span class="stars"></span>`;
  open.addEventListener('click', () => midiFile.click());
  songsListEl.appendChild(open);
}

/* imported .mid → free play with backing (melody = highest-pitched track) */
const midiFile = document.createElement('input');
midiFile.type = 'file';
midiFile.accept = '.mid,.midi';
midiFile.addEventListener('change', async () => {
  const f = midiFile.files?.[0];
  midiFile.value = ''; // re-picking the same file must fire change again
  if (!f) return;
  try {
    openMidiSong(songFromMidi(await f.arrayBuffer(), f.name.replace(/\.midi?$/i, '')));
  } catch (e: any) {
    alert(e?.message ?? 'Could not read that MIDI file.');
  }
});

function openMidiSong(song: Song) {
  teardown();
  freeSong = song;
  practiceDrill = null;
  game.loadSong(song);
  setupHands(song, 'both');
  lessonTitle.textContent = `🎼 ${song.title}`;
  lessonNav.innerHTML = '';
  show(playviewEl);
  ctx.resume(); // the file-pick click is the gesture
  game.resume(); // wait-mode from the top, band follows the kid
}

/* ---------- profile page ---------- */
const ppTitle = document.getElementById('ppTitle')!;
const ppName = document.getElementById('ppName') as HTMLInputElement;
const ppTutorial = document.getElementById('ppTutorial')!;
const ppLetters = document.getElementById('ppLetters')!;
const ppVideos = document.getElementById('ppVideos')!;

function setToggle(el: HTMLElement, on: boolean) {
  el.classList.toggle('active', on);
  el.querySelector('.state')!.textContent = on ? 'On' : 'Off';
}

const ppSignOut = document.getElementById('ppSignOut')!;
const ppWarn = document.getElementById('ppWarn')!;

function renderProfilePage() {
  const p = activeProfile();
  ppTitle.innerHTML = `${avatarHTML(p)} ${p.name}`;
  ppName.value = p.name;
  const s = loadSettings();
  setToggle(ppTutorial, !s.skipIntro); // Tutorial mode = intro NOT skipped
  setToggle(ppLetters, s.noteLabels !== false);
  setToggle(ppVideos, s.videos !== false);
  ppSignOut.classList.toggle('hidden', p.kind !== 'google');
  ppWarn.classList.toggle('hidden', p.kind === 'google');
  ppWarn.textContent = LOCAL_WARN;
}

ppSignOut.addEventListener('click', () => {
  signOutGoogle(activeProfile()); // revoke + remove the card; data stays in Drive
  showGate();
});

ppName.addEventListener('change', () => {
  const name = ppName.value.trim().slice(0, 12);
  if (name) updateProfile(activeProfile().id, { name });
  renderProfilePage();
});
ppTutorial.addEventListener('click', () => {
  saveSettings({ skipIntro: !loadSettings().skipIntro });
  applyToggles();
  renderProfilePage();
});
ppLetters.addEventListener('click', () => {
  saveSettings({ noteLabels: loadSettings().noteLabels === false });
  applyToggles();
  renderProfilePage();
});
ppVideos.addEventListener('click', () => {
  saveSettings({ videos: loadSettings().videos === false });
  applyToggles();
  renderProfilePage();
});

function renderMenu() {
  coursesEl.innerHTML = '';
  const heads: Record<string, string> = { concept: '🎓 Music Words', twohand: '🙌 Two Hands' };
  const shown = new Set<string>();
  SONGS.forEach((s, si) => {
    if (s.category === 'songs') return; // Songs library has its own page
    if (s.category && heads[s.category] && !shown.has(s.category)) { // section header once per group
      const h = document.createElement('h2');
      h.className = 'course-head';
      h.textContent = heads[s.category];
      coursesEl.appendChild(h);
      shown.add(s.category);
    }
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

/* ---------- navigation buttons ---------- */
document.getElementById('back')!.addEventListener('click', () =>
  freeSong ? showSongs() : practiceDrill ? showPractice() : SONGS[songIdx]?.category === 'songs' ? showSongs() : showMenu());
document.getElementById('menuBack')!.addEventListener('click', showLanding);
document.getElementById('pvAvatar')!.addEventListener('click', showGate);
document.getElementById('ppBack')!.addEventListener('click', showLanding);
landingAvatar.addEventListener('click', showProfilePage);
document.getElementById('switchProfile')!.addEventListener('click', showGate);
document.getElementById('learnCard')!.addEventListener('click', showMenu);
document.getElementById('continueBtn')!.addEventListener('click', (e) => {
  e.stopPropagation(); // don't trigger the surrounding Learning card
  const t = continueTarget();
  t ? openSection(t[0], t[1]) : showMenu();
});
document.getElementById('practiceCard')!.addEventListener('click', showPractice);
document.getElementById('practiceBack')!.addEventListener('click', showLanding);
document.getElementById('songsCard')!.addEventListener('click', showSongs);
document.getElementById('songsBack')!.addEventListener('click', showLanding);

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
    coach.muted = muted; // mic mode: coach animates silently
    currentSrc = name;
    saveSettings({ source: name });
    micReadout.classList.toggle('hidden', name !== 'mic');
    srcBtns.forEach((b) => b.classList.toggle('active', b.dataset.src === name));
    micGuard(); // mic can't play both hands at once

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

// phone: sources live behind a ☰ toggle — open/close it, and close on selection
const sourcesEl = document.getElementById('sources')!;
const srcToggle = document.getElementById('srcToggle')!;
srcToggle.addEventListener('click', () => {
  const open = sourcesEl.classList.toggle('open');
  srcToggle.setAttribute('aria-expanded', String(open));
});
srcBtns.forEach((b) => b.addEventListener('click', () => {
  sourcesEl.classList.remove('open');
  srcToggle.setAttribute('aria-expanded', 'false');
}));

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
  openGen++; // abandon any pending welcome/round clip flow
  coach.stop();
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

/* ---------- auth + per-profile cloud sync (guest-safe) ---------- */
const cloudChip = document.getElementById('cloudChip')!;
initAuth({
  clientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID,
  onStatus: (s) => {
    if (s === 'ready') { // Google option becomes available in the choosers
      googleReady = true;
      if (!gateEl.classList.contains('hidden')) renderGate();
      if (!overlay.classList.contains('hidden') && overlay.querySelector('.chooser-btns')) showChooser(); // chooser open → add the option
      return;
    }
    cloudChip.textContent =
      s === 'syncing' ? '☁️ Syncing…' :
      s === 'synced' ? '☁️ Synced' :
      '☁️ Offline — tap to reconnect';
    cloudChip.classList.toggle('clickable', s === 'offline' || s === 'error');
    if (activeProfile().kind === 'google') cloudChip.classList.remove('hidden');
  },
  onRemoteChange: () => { // remote data merged in → refresh whatever is visible
    applyToggles(); // settings may have changed remotely
    if (!gateEl.classList.contains('hidden')) renderGate();
    else if (!landingEl.classList.contains('hidden')) renderLanding();
    else if (!menuEl.classList.contains('hidden')) renderMenu();
  },
});
cloudChip.addEventListener('click', () => { // fresh gesture beats popup blockers
  if (cloudChip.classList.contains('clickable')) activateAuth(activeProfile());
});

/* ---------- boot ---------- */
applySettings();
detectDevices();

// Debug hooks for screenshots: ?song=si,sec opens a section; ?at=SECONDS scrubs;
// ?view=landing|profile|menu opens a view; ?drill=id opens a practice drill.
const params = new URLSearchParams(location.search);
const sng = params.get('song');
const view = params.get('view');
const drl = params.get('drill');
if (sng) {
  const [si, sec] = sng.split(',').map(Number);
  openSection(si || 0, sec || 0, false); // no tutor without a user gesture
} else if (drl) {
  openDrill(drl);
} else if (view === 'landing') {
  showLanding();
} else if (view === 'profile') {
  showProfilePage();
} else if (view === 'menu') {
  showMenu();
} else if (view === 'chooser') {
  showGate();
  showChooser(); // visual check of the add-profile chooser
} else {
  showGate(); // normal launch: pick who's playing or sign in
}
const at = params.get('at');
if (at) setTimeout(() => game.previewAt(parseFloat(at)), 300);
const lp = params.get('loop');
if (lp) setTimeout(() => { const [a, b] = lp.split(',').map(Number); game.setLoop(a, b); }, 300);
// ?coach=ClipName plays one coach clip (visual check only).
const ck = params.get('coach');
if (ck) coach.play(ck as any);
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
