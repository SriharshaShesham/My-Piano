// Pre-generated character voice lines (assets/voices/*.mp3) — same kid voice
// as the coach clips. playVoice resolves on end; anything without a file
// falls back to Web Speech TTS at the call site.
const voiceUrl = (name: string) => new URL(`../assets/voices/${name}.mp3`, import.meta.url).href;

export type VoiceLine =
  | 'note_c' | 'note_c_high' | 'note_d' | 'note_e' | 'note_f' | 'note_g'
  | 'note_g_low' | 'note_a' | 'note_b' | 'note_a_sharp'
  | 'first_lesson' | 'new_note_one' | 'new_note_many' | 'know_all'
  | 'found_1' | 'found_2' | 'found_3' | 'quiz_done_perfect' | 'quiz_done';

/** Voice line for a note demo, keyed by exact midi (finger differs by octave). */
export function noteVoice(midi: number): VoiceLine | null {
  const map: Record<number, VoiceLine> = {
    55: 'note_g_low', 60: 'note_c', 62: 'note_d', 64: 'note_e', 65: 'note_f',
    67: 'note_g', 69: 'note_a', 70: 'note_a_sharp', 71: 'note_b', 72: 'note_c_high',
  };
  return map[midi] ?? null;
}

const player = new Audio();

export function playVoice(name: VoiceLine): Promise<void> {
  return new Promise((res) => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    player.onended = fin;
    player.onerror = fin;
    player.src = voiceUrl(name);
    player.play().catch(fin); // autoplay blocked → resolve, caller falls through
    setTimeout(fin, 15000); // hard stop — never hang the tutor flow
  });
}

export function stopVoice() {
  player.pause();
  player.onended?.(new Event('ended')); // resolve any pending playVoice
}
