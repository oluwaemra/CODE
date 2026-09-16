// GET /api/portfolio — public. Returns the current portfolio grid items
// (managed via the /admin panel) for portfolio.html to render.

const { getPortfolioItems } = require("./_lib/kv");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const items = await getPortfolioItems();
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res.status(200).json({ ok: true, items });
};
