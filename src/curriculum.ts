import type { Song, SongNote } from './types';

export type Section = { title: string; song: Song };
export type SongEntry = { id: string; emoji: string; title: string; sections: Section[]; category?: 'songs' | 'twohand' | 'concept' };

const BEAT = 0.5; // seconds per quarter note (120 bpm)
type Pair = [number | number[], number]; // [midi | chord, beats]

// ponytail: hardcoded public-domain tunes as [midi, beats] phrases;
// @tonejs/midi produces the same Song shape if we ever import files.
// A slot's midi may be an array → a blocked chord (all notes share start).
function song(title: string, pairs: Pair[], hand?: 'L' | 'R'): Song {
  const notes: SongNote[] = [];
  let t = 1.2; // lead-in
  for (const [m, beats] of pairs) {
    const dur = beats * BEAT;
    for (const midi of Array.isArray(m) ? m : [m])
      if (midi > 0) notes.push({ midi, start: t, duration: dur, ...(hand ? { hand } : {}) }); // midi 0 = rest
    t += dur;
  }
  return { title, notes, bpm: 120 };
}
const REST = 0;

/** Two-hand piece: a right-hand voice + a left-hand voice on one timeline
 *  (both from the same lead-in). Chords = array slots; see song(). */
function hands(title: string, right: Pair[], left: Pair[]): Song {
  const notes = [...song(title, right, 'R').notes, ...song(title, left, 'L').notes]
    .sort((a, b) => a.start - b.start);
  return { title, notes, bpm: 120 };
}

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

// wider palette for the Songs library (keyboard spans C3=48 .. B5=83)
const C3 = 48, D3 = 50, DS3 = 51, E3 = 52, F3 = 53, FS3 = 54, A3 = 57, AS3 = 58, B3 = 59;
const DS = 63, FS = 66, B = 71;
const D5 = 74, DS5 = 75, E5 = 76, F5 = 77, G5 = 79;

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

/* ---------- Songs library: play-for-fun rhymes + famous themes ----------
   ponytail: copyrighted themes encoded as short single-line melody motifs
   (functional [midi,beats] transcriptions), same form as the PD tunes above.
   Single-phrase entries → one "Melody" section, no auto "Whole song". */
const one = (id: string, emoji: string, title: string, phrase: Pair[], backing?: Pair[]): SongEntry => {
  const e: SongEntry = { ...entry(id, emoji, title, [phrase], ['Melody']), category: 'songs' };
  if (backing) {
    const b = song(title, backing).notes.map((n) => ({ ...n, backing: true }));
    const s = e.sections[0].song;
    e.sections[0] = { ...e.sections[0], song: { ...s, notes: [...s.notes, ...b].sort((x, y) => x.start - y.start) } };
  }
  return e;
};

/** Two-hand lesson: phrase-sized sections (each staged R→L→Both by main.ts),
 *  plus an auto-added "whole song" finale. Per phrase, both voices must span
 *  the same beat total or the concatenated finale would drift apart. */
type HandPhrase = { r: Pair[]; l: Pair[] };
const beatSum = (ps: Pair[]) => ps.reduce((n, [, b]) => n + b, 0);
function twoHandEntry(id: string, emoji: string, title: string, phrases: HandPhrase[], titles: string[]): SongEntry {
  for (const p of phrases) console.assert(beatSum(p.r) === beatSum(p.l), `${id}: hands out of step (${beatSum(p.r)} vs ${beatSum(p.l)} beats)`);
  const sections: Section[] = phrases.map((p, i) => ({ title: titles[i] ?? `Part ${i + 1}`, song: hands(title, p.r, p.l) }));
  if (phrases.length > 1) {
    sections.push({
      title: 'The whole song',
      song: hands(title, phrases.flatMap((p) => p.r), phrases.flatMap((p) => p.l)),
    });
  }
  return { id, emoji, title, category: 'twohand', sections };
}

