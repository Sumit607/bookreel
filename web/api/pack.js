// GET ?id=<book> → a private book pack, only for browsers holding the passcode cookie.
const { token, safeEqual, cookies, send } = require("./_lib.js");
const PACKS = require("./_private/index.js");

module.exports = (req, res) => {
  const id = new URL(req.url, "http://localhost").searchParams.get("id") || "";
  const pack = Object.prototype.hasOwnProperty.call(PACKS, id) ? PACKS[id] : null;
  if (!pack) return send(res, 404, { error: "No such private book" });
  const secret = process.env.BOOKREEL_PASSCODE;
  if (!secret) return send(res, 503, { error: "Private books are not configured." });
  const key = cookies(req).br_key || "";
  if (!safeEqual(key, token(secret))) return send(res, 401, { error: "Passcode needed" });
  return send(res, 200, JSON.stringify(pack));
};
