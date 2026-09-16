// POST /api/admin/upload
//
// Accepts a base64-encoded image (already resized/compressed client-side —
// see js/admin.js) and stores it in Vercel Blob, returning its public URL.
//
// Body: { filename: string, contentType: string, dataBase64: string }
//
// Requires the "Blob" storage integration to be added to the Vercel
// project (Storage tab -> Create Database -> Blob), which auto-injects
// BLOB_READ_WRITE_TOKEN.
//
// Note: images stored here get a public, unlisted URL — anyone with the
// exact link can view it, same tradeoff called out in api/README.md for
// client-gallery photos. Fine for a template; swap for signed/private
// access before handling sensitive shoots at scale.

const { put } = require("@vercel/blob");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");

const MAX_BYTES = 8 * 1024 * 1024; // 8MB decoded — client-side resize should stay well under this
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (rejectIfNotAdmin(req, res)) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN — add the Blob storage integration in Vercel.");
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

  try {
    const blob = await put(`uploads/${Date.now()}-${safeName}`, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return res.status(200).json({ ok: true, url: blob.url });
  } catch (err) {
    console.error("Blob upload failed:", err);
    return res.status(502).json({ ok: false, error: "Upload failed." });
  }
};
