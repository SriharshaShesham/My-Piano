import type { Song, SongNote } from './types';

export type Section = { title: string; song: Song };
export type SongEntry = { id: string; emoji: string; title: string; sections: Section[] };

const BEAT = 0.5; // seconds per quarter note (120 bpm)
type Pair = [number, number]; // [midi, beats]

// ponytail: hardcoded public-domain tunes as [midi, beats] phrases;
// @tonejs/midi produces the same Song shape if we ever import files.
function song(title: string, pairs: Pair[]): Song {
  const notes: SongNote[] = [];
  let t = 1.2; // lead-in
  for (const [midi, beats] of pairs) {
    if (midi > 0) notes.push({ midi, start: t, duration: beats * BEAT }); // midi 0 = rest
    t += beats * BEAT;
  }
  return { title, notes, bpm: 120 };
}
const REST = 0;

/** Sections = each phrase alone, then the whole song (if more than one). */
function entry(id: string, emoji: string, title: string, phrases: Pair[][], phraseTitles?: string[]): SongEntry {
  const sections: Section[] = phrases.map((p, i) => ({
    title: phraseTitles?.[i] ?? `Part ${i + 1}`,
    song: song(title, p),
  }));
  if (phrases.length > 1) sections.push({ title: 'Whole song', song: song(title, phrases.flat()) });
  return { id, emoji, title, sections };
}

const C = 60, D = 62, E = 64, F = 65, G = 67, A = 69, AS = 70, C5 = 72, G3 = 55;
const q = (...ms: number[]): Pair[] => ms.map((m) => [m, 1]);

/* ---------- the songs ---------- */

const warmUps: SongEntry = {
  id: 'warm-ups', emoji: '🐣', title: 'Warm-Ups',
  sections: [
    // quarters with rests between — whole notes (open circles) confuse a first-timer
    { title: 'Meet Middle C', song: song('Meet Middle C', [[C, 1], [REST, 1], [C, 1], [REST, 1], [C, 1], [REST, 1], [C, 1]]) },
    { title: 'C and D', song: song('C and D', [...q(C, C, D, D, C, C, D, D, C, D), [C, 2]]) },
    { title: 'Three-Note March', song: song('Three-Note March', [...q(C, D, E, C, C, D, E, C, E, E, D, D), [C, 2]]) },
    { title: 'Five-Finger March', song: song('Five-Finger March', [...q(C, D, E, F), [G, 2], [G, 2], ...q(G, F, E, D), [C, 2], [C, 2], ...q(C, E, G, E), [C, 4]]) },
  ],
};

const hotCrossBuns = entry('hot-cross-buns', '🥐', 'Hot Cross Buns', [
  [[E, 1], [D, 1], [C, 2], [E, 1], [D, 1], [C, 2]],
  [...q(C, C, C, C, D, D, D, D), [E, 1], [D, 1], [C, 2]],
]);

const maryLamb = entry('mary-lamb', '🐑', 'Mary Had a Little Lamb', [
  [...q(E, D, C, D, E, E), [E, 2], ...q(D, D), [D, 2], ...q(E, G), [G, 2]],
  [...q(E, D, C, D, E, E, E, E, D, D, E, D), [C, 4]],
]);

const odeToJoy = entry('ode-to-joy', '🎵', 'Ode to Joy', [
  [...q(E, E, F, G, G, F, E, D, C, C, D, E), [E, 1.5], [D, 0.5], [D, 2]],
  [...q(E, E, F, G, G, F, E, D, C, C, D, E), [D, 1.5], [C, 0.5], [C, 2]],
]);

const saints = entry('saints', '🎺', 'When the Saints Go Marching In', [
  [...q(C, E, F), [G, 3], ...q(C, E, F), [G, 3]],
  [...q(C, E, F, G, E, C, E), [D, 3]],
  [...q(E, E, D), [C, 2], ...q(E, G, G), [F, 2], ...q(E, F, G, E, C, D), [C, 3]],
]);

const londonBridge = entry('london-bridge', '🌉', 'London Bridge', [
  [[G, 1.5], [A, 0.5], ...q(G, F, E, F), [G, 2], ...q(D, E), [F, 2], ...q(E, F), [G, 2]],
  [[G, 1.5], [A, 0.5], ...q(G, F, E, F), [G, 2], [D, 2], [G, 2], [E, 1], [C, 3]],
]);