const songLibrary: SongEntry[] = [
  // --- kids rhymes (public domain), full verses, soft I-IV-V bass backing ---
  one('itsy-spider', '🕷️', 'Itsy Bitsy Spider', [
    // up the spout · down came the rain · out came the sun · up again
    [G3, 1], [C, 0.5], [C, 0.5], [C, 0.5], [D, 0.5], [E, 0.5], [E, 0.5], [E, 1], [D, 1], [C, 1], [D, 0.5], [E, 0.5], [C, 2],
    [E, 1], [E, 1], [F, 1], [G, 2], [G, 1], [F, 1], [E, 1], [F, 0.5], [G, 0.5], [E, 2],
    [C, 1], [C, 1], [D, 1], [E, 2], [E, 1], [D, 1], [C, 1], [D, 0.5], [E, 0.5], [C, 2],
    [G3, 0.5], [G3, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], [D, 0.5], [E, 0.5], [E, 0.5], [E, 1], [D, 1], [C, 1], [D, 0.5], [E, 0.5], [C, 2],
  ], [
    [C3, 4], [C3, 2], [G3, 2], [C3, 2],
    [C3, 4], [G3, 4], [C3, 3],
    [C3, 4], [C3, 2], [G3, 3], [C3, 2],
    [C3, 4], [C3, 2], [G3, 2], [C3, 2],
  ]),
  one('wheels-bus', '🚌', 'Wheels on the Bus', [
    // round and round ×3 · all through the town — "on the" are quick eighths
    [C, 1], [F, 1], [F, 0.5], [F, 0.5], [F, 1], [A, 1], [C5, 1], [A, 1], [F, 2], [G, 1], [E, 1], [C, 2], [A, 1], [G, 1], [F, 2],
    [C, 1], [F, 1], [F, 0.5], [F, 0.5], [F, 1], [A, 1], [C5, 1], [A, 1], [F, 2], [G, 1], [C, 1], [C, 1], [F, 2],
  ], [
    [REST, 1], [F3, 4], [F3, 4], [C3, 4], [F3, 4],
    [REST, 1], [F3, 4], [F3, 4], [C3, 3], [F3, 2],
  ]),
  one('if-happy', '😄', "If You're Happy", [
    // clap your hands · clap your hands · really want to show it · clap your hands
    [C, 0.5], [C, 0.5], [F, 0.5], [F, 0.5], [F, 0.5], [F, 0.5], [F, 1], [E, 1], [F, 1], [G, 2],
    [C, 0.5], [C, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [G, 1], [F, 1], [G, 1], [A, 2],
    [F, 0.5], [F, 0.5], [AS, 0.5], [AS, 0.5], [AS, 0.5], [AS, 0.5], [D5, 1], [D5, 1], [AS, 0.5], [AS, 0.5], [A, 0.5], [A, 0.5], [A, 1], [G, 1], [F, 1], [F, 2],
    [A, 0.5], [A, 0.5], [G, 0.5], [G, 0.5], [G, 1], [F, 1], [E, 1], [E, 1], [D, 1], [E, 1], [F, 2],
  ], [
    [REST, 1], [F3, 3], [C3, 4],
    [REST, 1], [F3, 3], [C3, 2], [F3, 2],
    [AS3, 4], [AS3, 2], [F3, 2], [C3, 2], [F3, 2],
    [F3, 2], [F3, 2], [C3, 2], [C3, 2], [F3, 2],
  ]),
  one('this-old-man', '👴', 'This Old Man', [...q(G, E, G, G, E, G, A, G, F, E), [D, 2]],
    [[C3, 6], [F3, 4], [G3, 2]]),
  one('bingo', '🐕', 'Bingo', [
    // farmer had a dog · and Bingo was his name-o · B-I-N-G-O ×3 · name-o!
    // "was a" / "had a" / "was his" are quick eighths, like it's sung
    [G3, 1], [C, 0.5], [C, 0.5], [C, 1], [G3, 1], [A3, 0.5], [A3, 0.5], [G3, 2],
    [G3, 1], [C, 1], [C, 1], [D, 0.5], [D, 0.5], [E, 1], [C, 2],
    [E, 1], [E, 1], [F, 1], [F, 1], [F, 2],
    [D, 1], [D, 1], [E, 1], [E, 1], [E, 2],
    [C, 1], [C, 1], [D, 1], [D, 1], [D, 2],
    [B3, 1], [G3, 1], [A3, 0.5], [B3, 0.5], [C, 1], [C, 2],
  ], [
    [C3, 4], [F3, 1], [C3, 2],
    [C3, 3], [G3, 2], [C3, 2],
    [C3, 2], [F3, 4],
    [G3, 2], [C3, 4],
    [C3, 2], [G3, 4],
    [G3, 3], [C3, 3],
  ]),
  one('rain-away', '☔', 'Rain Rain Go Away', [...q(G, E, G, E, A, G), [E, 2]],
    [[C3, 2], [C3, 2], [F3, 2], [C3, 2]]),
  // --- famous themes (short recognisable melody lines) ---
  one('fur-elise', '🎼', 'Für Elise', [[E5, 0.5], [DS5, 0.5], [E5, 0.5], [DS5, 0.5], [E5, 0.5], [B, 0.5], [D5, 0.5], [C5, 0.5], [A, 1.5], [REST, 0.5], [C, 0.5], [E, 0.5], [A, 0.5], [B, 2]]),
  one('jurassic', '🦕', 'Jurassic Park', [ // Journey to the Island — opening phrase (E♭), long–short–short lilt
    [AS, 3], [C5, 0.5], [D5, 0.5], [DS5, 3], [D5, 0.5], [C5, 0.5],
    [D5, 3], [DS5, 0.5], [F5, 0.5], [G5, 3], [F5, 0.5], [DS5, 0.5],
    [F5, 3], [DS5, 0.5], [D5, 0.5], [DS5, 3], [D5, 0.5], [C5, 0.5],
    [D5, 3], [C5, 0.5], [AS, 0.5], [DS5, 4]]),
  one('bond', '🕴️', 'James Bond', [[E3, 0.5], [FS3, 0.5], [G3, 0.5], [FS3, 0.5], [E3, 0.5], [FS3, 0.5], [G3, 0.5], [FS3, 0.5], [E3, 2]]),
  one('mission', '🎧', 'Mission: Impossible', [[G3, 0.5], [G3, 0.5], [AS3, 0.5], [C, 0.5], [G3, 0.5], [G3, 0.5], [F3, 0.5], [FS3, 0.5], [G3, 0.5], [G3, 0.5], [AS3, 0.5], [C, 0.5], [D, 2]]),
  one('star-wars', '🌌', 'Star Wars', [[G, 1], [G, 1], [G, 1], [C5, 2], [G, 2], [F, 1], [E, 1], [D, 1], [C5, 2], [G, 2]]),
  one('imperial', '🖤', 'Imperial March', [[G3, 1], [G3, 1], [G3, 1], [DS3, 1.5], [AS3, 0.5], [G3, 2], [DS3, 1.5], [AS3, 0.5], [G3, 2]]),
  one('hedwig', '🦉', "Hedwig's Theme", [[B3, 1], [E, 1], [G, 1], [FS, 1], [E, 2], [B, 2], [A, 3], [FS, 2]]),
  one('pink-panther', '🐾', 'Pink Panther', [...q(E, FS, G, AS, A, G, E, FS), [G, 2]]),
  one('mario', '🍄', 'Super Mario', [[E, 0.5], [E, 0.5], [REST, 0.5], [E, 0.5], [REST, 0.5], [C, 0.5], [E, 0.5], [REST, 0.5], [G, 1], [REST, 1], [G3, 2]]),
  one('pirates', '🏴‍☠️', "He's a Pirate", [[D, 1], [F, 1], [G, 1], [G, 2], [G, 1], [A, 1], [AS, 1], [AS, 2], [AS, 1], [C5, 1], [D5, 1], [C5, 1], [AS, 1], [A, 1], [G, 1], [A, 2]]),
  one('got', '🐉', 'Game of Thrones', [...q(G3, C, DS, F, G3, C, DS, F, G3, C, E), [F, 2]]),
  one('tetris', '🧱', 'Tetris', [[E, 1], [B, 0.5], [C5, 0.5], [D5, 1], [C5, 0.5], [B, 0.5], [A, 1], [A, 0.5], [C5, 0.5], [E5, 1], [D5, 0.5], [C5, 0.5], [B, 1.5], [C5, 0.5], [D5, 1], [E, 1], [C5, 1], [A, 1], [A, 2]]),
  ...duets(),
];

/** Both-hands songs: full-length melodies with a left-hand bass part the kid
 *  can actually play — R/L/Both toggle applies (R = bass auto-plays along). */
function duets(): SongEntry[] {
  const duet = (id: string, emoji: string, title: string, r: Pair[], l: Pair[]): SongEntry =>
    ({ id, emoji, title, category: 'songs', sections: [{ title: 'The song', song: hands(title, r, l) }] });

  // per-line bass for Twinkle (each melody line is 8 beats)
  const tw1l: Pair[] = [[C3, 4], [F3, 2], [C3, 2]];
  const tw2l: Pair[] = [[F3, 2], [C3, 2], [G3, 2], [C3, 2]];
  const tw3l: Pair[] = [[C3, 2], [F3, 2], [C3, 2], [G3, 2]];

  const macP1: Pair[] = [...q(C, C, C, G, A, A), [G, 2], ...q(E, E, D, D), [C, 2]];
  const macP2: Pair[] = [...q(G, C, C, C, G, A, A), [G, 2], ...q(E, E, D, D), [C, 2]];
  const macMoo: Pair[] = [
    [G, 0.5], [G, 0.5], [C, 1], [C, 1], [C, 1],   // with a moo moo here
    [G, 0.5], [G, 0.5], [C, 1], [C, 1], [C, 1],   // and a moo moo there
    [C, 1], [C, 0.5], [C, 0.5], [C, 1], [C, 0.5], [C, 0.5], // here a moo, there a moo
    [C, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], [C, 1], [C, 1], // everywhere a moo moo
  ];
  const macP1l: Pair[] = [[C3, 8], [F3, 2], [G3, 2], [C3, 2]];
  const macP2l: Pair[] = [[REST, 1], [C3, 8], [F3, 2], [G3, 2], [C3, 2]];

  return [
    duet('duet-twinkle', '⭐', 'Twinkle Twinkle',
      [...TW1, ...TW2, ...TW3, ...TW3, ...TW1, ...TW2],
      [...tw1l, ...tw2l, ...tw3l, ...tw3l, ...tw1l, ...tw2l]),
    duet('duet-macdonald', '🚜', 'Old MacDonald',
      [...macP1, ...macP2, ...macMoo, ...macP1],
      [...macP1l, ...macP2l, [C3, 4], [C3, 4], [C3, 4], [C3, 4], ...macP1l]),
    duet('duet-mary', '🐑', 'Mary Had a Little Lamb',
      [...q(E, D, C, D, E, E), [E, 2], ...q(D, D), [D, 2], ...q(E, G), [G, 2], ...q(E, D, C, D, E, E, E, E, D, D, E, D), [C, 4]],
      [[C3, 4], [C3, 4], [G3, 4], [C3, 4], [C3, 4], [C3, 4], [G3, 4], [C3, 4]]),
    duet('duet-london', '🌉', 'London Bridge',
      [[G, 1.5], [A, 0.5], ...q(G, F, E, F), [G, 2], ...q(D, E), [F, 2], ...q(E, F), [G, 2],
       [G, 1.5], [A, 0.5], ...q(G, F, E, F), [G, 2], [D, 2], [G, 2], [E, 1], [C, 3]],
      [[C3, 4], [C3, 4], [G3, 4], [C3, 4], [C3, 4], [C3, 4], [G3, 2], [C3, 2], [C3, 4]]),
  ];
}

/* ---------- two-hand track: concept intro + a 6-lesson coordination ladder,
   each new lesson adds exactly one left-hand skill ---------- */
const twinkleA: Pair[] = [...q(C, C, G, G, A, A), [G, 2]];
const twinkleB: Pair[] = [...q(F, F, E, E, D, D), [C, 2]];

const twoHandTrack: SongEntry[] = [
  // what melody & bass mean (listen-only walkthrough)
  { id: 'concept-melody-bass', emoji: '🎓', title: 'Music Words: Melody & Bass', category: 'concept',
    sections: [{ title: 'Listen', song: hands('Melody & Bass', [...q(C, D, E, C), [G, 2]], [[C3, 2], [G3, 2], [C3, 2]]) }] },
  // 1. hands alternate — never together; the switching is the skill
  twoHandEntry('th-turns', '🔄', 'Hands Take Turns', [
    { r: [...q(C, D, E), [REST, 5]], l: [[REST, 4], ...q(C3, D3, E3), [REST, 1]] },
    { r: [...q(E, D, C), [REST, 5]], l: [[REST, 4], ...q(E3, D3, C3), [REST, 1]] },
    { r: [[C, 1], [D, 1], [REST, 2], [E, 1], [D, 1], [REST, 2]], l: [[REST, 2], [C3, 1], [D3, 1], [REST, 2], [E3, 1], [D3, 1]] },
  ], ['Right says hi', 'Left echoes', 'Quick turns']),
  // 2. left holds one sleepy whole note under the tune (Hot Cross Buns)
  twoHandEntry('th-sleepy', '😴', 'Sleepy Bass · Hot Cross Buns', [
    { r: [[E, 1], [D, 1], [C, 2]], l: [[C3, 4]] },
    { r: [[E, 1], [D, 1], [C, 2]], l: [[G3, 4]] },
    { r: [[C, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], [D, 0.5], [D, 0.5], [D, 0.5], [D, 0.5], [E, 1], [D, 1], [C, 2]], l: [[C3, 2], [G3, 2], [C3, 4]] },
  ], ['One sleepy note', 'A new bass note', 'Buns for everyone']),
  // 3. left walks: one bass note per measure (Twinkle)
  twoHandEntry('th-walking', '🚶', 'Walking Bass · Twinkle', [
    { r: twinkleA, l: [[C3, 4], [G3, 4]] },
    { r: twinkleB, l: [[F3, 4], [C3, 4]] },
  ], ['Up to the star', 'Back down home']),
  // 4. left keeps a steady half-note beat (Ode to Joy)
  twoHandEntry('th-steady', '🥁', 'Steady Bass · Ode to Joy', [
    { r: q(E, E, F, G, G, F, E, D), l: [[C3, 2], [C3, 2], [G3, 2], [G3, 2]] },
    { r: [...q(C, C, D, E), [E, 1.5], [D, 0.5], [D, 2]], l: [[C3, 2], [C3, 2], [G3, 2], [G3, 2]] },
  ], ['The famous bit', 'The landing']),
  // 5. both hands play the same moves an octave apart
  twoHandEntry('th-mirror', '🪞', 'Mirror Hands', [
    { r: [...q(C, D, E, F), [G, 2]], l: [...q(C3, D3, E3, F3), [G3, 2]] },
    { r: [...q(G, F, E, D), [C, 2]], l: [...q(G3, F3, E3, D3), [C3, 2]] },
  ], ['March up', 'March down']),
  // 6. left lays chord cushions under the melody (Twinkle)
  twoHandEntry('th-chords', '🛏️', 'Chord Cushion · Twinkle', [
    { r: twinkleA, l: [[[C3, E3, G3], 4], [[C3, F3, A3], 2], [[D3, G3, B3], 2]] },
    { r: twinkleB, l: [[[C3, F3, A3], 2], [[C3, E3, G3], 2], [[D3, G3, B3], 2], [[C3, E3, G3], 2]] },
  ], ['Star chords', 'Coming home']),
];

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
  ...twoHandTrack,
  ...songLibrary,
];

