// Google auth + per-profile Drive sync (Google Identity Services token flow).
// A profile IS an identity: signing in with Google creates/opens the profile
// for that account (g<sub>) and syncs ONLY that profile's data to that
// account's private appDataFolder. Local profiles never touch the network.
// Guest-safe: no client id, blocked script, declined consent, offline — the
// app keeps working on localStorage alone.
import {
  setOnLocalChange, activeProfile, upsertGoogleProfile, removeProfile,
  updateProfile, profileKeys, type Profile, type Settings,
} from './curriculum';

const FILE = 'piano-kids.json';
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';

export type SyncStatus = 'ready' | 'syncing' | 'synced' | 'offline' | 'error';

type Payload = {
  updatedAt: number; // ponytail: global piano-updated-at stamp; per-profile stamps if settings ping-pong across devices
  profile: { name: string; picture?: string };
  settings: Settings;
  progress: Record<string, Record<number, number>>;
  daily: { date: string; done: string[] };
};

let tokenClient: any = null;
let token = '';
let tokenExp = 0;
let tokenSub = ''; // which Google account the token belongs to
let fileId = '';   // Drive file id — valid per account; cleared on account switch
let pushT = 0;
let onStatus: (s: SyncStatus) => void = () => {};
let onRemoteChange: () => void = () => {};

export function initAuth(opts: {
  clientId?: string;
  onStatus?: (s: SyncStatus) => void;
  onRemoteChange?: () => void;
}) {
  onStatus = opts.onStatus ?? onStatus;
  onRemoteChange = opts.onRemoteChange ?? onRemoteChange;
  localStorage.removeItem('piano-google'); // pre-identity global flag, obsolete
  if (!opts.clientId) return; // no OAuth client configured → local-only
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
    onStatus('ready'); // choosers may show the Google option now
  };
  s.onerror = () => {}; // offline / blocked → local-only, silently
  document.head.appendChild(s);
}

/* ---------- tokens + identity ---------- */

function requestToken(interactive: boolean, hint?: string): Promise<string | null> {
  if (!tokenClient) return Promise.resolve(null);
  return new Promise((res) => {
    tokenClient.callback = async (r: any) => {
      if (!r?.access_token) { res(null); return; }
      token = r.access_token;
      tokenExp = Date.now() + (r.expires_in ?? 3600) * 1000;
      tokenSub = ''; // unknown until userinfo confirms
      res(token);
    };
    tokenClient.error_callback = () => res(null);
    try {
      const opts: any = hint ? { login_hint: hint } : {};
      if (!interactive) opts.prompt = ''; // silent: no UI, fails without a live Google session
      tokenClient.requestAccessToken(opts);
    } catch {
      res(null);
    }
  });
}

async function fetchUserinfo(): Promise<{ sub: string; name: string; picture?: string; email?: string } | null> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!r?.ok) return null;
  const u = await r.json().catch(() => null);
  if (!u?.sub) return null;
  tokenSub = u.sub;
  return u;
}

/** Token valid for this specific Google profile; silent first, then interactive. */
async function ensureTokenFor(p: Profile, allowInteractive: boolean): Promise<boolean> {
  if (token && Date.now() < tokenExp - 60_000 && tokenSub === p.id.slice(1)) return true;
  for (const interactive of allowInteractive ? [false, true] : [false]) {
    if (!(await requestToken(interactive, p.email))) continue;
    const u = await fetchUserinfo();
    if (u && `g${u.sub}` === p.id) return true; // right account confirmed
    token = ''; // wrong account picked in the chooser → try interactively
  }
  return false;
}

/* ---------- public auth API ---------- */

/** Interactive sign-in from the chooser: token → identity → profile. */
export async function signInWithGoogle(): Promise<Profile | null> {
  if (!(await requestToken(true))) return null;
  const u = await fetchUserinfo();
  if (!u) return null;
  fileId = ''; // possibly a different account than last time
  const p = upsertGoogleProfile({ sub: u.sub, name: u.name ?? u.email ?? 'Player', picture: u.picture, email: u.email });
  await fullSync(p);
  return p;
}

/** Wake a Google profile tapped on the gate. Resolves fast; sync runs after.
 *  'offline' = auth failed — kid still plays with locally cached data. */
