// POST /api/gallery-logout — clears the gallery session cookie.

const { clearSessionCookie } = require("./_lib/gallery-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
