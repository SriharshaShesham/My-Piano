# Deployment

Source lives in the private repo (`piano-kids`). Every push to `main` runs
`.github/workflows/deploy.yml`, which builds the site and force-publishes
`dist/` to the public repo **SriharshaShesham/MyPiano** (single orphan
commit), which GitHub Pages serves at **https://mypiano.srichakram.in**.

Wiring (already done, for reference):
- Deploy key with write access on MyPiano; private half stored as the
  `ACTIONS_DEPLOY_KEY` secret in piano-kids.
- The workflow writes a `CNAME` file (`mypiano.srichakram.in`) into the
  published output — that's what sets the Pages custom domain.
- Manual deploy: Actions tab → "Deploy to MyPiano" → Run workflow.

## Cloudflare DNS (one-time)

1. Cloudflare dashboard → `srichakram.in` zone → **DNS** → Add record:
   - Type: **CNAME** · Name: `mypiano` · Target: `sriharshashesham.github.io`
   - Proxy status: **DNS only (grey cloud)** until HTTPS is issued.
2. GitHub → MyPiano → Settings → Pages: the custom domain
   `mypiano.srichakram.in` appears automatically (from the CNAME file).
   Wait for the DNS check ✓, then tick **Enforce HTTPS**
   (certificate issuance can take a few minutes after DNS propagates).
3. Optional hardening:
   - GitHub account Settings → Pages → **Add verified domain**
     `srichakram.in` (prevents Pages domain takeover).
   - After HTTPS works you may flip the Cloudflare proxy to orange —
     set SSL/TLS mode to **Full (strict)** if you do.

## Google OAuth (one-time, enables the Sign-in-with-Google button)

1. console.cloud.google.com → new project (e.g. "Piano Kids") →
   APIs & Services → Library → enable **Google Drive API**.
2. OAuth consent screen: **External**; app name "Piano Kids"; add your own
   email as a test user. (Publish the app later to let anyone sign in.)
3. Credentials → Create credentials → **OAuth client ID** → Web application:
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `https://mypiano.srichakram.in`
   - No redirect URIs (the app uses the token flow).
4. Local dev: create `.env.local` at the repo root (git-ignored):
   `VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com`
5. Production: store the same value as an Actions secret in piano-kids —
   `gh secret set VITE_GOOGLE_CLIENT_ID` — then re-run the deploy workflow.

Without the client ID the app works fully with local profiles only; the
"Sign in with Google" option simply never appears in the add-profile chooser.
