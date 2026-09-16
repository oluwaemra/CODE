// Admin session helpers. Deliberately separate cookie name + JWT secret
// from api/_lib/gallery-auth.js — an admin session and a client's gallery
// session should never be interchangeable.

const jwt = require("jsonwebtoken");

const COOKIE_NAME = "admin_session";
const TOKEN_TTL = "12h";

function getJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET is not set");
  return secret;
}

function signAdminSession() {
  return jwt.sign({ role: "admin" }, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

function verifyAdminSession(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return payload.role === "admin" ? payload : null;
  } catch {
    return null;
  }
}

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

function setAdminCookie(res, token) {
  const isProd = process.env.VERCEL_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${12 * 60 * 60}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getAdminSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyAdminSession(token);
}

// Call at the top of every admin-only endpoint. Returns true and has
// already written a 401 response if the caller isn't authenticated.
function rejectIfNotAdmin(req, res) {
  const session = getAdminSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "Not signed in as admin." });
    return true;
  }
  return false;
}

module.exports = {
  signAdminSession,
  setAdminCookie,
  clearAdminCookie,
  getAdminSessionFromRequest,
  rejectIfNotAdmin,
};
