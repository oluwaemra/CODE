// ==========================================================
// POST /api/contact
//
// Vercel serverless function (Node 18+ runtime — no dependencies needed,
// `fetch` is global). Validates the inquiry form submission server-side,
// applies a couple of lightweight spam defenses, then sends the message
// on via Resend (https://resend.com).
//
// Required environment variables (set in Vercel project settings, or in
// a local .env when running `vercel dev` — see .env.example):
//   RESEND_API_KEY    — from resend.com/api-keys
//   CONTACT_TO_EMAIL   — the studio inbox that should receive inquiries
//   CONTACT_FROM_EMAIL — a sender address on a domain verified in Resend
//                        (Resend will not send from an unverified domain)
// ==========================================================

const REQUIRED_FIELDS = ["fullName", "email", "projectType", "message"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 2000;

// Best-effort in-memory rate limit. This resets on cold start and is
// per-instance, not global — it stops a casual bot hammering the form,
// nothing more. For real abuse protection, put this behind Upstash
// Ratelimit, Vercel's Attack Challenge Mode, or similar.
const hits = new Map();
const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const record = hits.get(ip);
  if (!record || now - record.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT;
}

function validate(body) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`Missing required field: ${field}`);
    } else if (value.length > MAX_FIELD_LENGTH) {
      errors.push(`Field too long: ${field}`);
    }
  }

  if (body.email && !EMAIL_RE.test(body.email)) {
    errors.push("Invalid email address");
  }

  return errors;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests — please try again later." });
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

  // Honeypot: a hidden field real visitors never fill in. If it has a
  // value, silently report success without sending anything — this
  // wastes the bot's time instead of teaching it the field is fake.
  if (body.companyWebsite) {
    return res.status(200).json({ ok: true });
  }

  const errors = validate(body);
  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors.join("; ") });
  }

  const { fullName, email, phone, projectType, date, message } = body;

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !toEmail || !fromEmail) {
    console.error("Missing RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL env vars");
    return res.status(500).json({ ok: false, error: "Server is not configured to send email yet." });
  }

  const summaryRows = [
    ["Name", fullName],
    ["Email", email],
    ["Phone", phone || "—"],
    ["Project type", projectType],
    ["Preferred date", date || "—"],
  ];

  const html = `
    <h2 style="font-family:sans-serif">New inquiry — Emrashotit Studios</h2>
    <table style="font-family:sans-serif;border-collapse:collapse">
      ${summaryRows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(label)}</td>
          <td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td>
        </tr>`
        )
        .join("")}
    </table>
    <p style="font-family:sans-serif;white-space:pre-wrap;margin-top:16px">${escapeHtml(message)}</p>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        reply_to: email,
        subject: `New inquiry from ${fullName} — ${projectType}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error("Resend API error:", resendRes.status, errBody);
      return res.status(502).json({ ok: false, error: "Failed to send email." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Unexpected error sending contact email:", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error." });
  }
};
