// POST /api/admin/gallery-upload-token
//
// Client-gallery photos need to reach clients at full resolution/quality —
// unlike portfolio thumbnails (api/admin/upload.js), which are deliberately
// resized for web display. A Vercel serverless function has a hard 4.5MB
// request-body limit that real camera JPEGs blow past, so full-quality
// files can't be routed through a normal POST endpoint like upload.js does.
//
// Instead, this issues a short-lived, admin-gated token that lets the
// browser (js/admin.js) upload the ORIGINAL file bytes straight to Vercel
// Blob storage — bypassing this function's body entirely. See:
// https://vercel.com/docs/vercel-blob/client-upload

const { handleUpload } = require("@vercel/blob/client");
const { rejectIfNotAdmin } = require("../_lib/admin-auth");

const MAX_BYTES = 100 * 1024 * 1024; // 100MB per file — generous headroom above any realistic full-res JPEG
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  // Checked up front, before handing out a token — handleUpload's own
  // callback runs per-upload-request, but we want zero tokens issued to
  // anyone without an admin session, full stop.
  if (rejectIfNotAdmin(req, res)) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Missing BLOB_READ_WRITE_TOKEN — add the Blob storage integration in Vercel.");
    return res.status(500).json({ ok: false, error: "File storage is not configured yet." });
  }

  try {
    // No onUploadCompleted — we don't rely on Vercel's post-upload webhook
    // for anything. js/admin.js writes the new photo into the gallery
    // record itself, in the same request, right after upload() resolves.
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
      }),
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error("Gallery upload token error:", err);
    return res.status(400).json({ ok: false, error: err.message || "Upload failed." });
  }
};
