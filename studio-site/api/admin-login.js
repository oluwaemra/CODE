// POST /api/admin-login
//
// Single shared admin password (this is a one-person/small-studio admin
// panel, not a multi-user system). Compares against ADMIN_PASSWORD_HASH.
// To generate a hash for a new password:
//   node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"

const bcrypt = require("bcryptjs");
const { signAdminSession, setAdminCookie } = require("./_lib/admin-auth");

const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(ip, { windowStart: now, count: 1 });
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

  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!process.env.ADMIN_JWT_SECRET || !passwordHash) {
    console.error("Missing ADMIN_JWT_SECRET / ADMIN_PASSWORD_HASH env vars");
    return res.status(500).json({ ok: false, error: "Admin login is not configured yet." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many attempts — please try again later." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const password = String(body.password || "");
  if (!password) {
    return res.status(400).json({ ok: false, error: "Password is required." });
  }

  const matches = await bcrypt.compare(password, passwordHash);
  if (!matches) {
    return res.status(401).json({ ok: false, error: "Incorrect password." });
  }

  const token = signAdminSession();
  setAdminCookie(res, token);
  return res.status(200).json({ ok: true });
};