const TW1: Pair[] = [...q(C, C, G, G, A, A), [G, 2]];
const TW2: Pair[] = [...q(F, F, E, E, D, D), [C, 2]];
const TW3: Pair[] = [...q(G, G, F, F, E, E), [D, 2]];
const twinkle: SongEntry = {
  id: 'twinkle', emoji: '⭐', title: 'Twinkle Twinkle Little Star',
  sections: [
    { title: 'Twinkle twinkle little star', song: song('Twinkle Twinkle', TW1) },
    { title: 'How I wonder what you are', song: song('Twinkle Twinkle', TW2) },
    { title: 'Up above the world so high', song: song('Twinkle Twinkle', TW3) },
    { title: 'Like a diamond in the sky', song: song('Twinkle Twinkle', TW3) },
    { title: 'Whole song', song: song('Twinkle Twinkle', [...TW1, ...TW2, ...TW3, ...TW3, ...TW1, ...TW2]) },
  ],
};

const rowYourBoat = entry('row-boat', '🚣', 'Row Row Row Your Boat', [
  [[C, 1], [C, 1], [C, 0.75], [D, 0.25], [E, 2], [E, 0.75], [D, 0.25], [E, 0.75], [F, 0.25], [G, 3]],
  [[C5, 0.5], [C5, 0.5], [C5, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [E, 0.5], [E, 0.5], [E, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], ...q(G, F, E, D), [C, 2]],
]);

const oldMacDonald = entry('old-macdonald', '🚜', 'Old MacDonald', [
  [...q(C, C, C, G, A, A), [G, 2], ...q(E, E, D, D), [C, 2]],
  [...q(G, C, C, C, G, A, A), [G, 2], ...q(E, E, D, D), [C, 2]],
]);

const jingleBells = entry('jingle-bells', '🔔', 'Jingle Bells', [
  [...q(E, E), [E, 2], ...q(E, E), [E, 2], ...q(E, G, C, D), [E, 4]],
  [...q(F, F, F, F, F, E, E), [E, 0.5], [E, 0.5], ...q(E, D, D, E), [D, 2], [G, 2]],
  [...q(E, E), [E, 2], ...q(E, E), [E, 2], ...q(E, G, C, D), [E, 4]],
  [...q(F, F, F, F, F, E, E), [E, 0.5], [E, 0.5], ...q(G, G, F, D), [C, 4]],
]);

const frereJacques = entry('frere-jacques', '😴', 'Frère Jacques', [
  q(C, D, E, C, C, D, E, C),
  [[E, 1], [F, 1], [G, 2], [E, 1], [F, 1], [G, 2]],
  [[G, 0.5], [A, 0.5], [G, 0.5], [F, 0.5], [E, 1], [C, 1], [G, 0.5], [A, 0.5], [G, 0.5], [F, 0.5], [E, 1], [C, 1]],
  [[C, 1], [G3, 1], [C, 2], [C, 1], [G3, 1], [C, 2]],
]);

const happyBirthday = entry('happy-birthday', '🎂', 'Happy Birthday', [
  [[C, 0.75], [C, 0.25], ...q(D, C, F), [E, 2]],
  [[C, 0.75], [C, 0.25], ...q(D, C, G), [F, 2]],
  [[C, 0.75], [C, 0.25], ...q(C5, A, F, E), [D, 2]],
  [[AS, 0.75], [AS, 0.25], ...q(A, F, G), [F, 2]],
], [
  'Happy birthday to you', 'Happy birthday to you',
  'Happy birthday dear friend', 'Happy birthday to you!',
]);

export const SONGS: SongEntry[] = [
  warmUps,
  hotCrossBuns,
  maryLamb,
  twinkle,
  rowYourBoat,
  oldMacDonald,
  frereJacques,
  londonBridge,
  odeToJoy,
  saints,
  jingleBells,
  happyBirthday,
];

/* ---------- profiles (multiple kids, one device — pure localStorage) ---------- */
export type Profile = { id: string; name: string; emoji: string };
const PROFILES_KEY = 'piano-profiles';
const ACTIVE_KEY = 'piano-active-profile';
export const AVATARS = ['🐻', '🦊', '🐰', '🐸', '🦁', '🐼', '🐨', '🐷'];

function readJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; }
}

/* Every write goes through persist() so cloud sync sees one hook and a
   last-write-wins timestamp — never call localStorage.setItem directly. */
let onLocalChange: () => void = () => {};
export function setOnLocalChange(fn: () => void) { onLocalChange = fn; }
function persist(key: string, raw: string) {
  localStorage.setItem(key, raw);
  localStorage.setItem('piano-updated-at', String(Date.now()));
  onLocalChange();
}

export function getProfiles(): Profile[] {
  return readJSON<Profile[]>(PROFILES_KEY, []);
}

