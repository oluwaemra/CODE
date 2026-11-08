// ==========================================================
// Cloudflare Pages Functions entry point for every /api/* request.
//
// The handlers in functions/_handlers/ were written for Vercel's Node
// (req, res) style. Rather than rewrite each one, this adapter builds a
// small req/res look-alike, runs the matching handler, and turns what it
// wrote into a standard Response. Handlers live outside functions/api/ on
// purpose so Pages doesn't treat each as its own route.
// ==========================================================

const routes = {
  "admin-login": () => require("../_handlers/admin-login"),
  "admin-logout": () => require("../_handlers/admin-logout"),
  "admin-session": () => require("../_handlers/admin-session"),
  contact: () => require("../_handlers/contact"),
  "gallery-login": () => require("../_handlers/gallery-login"),
  "gallery-logout": () => require("../_handlers/gallery-logout"),
  "gallery-photos": () => require("../_handlers/gallery-photos"),
  portfolio: () => require("../_handlers/portfolio"),
  "admin/galleries": () => require("../_handlers/admin/galleries"),
  "admin/gallery-upload-token": () => require("../_handlers/admin/gallery-upload-token"),
  "admin/portfolio": () => require("../_handlers/admin/portfolio"),
  "admin/upload": () => require("../_handlers/admin/upload"),
};

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function buildReq(request, url) {
  const headers = {};
  request.headers.forEach((value, key) => { headers[key] = value; });

  const query = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    const type = headers["content-type"] || "";
    if (type.includes("application/json")) {
      try { body = JSON.parse(text); } catch { body = text; } // handlers report bad JSON themselves
    } else {
      body = text;
    }
  }

  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    query,
    body,
    socket: { remoteAddress: headers["cf-connecting-ip"] },
  };
}

function buildRes() {
  const headers = new Headers();
  let statusCode = 200;
  let payload = null;
  const res = {
    headersSent: false,
    setHeader(name, value) {
      if (name.toLowerCase() === "set-cookie") headers.append(name, value);
      else headers.set(name, value);
    },
    status(code) { statusCode = code; return res; },
    json(obj) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      payload = JSON.stringify(obj);
      res.headersSent = true;
      return res;
    },
    end(text) { payload = text || ""; res.headersSent = true; return res; },
  };
  res.toResponse = () => new Response(payload, { status: statusCode, headers });
  return res;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  // Handlers read secrets from process.env (Vercel style).
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") process.env[key] = value;
  }

  const url = new URL(request.url);
  const name = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean).join("/");
  const load = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!load) return jsonResponse(404, { ok: false, error: "Not found" });

  const handler = load();
  const req = await buildReq(request, url);
  const res = buildRes();
  await handler(req, res);
  return res.toResponse();
}
