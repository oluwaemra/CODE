// Shared data-store client + helpers.
//
// Uses Upstash Redis (installed from the Vercel Marketplace — "Storage" ->
// "Redis"). Once installed on your Vercel project it injects one of these
// env var pairs automatically, so both are supported here:
//   KV_REST_API_URL / KV_REST_API_TOKEN               (older naming)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (current naming)
//
// Data shapes stored here:
//   portfolio:items         -> JSON array of portfolio items
//   gallery:<slug>          -> JSON object for one client gallery
//   (gallery slugs are discovered via redis.keys("gallery:*"))
//   likes:<slug>            -> Redis SET of photo srcs the client has favourited
//                              (its own key + atomic SADD/SREM, so a client liking
//                              a photo never races with an admin editing the gallery)
//   event:<slug>            -> JSON object for one portfolio event (a grouped
//                              set of public photos — see the Events tab and
//                              the "Events" filter on portfolio.html)
//   (event slugs are discovered via redis.keys("event:*"))

const { Redis } = require("@upstash/redis");

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis is not configured — install the Redis integration from the Vercel Marketplace, or set KV_REST_API_URL / KV_REST_API_TOKEN."
    );
  }

  client = new Redis({ url, token });
  return client;
}

const PORTFOLIO_KEY = "portfolio:items";

async function getPortfolioItems() {
  const items = await getClient().get(PORTFOLIO_KEY);
  return Array.isArray(items) ? items : [];
}

async function savePortfolioItems(items) {
  await getClient().set(PORTFOLIO_KEY, items);
}

function galleryKey(slug) {
  return `gallery:${slug}`;
}

async function getGallery(slug) {
  return getClient().get(galleryKey(slug));
}

async function saveGallery(gallery) {
  await getClient().set(galleryKey(gallery.slug), gallery);
}

async function deleteGallery(slug) {
  await getClient().del(galleryKey(slug), likesKey(slug), emailsKey(slug));
}

function likesKey(slug) {
  return `likes:${slug}`;
}

async function getLikes(slug) {
  const members = await getClient().smembers(likesKey(slug));
  return Array.isArray(members) ? members.map(String) : [];
}

async function setLike(slug, src, liked) {
  const redis = getClient();
  if (liked) await redis.sadd(likesKey(slug), src);
  else await redis.srem(likesKey(slug), src);
}

function emailsKey(slug) {
  return `emails:${slug}`;
}

async function getEmails(slug) {
  const members = await getClient().smembers(emailsKey(slug));
  return Array.isArray(members) ? members.map(String) : [];
}

// Master "email sheet": one hash, field = email, value = { firstSeen,
// lastSeen, galleries: [slug, ...] }. The per-gallery sets above stay as they
// are; this adds timestamps and a cross-gallery view for the admin.
const EMAIL_BOOK = "emailbook";

async function addEmail(slug, email) {
  const redis = getClient();
  const clean = String(email).trim().toLowerCase();
  await redis.sadd(emailsKey(slug), clean);

  const now = new Date().toISOString();
  const existing = (await redis.hget(EMAIL_BOOK, clean)) || {};
  const galleries = Array.isArray(existing.galleries) ? existing.galleries : [];
  if (!galleries.includes(slug)) galleries.push(slug);
  await redis.hset(EMAIL_BOOK, {
    [clean]: { firstSeen: existing.firstSeen || now, lastSeen: now, galleries },
  });
}

// Every email ever collected, newest first. Emails gathered before the sheet
// existed are picked up from the per-gallery sets (no date known).
async function listAllEmails() {
  const redis = getClient();
  const book = (await redis.hgetall(EMAIL_BOOK)) || {};
  const entries = new Map();
  for (const [email, info] of Object.entries(book)) {
    entries.set(email, {
      email,
      firstSeen: (info && info.firstSeen) || null,
      lastSeen: (info && info.lastSeen) || null,
      galleries: Array.isArray(info && info.galleries) ? [...info.galleries] : [],
    });
  }
  const keys = await redis.keys("emails:*");
  for (const key of keys) {
    const slug = key.slice("emails:".length);
    const members = await redis.smembers(key);
    for (const raw of Array.isArray(members) ? members : []) {
      const email = String(raw);
      if (!entries.has(email)) entries.set(email, { email, firstSeen: null, lastSeen: null, galleries: [] });
      const entry = entries.get(email);
      if (!entry.galleries.includes(slug)) entry.galleries.push(slug);
    }
  }
  return [...entries.values()].sort((a, b) => {
    if (a.firstSeen && b.firstSeen) return b.firstSeen.localeCompare(a.firstSeen);
    if (a.firstSeen) return -1;
    if (b.firstSeen) return 1;
    return a.email.localeCompare(b.email);
  });
}

async function listGalleries() {
  const redis = getClient();
  const keys = await redis.keys("gallery:*");
  if (!keys.length) return [];
  const values = await Promise.all(keys.map((key) => redis.get(key)));
  return values.filter(Boolean);
}

function eventKey(slug) {
  return `event:${slug}`;
}

async function getEvent(slug) {
  return getClient().get(eventKey(slug));
}

async function saveEvent(event) {
  await getClient().set(eventKey(event.slug), event);
}

async function deleteEvent(slug) {
  await getClient().del(eventKey(slug));
}

async function listEvents() {
  const redis = getClient();
  const keys = await redis.keys("event:*");
  if (!keys.length) return [];
  const values = await Promise.all(keys.map((key) => redis.get(key)));
  return values.filter(Boolean);
}

module.exports = {
  getPortfolioItems,
  savePortfolioItems,
  getGallery,
  saveGallery,
  deleteGallery,
  listGalleries,
  getLikes,
  setLike,
  getEmails,
  addEmail,
  listAllEmails,
  getEvent,
  saveEvent,
  deleteEvent,
  listEvents,
};
