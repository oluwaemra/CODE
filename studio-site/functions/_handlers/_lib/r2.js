// Shared Cloudflare R2 client (R2 speaks the S3 API, so this uses the AWS
// SDK's S3 client pointed at R2's endpoint).
//
// Env vars (see api/README.md):
//   R2_ACCOUNT_ID          — Cloudflare account id
//   R2_ACCESS_KEY_ID       — R2 API token access key id
//   R2_SECRET_ACCESS_KEY   — R2 API token secret
//   R2_BUCKET_NAME         — bucket to read/write
//   R2_PUBLIC_BASE_URL     — public base URL for that bucket (an r2.dev
//                            subdomain, or a custom domain with public
//                            access enabled) — no trailing slash

const { AwsClient } = require("aws4fetch");

const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_BASE_URL"];

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// aws4fetch signs S3-style requests with Web Crypto, so it runs on
// Cloudflare Workers (the AWS SDK does not).
function getAws() {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(key) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${encoded}`;
}

// Presigned PUT URL the browser can upload to directly.
async function presignPut(key, contentType, expiresIn) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await getAws().sign(
    new Request(url, { method: "PUT", headers: { "Content-Type": contentType } }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

// Server-side PUT (used only by the small legacy /api/admin/upload path).
async function putObject(key, body, contentType) {
  const res = await getAws().fetch(objectUrl(key), { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
}

function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function publicUrlFor(key) {
  return `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}

module.exports = { presignPut, putObject, publicUrlFor, missingEnv, randomHex };
