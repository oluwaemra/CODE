// POST /api/admin/gallery-upload-token
//
// Client-gallery photos need to reach clients at full resolution/quality —
// unlike portfolio thumbnails (api/admin/upload.js), which are deliberately
// resized for web display. A Vercel serverless function has a hard 4.5MB
// request-body limit that real camera JPEGs blow past, so full-quality
// files can't be routed through a normal POST endpoint like upload.js does.
//
// Instead, this issues a short-lived, admin-gated presigned PUT URL that
// lets the browser (js/admin.js) upload the ORIGINAL file bytes straight to
// R2 — bypassing this function's body entirely.
//
// Body: { filename: string, contentType: string }
// Response: { ok: true, uploadUrl, publicUrl }
//   - uploadUrl: PUT the raw file bytes here directly from the browser.
//   - publicUrl: where the file will be reachable once the PUT succeeds —
//     save this on the gallery record.

const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { getR2Client, publicUrlFor, missingEnv } = require("../_lib/r2");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");

// Advisory only — a presigned PUT URL has no built-in max-size enforcement,
// unlike upload.js's buffer check. Fine for a trusted, single-admin uploader;
// add a Worker-side size check before opening this up to untrusted callers.
const MAX_BYTES = 100 * 1024 * 1024; // 100MB per file — generous headroom above any realistic full-res JPEG
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const URL_TTL_SECONDS = 5 * 60;

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

  const { filename, contentType } = body;
  if (!filename || !contentType) {
    return res.status(400).json({ ok: false, error: "filename and contentType are required." });
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ ok: false, error: `Unsupported file type: ${contentType}` });
  }

  const safeName = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, "-");
  const key = `galleries/${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeName}`;

  try {
    const uploadUrl = await getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: URL_TTL_SECONDS }
    );
    return res.status(200).json({ ok: true, uploadUrl, publicUrl: publicUrlFor(key), maxBytes: MAX_BYTES });
  } catch (err) {
    console.error("Gallery upload token error:", err);
    return res.status(500).json({ ok: false, error: "Couldn't start upload." });
  }
};
