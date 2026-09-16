// ==========================================================
// POST /api/gallery-login
//
// Verifies a gallery slug + password against the Redis-backed gallery
// store (see api/_lib/kv.js — galleries are managed via the /admin panel)
// and, on success, sets an httpOnly JWT cookie scoped to that gallery.
// The gallery photos endpoint (api/gallery-photos.js) trusts that cookie
// instead of re-checking the password on every request.
//
// Required env var: GALLERY_JWT_SECRET (any long random string).
// ==========================================================

const bcrypt = require("bcryptjs");
const { getGallery } = require("./_lib/kv");
const { signGallerySession, setSessionCookie } = require("./_lib/gallery-auth");

// Best-effort in-memory rate limit — same caveats as api/contact.js.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(key, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!process.env.GALLERY_JWT_SECRET) {
    console.error("Missing GALLERY_JWT_SECRET env var");
    return res.status(500).json({ ok: false, error: "Server is not configured yet." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

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
  const password = String(body.password || "");

  // Rate-limit per IP+slug so a bad guess against one gallery doesn't
  // lock out someone guessing a different one from the same network.
  if (isRateLimited(`${ip}:${slug}`)) {
    return res.status(429).json({ ok: false, error: "Too many attempts — please try again later." });
  }

  if (!slug || !password) {
    return res.status(400).json({ ok: false, error: "Gallery code and password are required." });
  }

  const gallery = await getGallery(slug);

  // Always run bcrypt.compare, even when the gallery doesn't exist, against
  // a fixed dummy hash — this keeps response time roughly constant so a
  // timing attack can't be used to enumerate valid gallery slugs.
  const hashToCheck =
    gallery?.passwordHash || "$2b$10$0000000000000000000000000000000000000000000000000";
  const passwordMatches = await bcrypt.compare(password, hashToCheck);

  if (!gallery || !passwordMatches) {
    return res.status(401).json({ ok: false, error: "Incorrect gallery code or password." });
  }

  const token = signGallerySession(gallery.slug);
  setSessionCookie(res, token);

  return res.status(200).json({
    ok: true,
    gallery: { slug: gallery.slug, clientName: gallery.clientName },
  });
};