/* ---------- profiles: identities — Google-backed or local ---------- */
export type Profile = {
  id: string;          // local: p<timestamp> | google: g<sub>
  name: string;
  emoji?: string;      // local avatar
  kind?: 'google';     // absent = local (legacy profiles migrate for free)
  email?: string;      // google: login_hint for silent re-auth
  picture?: string;    // google: avatar URL
};
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

// In-memory fallback when no profile exists/is selected (debug-param bypass
// only) — never persisted, never shown on the gate. Its settings/progress
// land in orphaned `-guest` keys that are never synced.
const GUEST: Profile = { id: 'guest', name: 'Guest', emoji: '🐻' };

export function activeProfile(): Profile {
  const ps = getProfiles();
  const id = localStorage.getItem(ACTIVE_KEY);
  return ps.find((p) => p.id === id) ?? ps[0] ?? GUEST;
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

/** One Google account = one profile. Re-sign-in updates in place (and finds
 *  its orphaned progress keys again, since keys derive from the id). */
export function upsertGoogleProfile(u: { sub: string; name: string; picture?: string; email?: string }): Profile {
  const id = `g${u.sub}`;
  const ps = getProfiles();
  const i = ps.findIndex((p) => p.id === id);
  if (i >= 0) {
    // keep a locally edited name; refresh photo/email from Google
    ps[i] = { ...ps[i], kind: 'google', picture: u.picture, email: u.email };
  } else {
    ps.push({ id, name: u.name, kind: 'google', picture: u.picture, email: u.email });
  }
  persist(PROFILES_KEY, JSON.stringify(ps));
  setActiveProfile(id);
  return ps.find((p) => p.id === id)!;
}

/** Sign-out: the card disappears; settings/progress/daily keys stay orphaned
 *  so re-signing in with the same account restores and merges them. */
export function removeProfile(id: string) {
  persist(PROFILES_KEY, JSON.stringify(getProfiles().filter((p) => p.id !== id)));
  if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
}

/** localStorage key names for one profile's data (used by per-profile sync). */
export const profileKeys = (pid: string) => ({
  settings: `piano-settings-${pid}`,
  progress: progressKey(pid),
  daily: `piano-daily-${pid}`,
});

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

/* ---------- daily finger drills: a typing-tutor ladder ---------- */
export type Drill = { id: string; title: string; emoji: string; hand: 'L' | 'R' | 'both'; level: number; song: Song };

// ordered easy → hard; offsets are semitones from the hand's home C (0..24 keeps
// both hands inside the C3..B5 keyboard). Each is played for both hands.
const LEVELS: { name: string; emoji: string; offs: number[] }[] = [
  { name: 'Two keys', emoji: '👣', offs: [0, 2, 0, 2, 0] },
  { name: 'Three keys', emoji: '🐾', offs: [0, 2, 4, 2, 0] },
  { name: 'Finger taps', emoji: '👆', offs: [0, 2, 4, 2, 0, 4, 2, 0] },
  { name: 'Five-finger up', emoji: '🖐️', offs: [0, 2, 4, 5, 7] },
  { name: 'Up and down', emoji: '⛰️', offs: [0, 2, 4, 5, 7, 5, 4, 2, 0] },
  { name: 'Frog hops', emoji: '🐸', offs: [0, 4, 2, 5, 4, 7, 5, 2, 0] },
  { name: 'Climb the scale', emoji: '🪜', offs: [0, 2, 4, 5, 7, 9, 11, 12] },
  { name: 'Slide back down', emoji: '🛝', offs: [12, 11, 9, 7, 5, 4, 2, 0] },
  { name: 'Arpeggio', emoji: '🌈', offs: [0, 4, 7, 12, 7, 4, 0] },
  { name: 'Broken chords', emoji: '🧩', offs: [0, 0, 2, 2, 4, 4, 5, 5, 7, 7] },
  { name: 'Big reach', emoji: '🦘', offs: [0, 7, 4, 9, 7, 12] },
  { name: 'Long run', emoji: '🏃', offs: [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0] },
];

// right hand from middle C (C4=60), left hand from C3 (48) — one octave below;
// 'both' = the same pattern in mirror motion, both hands striking together
function drill(lvIdx: number, hand: 'L' | 'R' | 'both'): Drill {
  const { name, emoji, offs } = LEVELS[lvIdx];
  const mk = (h: 'L' | 'R'): Pair[] => offs.map((o, i) => [(h === 'R' ? 60 : 48) + o, i === offs.length - 1 ? 2 : 1]); // last note held
  const s = hand === 'both' ? hands(name, mk('R'), mk('L')) : song(name, mk(hand), hand);
  return { id: `${hand === 'both' ? 'b' : hand.toLowerCase()}-lvl${lvIdx + 1}`, title: name, emoji, hand, level: lvIdx + 1, song: s };
}
export const DRILLS: Drill[] = LEVELS.flatMap((_, i) => [drill(i, 'R'), drill(i, 'L'), drill(i, 'both')]);

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
