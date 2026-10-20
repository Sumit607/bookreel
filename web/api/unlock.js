// POST { code } → sets an HttpOnly cookie that lets this browser load private book packs.
const { token, safeEqual, send, readJson, normalise } = require("./_lib.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" }, { Allow: "POST" });
  const secret = process.env.BOOKREEL_PASSCODE;
  if (!secret) return send(res, 503, { error: "Private books are not configured." });
  const body = await readJson(req);
  const code = normalise(body.code);
  if (!code || !safeEqual(code, normalise(secret))) {
    await new Promise((r) => setTimeout(r, 700));
    return send(res, 401, { error: "Wrong passcode" });
  }
  const secure = (req.headers["x-forwarded-proto"] || "https") === "https" ? "; Secure" : "";
  return send(res, 200, { ok: true }, {
    "Set-Cookie": `br_key=${token(secret)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
  });
};