export async function activateProfile(p: Profile, allowInteractive = true): Promise<'ok' | 'offline'> {
  if (p.kind !== 'google') return 'ok';
  fileId = ''; // account may differ from the previous active one
  if (!(await ensureTokenFor(p, allowInteractive))) { onStatus('offline'); return 'offline'; }
  await fullSync(p);
  return 'ok';
}

/** Sign out: best-effort revoke, remove the card. Local data stays orphaned. */
export function signOutGoogle(p: Profile) {
  try {
    if (token) (window as any).google?.accounts?.oauth2?.revoke?.(token, () => {});
  } catch { /* token already dead — fine */ }
  token = '';
  tokenSub = '';
  fileId = '';
  removeProfile(p.id);
}

/* ---------- Drive REST (plain fetch, 401 retried once) ---------- */

async function drive(path: string, init: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = activeProfile();
    if (p.kind !== 'google' || !(await ensureTokenFor(p, false))) return null;
    const r = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> ?? {}), Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!r) return null;
    if (r.status === 401) { token = ''; continue; }
    return r;
  }
  return null;
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

/* ---------- per-profile snapshot / merge / push ---------- */

const readJSON = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; }
};

function snapshot(p: Profile): Payload {
  const k = profileKeys(p.id);
  return {
    updatedAt: Number(localStorage.getItem('piano-updated-at') ?? 0),
    profile: { name: p.name, picture: p.picture },
    settings: readJSON<Settings>(k.settings, {}),
    progress: readJSON(k.progress, {}),
    daily: readJSON(k.daily, { date: '', done: [] }),
  };
}

/** Progress can only grow (per-section max); daily unions same-day;
 *  settings + name are last-write-wins on the updatedAt stamp. */
function mergeRemote(p: Profile, remote: Payload) {
  if (!remote || 'keys' in (remote as any)) return; // pre-identity format: superseded on next push
  const k = profileKeys(p.id);
  const localAt = Number(localStorage.getItem('piano-updated-at') ?? 0);
  const remoteWins = (remote.updatedAt ?? 0) > localAt;

  const prog = readJSON<Record<string, Record<number, number>>>(k.progress, {});
  for (const song of Object.keys(remote.progress ?? {})) {
    prog[song] ??= {};
    for (const sec of Object.keys(remote.progress[song])) {
      prog[song][+sec] = Math.max(prog[song][+sec] ?? 0, remote.progress[song][+sec]);
    }
  }
  localStorage.setItem(k.progress, JSON.stringify(prog));

  const daily = readJSON<{ date: string; done: string[] }>(k.daily, { date: '', done: [] });
  const rd = remote.daily ?? { date: '', done: [] };
  if (daily.date === rd.date) daily.done = [...new Set([...daily.done, ...rd.done])];
  else if ((rd.date ?? '') > (daily.date ?? '')) Object.assign(daily, rd);
  localStorage.setItem(k.daily, JSON.stringify(daily));

  if (remoteWins) {
    localStorage.setItem(k.settings, JSON.stringify(remote.settings ?? {}));
    if (remote.profile?.name) updateProfile(p.id, { name: remote.profile.name });
    localStorage.setItem('piano-updated-at', String(remote.updatedAt));
  }
}

async function push(p: Profile) {
  onStatus('syncing');
  const body = JSON.stringify(snapshot(p));
  const id = await findFile();
  let ok = false;
  if (id) {
    const r = await drive(`/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH', body, headers: { 'Content-Type': 'application/json' },
    });
    ok = !!r?.ok;
  } else {
    const boundary = 'mypiano';
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
  onStatus(ok ? 'synced' : 'error'); // error is soft — next change retries
}

function schedulePush() {
  const p = activeProfile();
  if (p.kind !== 'google' || !tokenClient) return; // local profiles never sync
  clearTimeout(pushT);
  pushT = window.setTimeout(() => push(activeProfile()), 3000);
}

async function fullSync(p: Profile) {
  onStatus('syncing');
  const remote = await pull();
  if (remote) {
    mergeRemote(p, remote);
    onRemoteChange();
  }
  await push(p);
}