export function activeProfile(): Profile {
  let ps = getProfiles();
  if (!ps.length) {
    ps = [{ id: 'p1', name: 'Player 1', emoji: AVATARS[0] }];
    persist(PROFILES_KEY, JSON.stringify(ps));
    // adopt any pre-profile progress so nobody loses their stars
    const legacy = localStorage.getItem('piano-progress');
    if (legacy) persist(progressKey('p1'), legacy);
  }
  const id = localStorage.getItem(ACTIVE_KEY);
  return ps.find((p) => p.id === id) ?? ps[0];
}

export function setActiveProfile(id: string) {
  persist(ACTIVE_KEY, id);
}

export function addProfile(name: string): Profile {
  const ps = getProfiles();
  const p: Profile = { id: `p${Date.now()}`, name, emoji: AVATARS[ps.length % AVATARS.length] };
  persist(PROFILES_KEY, JSON.stringify([...ps, p]));
  setActiveProfile(p.id);
  return p;
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>) {
  const ps = getProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p));
  persist(PROFILES_KEY, JSON.stringify(ps));
}

/* ---------- per-profile settings ---------- */
export type Settings = { speed?: number; source?: string; skipIntro?: boolean; noteLabels?: boolean; videos?: boolean };

export function loadSettings(): Settings {
  return readJSON<Settings>(`piano-settings-${activeProfile().id}`, {});
}
export function saveSettings(patch: Settings) {
  const key = `piano-settings-${activeProfile().id}`;
  persist(key, JSON.stringify({ ...readJSON<Settings>(key, {}), ...patch }));
}

/* ---------- progress (points 0-20 per song section, per profile) ---------- */
const progressKey = (pid: string) => `piano-progress-${pid}`;
type Progress = Record<string, Record<number, number>>;

export function loadProgress(): Progress {
  return readJSON<Progress>(progressKey(activeProfile().id), {});
}
export function savePoints(songId: string, sectionIdx: number, pts: number) {
  const p = loadProgress();
  p[songId] ??= {};
  p[songId][sectionIdx] = Math.max(p[songId][sectionIdx] ?? 0, pts);
  persist(progressKey(activeProfile().id), JSON.stringify(p));
}
export function getPoints(songId: string, sectionIdx: number): number {
  return loadProgress()[songId]?.[sectionIdx] ?? 0;
}

/* ---------- daily finger drills (both hands) ---------- */
export type Drill = { id: string; title: string; emoji: string; hand: 'L' | 'R'; song: Song };

function drillSet(hand: 'L' | 'R', base: number): Drill[] {
  const h = hand.toLowerCase();
  // offsets from the hand's home C; last note held 2 beats
  const n = (...offs: number[]): Pair[] => offs.map((o, i) => [base + o, i === offs.length - 1 ? 2 : 1]);
  return [
    { id: `${h}-scale-up`, title: 'Climb the ladder', emoji: '🪜', hand, song: song('Climb the ladder', n(0, 2, 4, 5, 7, 9, 11, 12)) },
    { id: `${h}-scale-down`, title: 'Slide back down', emoji: '🛝', hand, song: song('Slide back down', n(12, 11, 9, 7, 5, 4, 2, 0)) },
    { id: `${h}-up-down`, title: 'Over the hill', emoji: '⛰️', hand, song: song('Over the hill', n(0, 2, 4, 5, 7, 5, 4, 2, 0)) },
    { id: `${h}-skips`, title: 'Frog hops', emoji: '🐸', hand, song: song('Frog hops', n(0, 4, 7, 12, 7, 4, 0)) },
    { id: `${h}-repeat`, title: 'Echo echo', emoji: '🦜', hand, song: song('Echo echo', n(0, 0, 2, 2, 4, 4, 5, 5, 7, 7)) },
  ];
}
// right hand from middle C (C4), left hand from C3 — one octave below
export const DRILLS: Drill[] = [...drillSet('R', 60), ...drillSet('L', 48)];

/* ---------- daily practice tracking (per profile, resets each day) ---------- */
const dailyKey = (pid: string) => `piano-daily-${pid}`;
const todayStr = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local

export function getDailyDone(): Set<string> {
  const d = readJSON<{ date: string; done: string[] }>(dailyKey(activeProfile().id), { date: '', done: [] });
  return new Set(d.date === todayStr() ? d.done : []);
}
export function markDrillDone(id: string) {
  const done = getDailyDone();
  done.add(id);
  persist(dailyKey(activeProfile().id), JSON.stringify({ date: todayStr(), done: [...done] }));
}
