import { SplendidGrandPiano } from 'smplr';

// Piano sound: smplr's sampled grand once its samples arrive over the
// network; the old triangle-wave oscillator covers the gap (first seconds
// of a session, or fully offline). Stays silent in mic mode — the Game
// gates play() calls, not this class.
export class Synth {
  private piano: SplendidGrandPiano | null = null;
  private live = new Set<{ osc: OscillatorNode; gain: GainNode }>();

  constructor(private ctx: AudioContext) {
    try {
      const p = SplendidGrandPiano(ctx);
      p.ready.then(() => (this.piano = p)).catch(() => {}); // offline → oscillator
    } catch { /* no fetch/AudioWorklet support → oscillator */ }
  }

  play(midi: number, velocity = 100) {
    if (this.piano) {
      this.piano.start({ note: midi, velocity });
      return;
    }
    const t = this.ctx.currentTime;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const peak = 0.05 + (velocity / 127) * 0.25;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.75);
    const v = { osc, gain };
    this.live.add(v);
    osc.onended = () => this.live.delete(v);
  }

  /** Silence ringing tails instantly (section switch / demo skip). */
  cut() {
    this.piano?.stop();
    const t = this.ctx.currentTime;
    for (const { osc, gain } of this.live) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.stop(t + 0.05);
    }
    this.live.clear();
  }
}
