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

async function addEmail(slug, email) {
  await getClient().sadd(emailsKey(slug), String(email).trim().toLowerCase());
}

async function listGalleries() {
  const redis = getClient();
  const keys = await redis.keys("gallery:*");
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
};
