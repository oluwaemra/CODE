// ==========================================================
// GET  /api/gallery-photos  -> the photo set + the client's liked photos
// POST /api/gallery-photos  -> { src, liked } like / unlike one photo,
//                              { email } record an email before a download,
//                              or { ping: true } to keep the session alive
//
// Returns the photo set for the gallery named in the caller's session
// cookie (set by /api/gallery-login). No password is re-checked here —
// the cookie already proves it was checked once, recently.
//
// Photos are managed via the /admin panel and stored as Vercel Blob URLs
// (public-but-unlisted — see api/README.md for the tradeoff, and how to
// move to short-lived signed URLs for real client deliverables).
// ==========================================================

const { getGallery, getLikes, setLike, addEmail } = require("./_lib/kv");
const { getSessionFromRequest, signGallerySession, setSessionCookie } = require("./_lib/gallery-auth");

const safeHandler = require("./_lib/safe-handler");

// Only report likes for photos still in the gallery (removed photos drop out).
function currentLikes(gallery, likes) {
  const srcs = new Set(gallery.photos.map((photo) => photo.src));
  return likes.filter((src) => srcs.has(src));
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
