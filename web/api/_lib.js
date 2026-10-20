// Shared helpers for the private-book gate. The passcode lives only in the BOOKREEL_PASSCODE environment variable.
const crypto = require("crypto");

const normalise = (s) => String(s || "").trim().toLowerCase();

/** Cookie value proving the passcode was entered; changes whenever the passcode changes. */
function token(secret) {
  return crypto.createHmac("sha256", normalise(secret)).update("bookreel-private-v1").digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { return {}; }
}

module.exports = { token, safeEqual, cookies, send, readJson, normalise };
