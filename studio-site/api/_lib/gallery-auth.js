// Shared helpers for the client-gallery auth endpoints.

const jwt = require("jsonwebtoken");

const COOKIE_NAME = "gallery_session";
const TOKEN_TTL = "7d";

function getJwtSecret() {
  const secret = process.env.GALLERY_JWT_SECRET;
  if (!secret) {
    throw new Error("GALLERY_JWT_SECRET is not set");
  }
  return secret;
}

function signGallerySession(slug) {
  return jwt.sign({ slug }, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

function verifyGallerySession(token) {
  try {
    return jwt.verify(token, getJwtSecret());
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
    `Max-Age=${7 * 24 * 60 * 60}`,
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
  signGallerySession,
  verifyGallerySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
};
