// One-off script: seeds a demo client gallery into Redis so the login
// flow is testable right after deploy, without waiting to create a real
// one through /admin. Safe to run multiple times (overwrites the "demo"
// gallery each time). Not run automatically — the admin panel is the
// real way to manage content.
//
// Usage:
//   cd studio-site
//   node scripts/seed-demo-data.js
//
// Needs KV_REST_API_URL / KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_*
// equivalents) in the environment — e.g. `vercel env pull .env` first,
// or export them manually from the Vercel dashboard.

require("dotenv").config();
const { Redis } = require("@upstash/redis");
const seed = require("./demo-gallery-seed.json");

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    "Missing Redis env vars. Run `vercel env pull .env` from the project root first, or set KV_REST_API_URL / KV_REST_API_TOKEN manually."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

(async () => {
  for (const gallery of seed.galleries) {
    await redis.set(`gallery:${gallery.slug}`, gallery);
    console.log(`Seeded gallery "${gallery.slug}" (password: previewme)`);
  }
  console.log("Done.");
})();
