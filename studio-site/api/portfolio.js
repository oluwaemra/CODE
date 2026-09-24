// GET /api/portfolio                 — public. The flat portfolio grid items
//                                       (managed via /admin) for portfolio.html.
// GET /api/portfolio?events=1        — public. Every event's title/slug and
//                                       its admin-picked "featured" photos,
//                                       for the Events section on that page.
// GET /api/portfolio?event=<slug>    — public. One event's full photo list,
//                                       for portfolio-event.html.
//
// Folded into this one function (rather than new api/*.js files) to stay
// under Vercel's Hobby-plan 12-function limit — this project is already at
// the cap.

const { getPortfolioItems, listEvents, getEvent } = require("./_lib/kv");

const safeHandler = require("./_lib/safe-handler");

module.exports = safeHandler(async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

  if (typeof req.query?.event === "string") {
    const event = await getEvent(req.query.event);
    if (!event) {
      return res.status(404).json({ ok: false, error: "Event not found." });
    }
    return res.status(200).json({
      ok: true,
      event: { slug: event.slug, title: event.title, photos: event.photos || [] },
    });
  }

  if (req.query?.events === "1") {
    const events = await listEvents();
    const summaries = events
      .map((event) => {
        const photos = event.photos || [];
        const featured = photos.filter((p) => p.featured);
        return {
          slug: event.slug,
          title: event.title,
          featuredPhotos: featured,
          totalCount: photos.length,
          hasMore: photos.length > featured.length,
          createdAt: event.createdAt,
        };
      })
      // Only list events with at least one photo to show — an event the
      // admin just created and hasn't uploaded to yet stays invisible.
      .filter((e) => e.featuredPhotos.length > 0)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return res.status(200).json({ ok: true, events: summaries });
  }

  const items = await getPortfolioItems();
  return res.status(200).json({ ok: true, items });
});
