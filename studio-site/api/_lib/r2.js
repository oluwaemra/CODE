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

const { S3Client } = require("@aws-sdk/client-s3");

const REQUIRED_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_BASE_URL"];

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

let client = null;
function getR2Client() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      // Newer SDK versions add flexible-checksum params (x-amz-checksum-*,
      // x-amz-sdk-checksum-algorithm) to presigned URLs by default. R2
      // rejects those, and its error response omits CORS headers, so the
      // browser reports it as a CORS failure instead of the real cause.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  return client;
}

function publicUrlFor(key) {
  return `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}

module.exports = { getR2Client, publicUrlFor, missingEnv };
