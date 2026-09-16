# Backend — deployment notes

This site is static HTML/CSS/JS with serverless functions under `/api`,
built for Vercel (Node 18+ runtime, no build step). Three pieces:

1. **Contact form** — sends email via Resend
2. **Client galleries** — password-gated photo delivery
3. **Admin panel** (`/admin`) — where you manage both of the above

## 1. Contact form — `/api/contact`

**Env vars:**
- `RESEND_API_KEY` — from resend.com/api-keys
- `CONTACT_TO_EMAIL` — the studio inbox that should receive inquiries
- `CONTACT_FROM_EMAIL` — an address on a domain verified in Resend

## 2. Data + file storage

Portfolio items and client galleries are no longer static files — they're
stored in Redis (for structured data) and Vercel Blob (for the images
themselves), both managed through `/admin`.

**Set these up from the Vercel dashboard**, on your project:

- **Storage → Create Database → Redis** (via the Marketplace — this used
  to be called "Vercel KV"). Connecting it to your project auto-injects
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*`
  equivalents — `api/_lib/kv.js` checks both names).
- **Storage → Create Database → Blob**. Connecting it auto-injects
  `BLOB_READ_WRITE_TOKEN`.

No manual env var entry needed for either — connecting them in the
dashboard is enough.

## 3. Admin panel — `/admin`

A single shared password gates `/admin/index.html`, where you can:
- Add, edit, and delete portfolio grid items (with image upload)
- Create client galleries, set/change their password, toggle whether
  downloads are allowed, and add or remove photos

**Env vars:**
- `ADMIN_JWT_SECRET` — any long random string (`openssl rand -hex 32`)
- `ADMIN_PASSWORD_HASH` — a bcrypt hash of your chosen admin password:
  ```
  node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
  ```
  Paste the output (starts with `$2b$...`) as the env var value — never
  the plain password itself.

Once deployed, go to `yoursite.com/admin/login.html` to sign in.

### Client gallery auth (separate from admin)

- `GALLERY_JWT_SECRET` — any long random string, **different** from
  `ADMIN_JWT_SECRET`. A client's gallery session and your admin session
  are intentionally on separate cookies/secrets so one can never be used
  to forge the other.

## Seeding a demo gallery (optional)

To have a working `demo` / `previewme` gallery to test the login flow
with right after your first deploy, instead of creating one by hand in
`/admin`:

```bash
cd studio-site
npm install
vercel env pull .env    # pulls KV_REST_API_URL etc. from your Vercel project
node scripts/seed-demo-data.js
```

This is optional and just a convenience — the real way to add galleries
is through `/admin`.

## Two upload paths — and why

`/admin` uploads images through two different mechanisms, on purpose:

- **Portfolio items** (`api/admin/upload.js`) — the browser resizes the
  image to a max dimension and re-compresses it (`js/admin.js`,
  `prepareImageForUpload`) before a normal `POST`. Correct for these:
  they're only ever shown on the public site, and a serverless function's
  request body is capped at 4.5MB — a full-res camera JPEG won't fit.

- **Client gallery photos** (`api/admin/gallery-upload-token.js`) — clients
  download these, so they need to arrive at the *original* quality the
  studio uploaded, not a web-resized copy. This path skips the resize and
  uploads the untouched file straight from the browser to Vercel Blob,
  bypassing the serverless function's body-size limit entirely (per
  [Vercel's client-upload docs](https://vercel.com/docs/vercel-blob/client-upload)).
  Since there's no build step here, the browser loads Vercel's client
  library from `esm.sh` at runtime (`js/admin.js`, pinned to the exact
  `@vercel/blob` version in `package.json`) rather than importing it from
  `node_modules` directly.

If you ever add a bundler to this project, swap that CDN import for a
real `import` from `@vercel/blob/client` — same code either way.

## Known tradeoffs (fine for a template, worth hardening before scale)

- **Portfolio and gallery images get public, unlisted Blob URLs.** Anyone
  with the exact link can view them; they're not indexed or listed
  anywhere, but the URL alone is the only protection. For sensitive
  client work, move to short-lived signed URLs instead.
- **Rate limiting is in-memory**, per serverless instance, and resets on
  cold start (`api/contact.js`, `api/gallery-login.js`, `api/admin-login.js`).
  Good enough to deter a casual bot; for real abuse protection, use
  Vercel's Attack Challenge Mode or a proper limiter like Upstash Ratelimit.
- **Single shared admin password**, not a multi-user system with
  individual accounts. Fine for a solo studio; would need real user
  accounts + roles to hand out separate logins to staff.

## Local development

```bash
npm install
cp .env.example .env   # fill in real values
npx vercel dev
```

`vercel dev` requires a Vercel account (free) and running `vercel login`
once. It's the only way to exercise `/api/*` locally — a plain static file
server (`python -m http.server`, etc.) serves the HTML/CSS/JS fine but
can't run the serverless functions.
