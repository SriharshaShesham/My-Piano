// Lesson tutor: narrates with pre-generated character voice lines when
// available (falls back to Web Speech TTS), demos the new notes, then plays
// the WHOLE section hands-free, then counts down 4…1 and auto-starts the
// lesson. Tap the bubble to skip.
import { playVoice, stopVoice, type VoiceLine } from './voice';

export type TutorScript = {
  intro: string;
  introAudio?: VoiceLine;
  demo: { midi: number; say: string; audio?: VoiceLine }[];
};

type TutorHooks = {
  // one key press: flash + sound + finger; resolves when the kid has
  // found and pressed the key themselves (or a patience timeout fires)
  demoNote: (midi: number) => Promise<void>;
  demoSection: () => Promise<void>;       // the game plays the whole section itself
  onStart: () => void;                    // countdown finished → start the lesson
  onCancel: () => void;                   // skipped → stop any running demo
};

/** Prefer neural/online voices — they're dramatically less robotic. */
let cachedVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  const score = (v: SpeechSynthesisVoice) =>
    /natural|neural/i.test(v.name) ? 5 :
    /online/i.test(v.name) ? 4 :
    /premium|enhanced/i.test(v.name) ? 3 :
    /google us english/i.test(v.name) ? 2 :
    /samantha|karen|moira/i.test(v.name) ? 1 : 0;
  cachedVoice = vs.sort((a, b) => score(b) - score(a))[0] ?? null;
  return cachedVoice;
}
window.speechSynthesis?.addEventListener?.('voiceschanged', () => { cachedVoice = null; });

/** Speak one sentence; resolves on speech end (timeout fallback). */
export function speak(text: string) {
  return new Promise<void>((res) => {
    if (!('speechSynthesis' in window)) { setTimeout(res, 700 + text.length * 45); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = pickVoice();
    u.pitch = 1.1;
    u.rate = 0.95;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin;
    u.onerror = fin;
    speechSynthesis.speak(u);
    setTimeout(fin, 2500 + text.length * 110); // fallback if onend never fires
  });
}

export class Tutor {
  private active = false;
  private gen = 0; // generation token: only the newest run() may proceed
  private txt: HTMLElement;

  constructor(private el: HTMLElement, private hooks: TutorHooks) {
    el.innerHTML = `<span class="owl">🦉</span><span class="ttxt"></span>`;
    el.title = 'Tap to skip';
    el.classList.add('hidden');
    this.txt = el.querySelector('.ttxt')!;
    el.addEventListener('click', () => this.cancel());
  }

  cancel() {
    this.gen++;
    this.active = false;
    stopVoice();
    window.speechSynthesis?.cancel();
    this.el.classList.add('hidden');
    this.el.classList.remove('count');
    this.hooks.onCancel();
  }

  private wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  async run(script: TutorScript) {
    this.cancel();
    const gen = ++this.gen;
    this.active = true;
    const dead = () => !this.active || gen !== this.gen; // superseded or skipped
    this.el.classList.remove('hidden');

    // Chrome drops or bleeds utterances when speak() follows cancel() in the
    // same tick — let the cancel land before the new narration starts.
    await this.wait(80);
    if (dead()) return;

    const say = async (text: string, audio?: VoiceLine) => {
      this.txt.textContent = text;
      if (audio) { await playVoice(audio); return; } // character voice line
      const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
      for (const s of sentences) {
        if (dead()) return;
        await speak(s);
        if (dead()) return;
        await this.wait(350); // natural pause between sentences
      }
    };

    await say(script.intro, script.introAudio);
    if (dead()) return;

    // teach each new note: real key press + finger callout, then WAIT for
    // the kid to actually find and press the key before moving on
    for (const d of script.demo) {
      if (dead()) return;
      const found = this.hooks.demoNote(d.midi);
      await say(d.say, d.audio);
      if (dead()) return;
      await found;
      if (dead()) return;
    }

    // play the whole section hands-free (the coach clips voice this beat)
    await this.hooks.demoSection();
    if (dead()) return;

    this.el.classList.add('count');
    for (let n = 4; n >= 1; n--) {
      this.txt.textContent = String(n);
      await this.wait(1000);
      if (dead()) return;
    }
    this.active = false;
    this.el.classList.add('hidden');
    this.el.classList.remove('count');
    window.speechSynthesis?.cancel();
    this.hooks.onStart();
  }
}
