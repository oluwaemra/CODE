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
stored in Redis (for structured data) and Cloudflare R2 (for the images
themselves, chosen for its zero egress fees — client galleries can move a
lot of bandwidth), both managed through `/admin`.

**Redis — set up from the Vercel dashboard:**

- **Storage → Create Database → Redis** (via the Marketplace — this used
  to be called "Vercel KV"). Connecting it to your project auto-injects
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*`
  equivalents — `api/_lib/kv.js` checks both names). No manual entry needed.

**R2 — set up from the Cloudflare dashboard** (no Vercel integration, so
these env vars go in by hand, both locally in `.env` and under Vercel →
Project → Settings → Environment Variables):

1. **R2 → Create bucket.** Note the bucket name (`R2_BUCKET_NAME`) and your
   account ID, shown in the R2 overview (`R2_ACCOUNT_ID`).
2. **R2 → Manage API tokens → Create API token**, with read/write access
   scoped to that bucket. Gives you `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY`.
3. **Bucket → Settings → Public access.** Enable it (either the bucket's
   `r2.dev` subdomain, or your own custom domain). Whatever URL that gives
   you, minus any trailing slash, is `R2_PUBLIC_BASE_URL` — object keys get
   appended to it directly (`{R2_PUBLIC_BASE_URL}/{key}`).
4. **Bucket → Settings → CORS policy.** The client gallery fetches photo
   bytes in-browser (for the zip download and per-photo save) from your
   site's origin, so the bucket needs a CORS rule allowing `GET` from it —
   otherwise those fetches fail with a CORS error even though the direct
   `<img>` preview still works fine.

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
  studio uploaded, not a web-resized copy. This path skips the resize:
  `js/admin.js` asks this endpoint for a short-lived presigned R2 URL, then
  `PUT`s the untouched file straight to R2 from the browser, bypassing the
  serverless function's body-size limit entirely.

## Known tradeoffs (fine for a template, worth hardening before scale)

- **Portfolio and gallery images get public, unlisted R2 URLs.** Anyone
  with the exact link can view them; they're not indexed or listed
  anywhere, but the URL alone is the only protection. For sensitive
  client work, move to short-lived signed GET URLs instead (the R2 client
  in `api/_lib/r2.js` already has everything needed to presign those, the
  same way gallery uploads are presigned).
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
