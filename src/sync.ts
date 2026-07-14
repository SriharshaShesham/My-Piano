// Google Drive appDataFolder sync via Google Identity Services (token flow).
// Guest-safe by design: no client id, blocked script, declined consent, or
// being offline all leave the app fully working on localStorage alone.
import { setOnLocalChange } from './curriculum';

const FILE = 'piano-kids.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SIGNED_KEY = 'piano-google'; // '1' = user signed in before → silent resume

export type SyncStatus = 'ready' | 'syncing' | 'synced' | 'error';
type Payload = { updatedAt: number; keys: Record<string, string> };

let tokenClient: any = null;
let token = '';
let tokenExp = 0;
let fileId = '';
let pushT = 0;
let onStatus: (s: SyncStatus) => void = () => {};
let onRemoteChange: () => void = () => {};

export function initSync(opts: {
  clientId?: string;
  onStatus?: (s: SyncStatus) => void;
  onRemoteChange?: () => void;
}) {
  onStatus = opts.onStatus ?? onStatus;
  onRemoteChange = opts.onRemoteChange ?? onRemoteChange;
  if (!opts.clientId) return; // no OAuth client configured → guest mode
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = () => {
    tokenClient = (window as any).google?.accounts?.oauth2?.initTokenClient({
      client_id: opts.clientId,
      scope: SCOPE,
      callback: () => {},
    });
    if (!tokenClient) return;
    setOnLocalChange(schedulePush); // every persisted change → debounced push
    onStatus('ready'); // gate may show the sign-in button now
    if (localStorage.getItem(SIGNED_KEY) === '1') {
      ensureToken(false).then((t) => { if (t) fullSync(); }); // silent resume
    }
  };
  s.onerror = () => {}; // offline / blocked → stay guest, silently
  document.head.appendChild(s);
}

/** Interactive sign-in from the gate button. Resolves false if declined. */
export async function signIn(): Promise<boolean> {
  const t = await ensureToken(true);
  if (!t) return false;
  localStorage.setItem(SIGNED_KEY, '1');
  await fullSync();
  return true;
}

function ensureToken(interactive: boolean): Promise<string | null> {
  if (token && Date.now() < tokenExp - 60_000) return Promise.resolve(token);
  if (!tokenClient) return Promise.resolve(null);
  return new Promise((res) => {
    tokenClient.callback = (r: any) => {
      if (r?.access_token) {
        token = r.access_token;
        tokenExp = Date.now() + (r.expires_in ?? 3600) * 1000;
        res(token);
      } else res(null);
    };
    tokenClient.error_callback = () => res(null);
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch {
      res(null);
    }
  });
}

/** Drive fetch with one silent re-auth retry on 401/expiry. */
async function drive(path: string, init: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await ensureToken(false);
    if (!t) return null;
    const r = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> ?? {}), Authorization: `Bearer ${t}` },
    }).catch(() => null);
    if (!r) return null;
    if (r.status === 401) { token = ''; continue; }
    return r;
  }
  return null;
}

function snapshot(): Payload {
  const keys: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith('piano-') && k !== SIGNED_KEY) keys[k] = localStorage.getItem(k)!;
  }
  return { updatedAt: Number(localStorage.getItem('piano-updated-at') ?? 0), keys };
}

async function findFile(): Promise<string> {
  if (fileId) return fileId;
  const r = await drive(`/drive/v3/files?spaces=appDataFolder&q=name%3D%27${FILE}%27&fields=files(id)`);
  if (!r?.ok) return '';
  fileId = (await r.json()).files?.[0]?.id ?? '';
  return fileId;
}

async function pull(): Promise<Payload | null> {
  const id = await findFile();
  if (!id) return null;
  const r = await drive(`/drive/v3/files/${id}?alt=media`);
  return r?.ok ? r.json().catch(() => null) : null;
}

async function push() {
  onStatus('syncing');
  const body = JSON.stringify(snapshot());
  const id = await findFile();
  let ok = false;
  if (id) {
    const r = await drive(`/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', body, headers: { 'Content-Type': 'application/json' },
    });
    ok = !!r?.ok;
  } else {
    const boundary = 'pianokids';
    const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
    const multipart =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const r = await drive(`/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: 'POST', body: multipart,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    if (r?.ok) { fileId = (await r.json()).id; ok = true; }
  }
  onStatus(ok ? 'synced' : 'error');
}

function schedulePush() {
  if (localStorage.getItem(SIGNED_KEY) !== '1' || !tokenClient) return;
  clearTimeout(pushT);
  pushT = window.setTimeout(push, 3000); // debounce bursts of writes
}

/** Merge remote into localStorage. Progress can only grow (per-section max),
 *  daily practice unions same-day, everything else is last-write-wins. */
function mergeRemote(remote: Payload) {
  const localAt = Number(localStorage.getItem('piano-updated-at') ?? 0);
  const remoteWins = remote.updatedAt > localAt;
  for (const [k, v] of Object.entries(remote.keys ?? {})) {
    const local = localStorage.getItem(k);
    if (local == null) { localStorage.setItem(k, v); continue; }
    if (local === v) continue;
    try {
      if (k.startsWith('piano-progress-')) {
        const a = JSON.parse(local), b = JSON.parse(v);
        for (const song of Object.keys(b)) {
          a[song] ??= {};
          for (const sec of Object.keys(b[song])) a[song][sec] = Math.max(a[song][sec] ?? 0, b[song][sec]);
        }
        localStorage.setItem(k, JSON.stringify(a));
      } else if (k.startsWith('piano-daily-')) {
        const a = JSON.parse(local), b = JSON.parse(v);
        if (a.date === b.date) a.done = [...new Set([...(a.done ?? []), ...(b.done ?? [])])];
        else if ((b.date ?? '') > (a.date ?? '')) Object.assign(a, b);
        localStorage.setItem(k, JSON.stringify(a));
      } else if (k === 'piano-profiles') {
        const a = JSON.parse(local), b = JSON.parse(v);
        const win = remoteWins ? b : a;
        const lose = remoteWins ? a : b;
        const ids = new Set(win.map((p: any) => p.id));
        localStorage.setItem(k, JSON.stringify([...win, ...lose.filter((p: any) => !ids.has(p.id))]));
      } else if (k !== 'piano-updated-at' && remoteWins) {
        localStorage.setItem(k, v); // settings / active profile: LWW
      }
    } catch { /* malformed remote entry → keep local */ }
  }
  localStorage.setItem('piano-updated-at', String(Math.max(localAt, remote.updatedAt)));
}

async function fullSync() {
  onStatus('syncing');
  const remote = await pull();
  if (remote) {
    mergeRemote(remote);
    onRemoteChange();
  }
  await push();
}
