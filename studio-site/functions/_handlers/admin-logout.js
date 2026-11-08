// POST /api/admin-logout — clears the admin session cookie.

const { clearAdminCookie } = require("./_lib/admin-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  clearAdminCookie(res);
  return res.status(200).json({ ok: true });
};
