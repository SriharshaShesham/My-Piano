import { PitchDetector } from 'pitchy';
import type { NoteSource } from './types';

export type MicDetect = { freq: number; clarity: number; midi: number; rms: number; live: boolean };

// Thresholds — tune these against USB-MIDI ground truth (play the same note
// both ways and check they agree). See the live readout in mic mode.
const MIN_RMS = 0.012; // loud enough to be a real note, not room noise
const MIN_CLARITY = 0.92; // pitch confidence from the McLeod method
const RELEASE_FRAMES = 4; // silent frames before we allow the same note to re-fire

export function freqToMidi(freq: number): number {
  if (freq <= 0) return -1;
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

// Monophonic mic input: capture → McLeod pitch (pitchy) → nearest MIDI note,
// gated by loudness + confidence + a re-attack check so a sustained note fires
// once, not every frame. ponytail: monophonic only — chords are the deferred
// research problem, not this.
export class MicSource implements NoteSource {
  readonly name = 'mic';
  onNoteOn: (midi: number, velocity: number) => void = () => {};
  onDetect: (d: MicDetect) => void = () => {};

  private analyser!: AnalyserNode;
  private detector!: PitchDetector<Float32Array>;
  private buf!: Float32Array<ArrayBuffer>;
  private stream?: MediaStream;
  private raf = 0;
  private lastMidi = -1;
  private silent = RELEASE_FRAMES;

  constructor(private audioCtx: AudioContext) {}

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('The mic needs a secure page — open the app via https or localhost.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      // keep the raw signal — these "helpers" mangle pitch
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser); // NOT connected to destination → no feedback
    this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.loop();
  }

  private loop = () => {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const rms = Math.sqrt(sum / this.buf.length);
    const [freq, clarity] = this.detector.findPitch(this.buf as any, this.audioCtx.sampleRate);
    const midi = freqToMidi(freq);
    const live = rms > MIN_RMS && clarity > MIN_CLARITY && midi > 0;

    if (live) {
      // fire on a new pitch, or the same pitch after a gap (a re-struck note)
      if (midi !== this.lastMidi || this.silent >= RELEASE_FRAMES) {
        this.onNoteOn(midi, Math.min(127, Math.round(rms * 400 + 60)));
      }
      this.lastMidi = midi;
      this.silent = 0;
    } else {
      this.silent++;
    }

    this.onDetect({ freq, clarity, midi, rms, live });
    this.raf = requestAnimationFrame(this.loop);
  };

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.lastMidi = -1;
    this.silent = RELEASE_FRAMES;
  }
}
