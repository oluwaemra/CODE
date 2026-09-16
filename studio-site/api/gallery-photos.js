// ==========================================================
// GET /api/gallery-photos
//
// Returns the photo set for the gallery named in the caller's session
// cookie (set by /api/gallery-login). No password is re-checked here —
// the cookie already proves it was checked once, recently.
//
// Photos are managed via the /admin panel and stored as Vercel Blob URLs
// (public-but-unlisted — see api/README.md for the tradeoff, and how to
// move to short-lived signed URLs for real client deliverables).
// ==========================================================

const { getGallery } = require("./_lib/kv");
const { getSessionFromRequest } = require("./_lib/gallery-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

  return res.status(200).json({
    ok: true,
    gallery: {
      slug: gallery.slug,
      clientName: gallery.clientName,
      downloadEnabled: !!gallery.downloadEnabled,
      photos: gallery.photos,
    },
  });
};
