// Tiny oscillator "piano". ponytail: a triangle wave with a fast decay is
// plenty to prove the loop — swap in a real soundfont (smplr) when we want
// nicer sound. Stays silent in mic mode (the real instrument makes the sound).
export class Synth {
  private live = new Set<{ osc: OscillatorNode; gain: GainNode }>();

  constructor(private ctx: AudioContext) {}

  play(midi: number, velocity = 100) {
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
