// POST /api/admin/upload
//
// Accepts a base64-encoded image (already resized/compressed client-side —
// see js/admin.js) and stores it in Cloudflare R2, returning its public URL.
//
// Body: { filename: string, contentType: string, dataBase64: string }
//
// Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL — see api/README.md.
//
// Note: images stored here get a public, unlisted URL — anyone with the
// exact link can view it, same tradeoff called out in api/README.md for
// client-gallery photos. Fine for a template; swap for signed/private
// access before handling sensitive shoots at scale.

const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getR2Client, publicUrlFor, missingEnv } = require("../_lib/r2");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");

const MAX_BYTES = 8 * 1024 * 1024; // 8MB decoded — client-side resize should stay well under this
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (rejectIfNotAdmin(req, res)) return;

  const missing = missingEnv();
  if (missing.length) {
    console.error(`File storage is not configured — missing env vars: ${missing.join(", ")}. See api/README.md.`);
    return res.status(500).json({ ok: false, error: "File storage is not configured yet." });
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

  const { filename, contentType, dataBase64 } = body;

  if (!filename || !contentType || !dataBase64) {
    return res.status(400).json({ ok: false, error: "filename, contentType, and dataBase64 are required." });
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ ok: false, error: `Unsupported file type: ${contentType}` });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    return res.status(400).json({ ok: false, error: "dataBase64 could not be decoded." });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: "File too large." });
  }

  const safeName = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const key = `uploads/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeName}`;

  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return res.status(200).json({ ok: true, url: publicUrlFor(key) });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return res.status(502).json({ ok: false, error: "Upload failed." });
  }
};
