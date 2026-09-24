// /api/admin/galleries — admin-only CRUD for client galleries.
//
//   GET    -> list all galleries (passwordHash never included in responses)
//   POST   -> create one   { slug, clientName, password, downloadEnabled? }
//   PUT    -> update one   { slug, clientName?, password?, downloadEnabled?, photos? }
//             (password is re-hashed if provided; photos, if provided,
//             fully replaces the gallery's photo list — the admin UI
//             sends the whole updated array after an add/remove)
//   DELETE -> remove one   ?slug=<slug>

const bcrypt = require("bcryptjs");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");
const { getGallery, saveGallery, deleteGallery, listGalleries, getLikes, getEmails } = require("../_lib/kv");

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function omitPasswordHash(gallery) {
  const { passwordHash, ...rest } = gallery;
  return rest;
}

const safeHandler = require("../_lib/safe-handler");

module.exports = safeHandler(async function handler(req, res) {
  if (rejectIfNotAdmin(req, res)) return;

  if (req.method === "GET") {
    const galleries = await listGalleries();
    // Attach each gallery's client favourites (only for photos still present).
    const withLikes = await Promise.all(
      galleries.map(async (gallery) => {
        const srcs = new Set((gallery.photos || []).map((photo) => photo.src));
        const likes = (await getLikes(gallery.slug)).filter((src) => srcs.has(src));
        const emails = await getEmails(gallery.slug);
        return { ...omitPasswordHash(gallery), likes, emails };
      })
    );
    return res.status(200).json({ ok: true, galleries: withLikes });
  }

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

    const slug = String(body.slug || "").trim().toLowerCase();
    const clientName = String(body.clientName || "").trim();
    const password = String(body.password || "");

    if (!slug || !clientName || !password) {
      return res.status(400).json({ ok: false, error: "slug, clientName, and password are required." });
    }
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({
        ok: false,
        error: "Slug must be lowercase letters, numbers, and hyphens (3-50 chars).",
      });
    }

    const existing = await getGallery(slug);
    if (existing) {
      return res.status(409).json({ ok: false, error: "A gallery with that slug already exists." });
    }

    const gallery = {
      slug,
      clientName,
      passwordHash: await bcrypt.hash(password, 10),
      downloadEnabled: body.downloadEnabled !== false,
      photos: [],
      createdAt: new Date().toISOString(),
    };
    await saveGallery(gallery);
    return res.status(201).json({ ok: true, gallery: omitPasswordHash(gallery) });
  }

  if (req.method === "PUT") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid JSON body" });
      }
    }
    body = body || {};

    const slug = String(body.slug || "").trim().toLowerCase();
    if (!slug) {
      return res.status(400).json({ ok: false, error: "slug is required." });
    }

    const gallery = await getGallery(slug);
    if (!gallery) {
      return res.status(404).json({ ok: false, error: "Gallery not found." });
    }

    if ("clientName" in body) gallery.clientName = String(body.clientName).trim();
    if ("downloadEnabled" in body) gallery.downloadEnabled = !!body.downloadEnabled;
    if (Array.isArray(body.photos)) gallery.photos = body.photos;
    if (body.password) gallery.passwordHash = await bcrypt.hash(String(body.password), 10);

    await saveGallery(gallery);
    return res.status(200).json({ ok: true, gallery: omitPasswordHash(gallery) });
  }

  if (req.method === "DELETE") {
    const slug = req.query?.slug;
    if (!slug) {
      return res.status(400).json({ ok: false, error: "slug query param is required." });
    }
    const existing = await getGallery(slug);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Gallery not found." });
    }
    await deleteGallery(slug);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
});
