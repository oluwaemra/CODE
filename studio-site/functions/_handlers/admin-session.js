// GET /api/admin-session — lets the admin dashboard check on load whether
// the visitor already has a valid session, before showing any content.

const { getAdminSessionFromRequest } = require("./_lib/admin-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = getAdminSessionFromRequest(req);
  return res.status(200).json({ ok: !!session });
};
