// /api/admin/portfolio — admin-only CRUD for portfolio grid items.
//
//   GET    -> list all items
//   POST   -> create one   { title, category, imageUrl, alt, href? }
//   PUT    -> update one   { id, ...fields to change }
//   DELETE -> remove one   ?id=<id>
//
// Categories match the filter buttons on portfolio.html:
// portraits | events | commercial | graduation | video | featured

const crypto = require("crypto");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");
const { getPortfolioItems, savePortfolioItems } = require("../_lib/kv");

const VALID_CATEGORIES = new Set([
  "portraits",
  "events",
  "commercial",
  "graduation",
  "video",
  "featured",
]);

const safeHandler = require("../_lib/safe-handler");

module.exports = safeHandler(async function handler(req, res) {
  if (rejectIfNotAdmin(req, res)) return;

  if (req.method === "GET") {
    const items = await getPortfolioItems();
    return res.status(200).json({ ok: true, items });
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

    const { title, category, imageUrl, alt, href } = body;
    if (!title || !category || !imageUrl) {
      return res.status(400).json({ ok: false, error: "title, category, and imageUrl are required." });
    }
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ ok: false, error: `Invalid category: ${category}` });
    }

    const items = await getPortfolioItems();
    const item = {
      id: crypto.randomUUID(),
      title: String(title).trim(),
      category,
      imageUrl,
      alt: alt ? String(alt).trim() : String(title).trim(),
      href: href ? String(href).trim() : "#",
      createdAt: new Date().toISOString(),
    };
    items.unshift(item);
    await savePortfolioItems(items);
    return res.status(201).json({ ok: true, item });
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

    if (!body.id) {
      return res.status(400).json({ ok: false, error: "id is required." });
    }
    if (body.category && !VALID_CATEGORIES.has(body.category)) {
      return res.status(400).json({ ok: false, error: `Invalid category: ${body.category}` });
    }

    const items = await getPortfolioItems();
    const index = items.findIndex((item) => item.id === body.id);
    if (index === -1) {
      return res.status(404).json({ ok: false, error: "Item not found." });
    }

    items[index] = {
      ...items[index],
      ...("title" in body ? { title: String(body.title).trim() } : {}),
      ...("category" in body ? { category: body.category } : {}),
      ...("imageUrl" in body ? { imageUrl: body.imageUrl } : {}),
      ...("alt" in body ? { alt: String(body.alt).trim() } : {}),
      ...("href" in body ? { href: String(body.href).trim() } : {}),
    };
    await savePortfolioItems(items);
    return res.status(200).json({ ok: true, item: items[index] });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) {
      return res.status(400).json({ ok: false, error: "id query param is required." });
    }
    const items = await getPortfolioItems();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) {
      return res.status(404).json({ ok: false, error: "Item not found." });
    }
    await savePortfolioItems(next);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
});
