// Fly-in coach modal: the character video takes center stage for a moment
// (welcome, watch-me, praise, quiz…), then gets out of the way. Tap to skip.
// Vite resolves the dynamic URL against ../assets/clips/*.mp4 at build time.
const clipUrl = (name: string) => new URL(`../assets/clips/${name}.mp4`, import.meta.url).href;

export type ClipName =
  | 'LessonWelcome' | 'NewNoteIntro' | 'WatchMeIntro' | 'YourTurn'
  | 'GoodJob' | 'PerfectScore' | 'TryAgain' | 'QuizTime' | 'QuizHint'
  | 'SectionComplete' | 'Goodbye' | 'ListeningNod';

export class Coach {
  /** Interactive-video setting: false = every play() resolves instantly. */
  enabled = true;
  private video: HTMLVideoElement;
  private resolveFn: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    el.classList.add('hidden');
    el.title = 'Tap to skip';
    this.video = document.createElement('video');
    this.video.playsInline = true;
    el.appendChild(this.video);
    el.addEventListener('click', () => this.stop());
    this.video.addEventListener('ended', () => this.stop());
    this.video.addEventListener('error', () => this.stop());
  }

  /** Mic mode keeps the app silent — animation only. */
  set muted(m: boolean) { this.video.muted = m; }

  /** Fly in and play a clip; resolves when it ends or is skipped/stopped. */
  play(name: ClipName): Promise<void> {
    if (!this.enabled) return Promise.resolve(); // videos off → flow falls through
    this.stop(); // resolve any clip still pending
    this.el.classList.remove('hidden');
    this.video.src = clipUrl(name);
    this.video.play().catch(() => this.stop()); // autoplay blocked → don't hang
    return new Promise((res) => (this.resolveFn = res));
  }

  stop() {
    this.video.pause();
    this.el.classList.add('hidden');
    this.resolveFn?.();
    this.resolveFn = null;
  }
}
