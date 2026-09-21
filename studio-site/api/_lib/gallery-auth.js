// Shared helpers for the client-gallery auth endpoints.

const jwt = require("jsonwebtoken");

const COOKIE_NAME = "gallery_session";
// A gallery session only lives this long past the client's last activity.
// Each authenticated request re-issues the cookie (a sliding window), and the
// page pings while it is open — so leaving the gallery for longer than this
// means the password is asked for again. Keep in step with AWAY_MS in
// js/client-gallery.js.
const SESSION_SECONDS = 5 * 60;
// Bumped when the session rules change, so older long-lived cookies stop working.
const SESSION_VERSION = 2;

function getJwtSecret() {
  const secret = process.env.GALLERY_JWT_SECRET;
  if (!secret) {
    throw new Error("GALLERY_JWT_SECRET is not set");
  }
  return secret;
}

function signGallerySession(slug) {
  return jwt.sign({ slug, v: SESSION_VERSION }, getJwtSecret(), { expiresIn: SESSION_SECONDS });
}

function verifyGallerySession(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return payload.v === SESSION_VERSION ? payload : null;
  } catch {
    return null;
  }
}

// Minimal cookie header parser — avoids pulling in a dependency for one field.
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function setSessionCookie(res, token) {
  const isProd = process.env.VERCEL_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyGallerySession(token);
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  signGallerySession,
  verifyGallerySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
};
