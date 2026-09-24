// ==========================================================
// GET  /api/gallery-photos             -> the photo set + the client's liked photos
// GET  /api/gallery-photos?download=<src> -> streams that one photo back as a
//                              same-origin download (see downloadOnePhoto below)
// POST /api/gallery-photos  -> { src, liked } like / unlike one photo,
//                              { email } record an email before a download,
//                              or { ping: true } to keep the session alive
//
// Returns the photo set for the gallery named in the caller's session
// cookie (set by /api/gallery-login). No password is re-checked here —
// the cookie already proves it was checked once, recently.
//
// Photos are managed via the /admin panel and stored on Cloudflare R2
// (public-but-unlisted — see api/README.md for the tradeoff, and how to
// move to short-lived signed URLs for real client deliverables).
//
// Folded into this same function (rather than a new api/*.js file) to stay
// under Vercel's Hobby-plan 12-function limit — this project is already at
// the cap.
// ==========================================================

const { getGallery, getLikes, setLike, addEmail } = require("./_lib/kv");
const { getSessionFromRequest, signGallerySession, setSessionCookie } = require("./_lib/gallery-auth");

const safeHandler = require("./_lib/safe-handler");

// Only report likes for photos still in the gallery (removed photos drop out).
function currentLikes(gallery, likes) {
  const srcs = new Set(gallery.photos.map((photo) => photo.src));
  return likes.filter((src) => srcs.has(src));
}

// The photo's original file name. New uploads store it; for older ones it's
// recovered from the storage key by dropping the timestamp/random suffix
// storage adds (mirrors originalName() in js/client-gallery.js).
function originalNameFor(photo, fallbackBase) {
  if (photo.name) return photo.name;
  try {
    const segment = decodeURIComponent(new URL(photo.src).pathname.split("/").pop() || "");
    const match = segment.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
    const ext = (match && match[2]) || ".jpg";
    const base = ((match && match[1]) || "").replace(/-[A-Za-z0-9]{16,}$/, "").replace(/^\d{10,}-/, "");
    return base ? base + ext : `${fallbackBase}.jpg`;
  } catch {
    return `${fallbackBase}.jpg`;
  }
}

// Fetches one of this gallery's own photos server-side and hands it back as
// a same-origin download. R2's custom domain (photos.emrashotit.com) only
// sends CORS headers on the OPTIONS preflight, not the real GET response, so
// a browser-side fetch() of the photo is blocked by CORS — this sidesteps
// that entirely by having the *server* fetch it instead (no CORS involved
// between two servers) and stream it to the browser from our own origin.
async function downloadOnePhoto(req, res, gallery) {
  if (!gallery.downloadEnabled) {
    return res.status(403).json({ ok: false, error: "Downloads are turned off for this gallery." });
  }
  const src = req.query?.download;
  const photo = gallery.photos.find((p) => p.src === src);
  if (!photo) {
    return res.status(404).json({ ok: false, error: "Photo not found in this gallery." });
  }

  let upstream;
  try {
    upstream = await fetch(photo.src);
  } catch {
    upstream = null;
  }
  if (!upstream || !upstream.ok) {
    return res.status(502).json({ ok: false, error: "Couldn't fetch the photo from storage." });
  }

  const name = originalNameFor(photo, gallery.slug).replace(/[\r\n"]/g, "");
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).end(buffer);
}

module.exports = safeHandler(async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: "Not signed in to a gallery." });
  }

  const gallery = await getGallery(session.slug);
  if (!gallery) {
    // The gallery referenced by an old cookie was removed.
    return res.status(404).json({ ok: false, error: "Gallery not found." });
  }

  // Every authenticated request slides the session window forward.
  setSessionCookie(res, signGallerySession(gallery.slug));

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid JSON body" });
      }
    }
    body = body || {};
    // Heartbeat from the open page (and a final one as the tab is hidden).
    if (body.ping === true) return res.status(200).json({ ok: true });

    if (typeof body.email === "string") {
      const email = body.email.trim();
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
      }
      await addEmail(gallery.slug, email);
      return res.status(200).json({ ok: true });
    }

    const { src, liked } = body;
    if (typeof src !== "string" || typeof liked !== "boolean") {
      return res.status(400).json({ ok: false, error: "src and liked are required." });
    }
    if (!gallery.photos.some((photo) => photo.src === src)) {
      return res.status(404).json({ ok: false, error: "Photo not found in this gallery." });
    }
    await setLike(gallery.slug, src, liked);
    return res.status(200).json({ ok: true, likes: currentLikes(gallery, await getLikes(gallery.slug)) });
  }

  if (typeof req.query?.download === "string") {
    return downloadOnePhoto(req, res, gallery);
  }

  return res.status(200).json({
    ok: true,
    gallery: {
      slug: gallery.slug,
      clientName: gallery.clientName,
      downloadEnabled: !!gallery.downloadEnabled,
      photos: gallery.photos,
      likes: currentLikes(gallery, await getLikes(gallery.slug)),
    },
  });
});
