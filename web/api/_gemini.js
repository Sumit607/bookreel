// Minimal Gemini client for the free tier: picks the newest Flash / Flash-Lite model the key can use,
// asks for JSON, and turns rate limits into { status: 429, retryAfter } so the app can wait and retry.
// GEMINI_MOCK=1 (local tests only) returns canned output instead of calling Google.
const BASE = "https://generativelanguage.googleapis.com/v1beta";
let cache = { at: 0, models: null };

class GeminiError extends Error {
  constructor(message, status = 502, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function version(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/** The key as pasted into Vercel, forgiving spaces, line breaks, quotes or a "GEMINI_API_KEY=" prefix. */
function cleanKey(raw) {
  return String(raw || "").trim().replace(/^(export\s+)?[A-Z_]*KEY\s*=\s*/i, "").replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, "");
}

/** What Google said about a refused key (its message never contains the key), plus the key's shape. */
function keyProblem(text, key) {
  let msg = "", reason = "";
  try {
    const err = JSON.parse(text).error || {};
    msg = String(err.message || "").slice(0, 200);
    reason = ((err.details || []).find((d) => d.reason) || {}).reason || err.status || "";
  } catch (e) { msg = String(text || "").slice(0, 120); }
  const shape = /^AIza[\w-]{35}$/.test(key) ? "looks like a Gemini key" : `does not look like a Gemini key (${key.length} characters, should be 39 starting with AIza)`;
  return `Google rejected the Gemini API key: ${msg || "no reason given"}${reason ? ` [${reason}]` : ""}. The saved key ${shape}.`;
}

async function listModels(key) {
  if (cache.models && Date.now() - cache.at < 6 * 3600 * 1000) return cache.models;
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const problem = keyProblem(await res.text(), key);
    console.error("gemini key", res.status, problem);
    throw new GeminiError(problem, 424);
  }
  if (!res.ok) throw new GeminiError(`Gemini model list failed (${res.status})`, 502, 10);
  const data = await res.json();
  cache = { at: Date.now(), models: data.models || [] };
  return cache.models;
}

/** Newest usable Flash ("flash") or Flash-Lite ("lite") model; stable releases beat previews. */
async function pickModel(kind, key) {
  const models = (await listModels(key)).filter((m) => {
    const n = m.name || "";
    return /^models\/gemini-\d/.test(n) && /flash/.test(n) && (m.supportedGenerationMethods || []).includes("generateContent")
      && !/(image|tts|audio|live|embedding|exp|8b|thinking)/.test(n);
  });
  const want = models.filter((m) => (kind === "lite") === /lite/.test(m.name));
  const pool = want.length ? want : models;
  if (!pool.length) throw new GeminiError("No Gemini Flash model is available for this key.", 502);
  pool.sort((a, b) => version(b.name) - version(a.name) || /preview/.test(a.name) - /preview/.test(b.name) || a.name.length - b.name.length);
  return pool[0].name.replace(/^models\//, "");
}

function retrySeconds(body) {
  try {
    const details = (JSON.parse(body).error || {}).details || [];
    const info = details.find((d) => String(d["@type"] || "").includes("RetryInfo"));
    if (info && info.retryDelay) return Math.ceil(parseFloat(info.retryDelay));
  } catch (e) { /* not JSON */ }
  return 30;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  throw new GeminiError("Gemini returned text that is not valid JSON.", 502);
}

/**
 * One JSON request. kind: "flash" | "lite". Returns { data, model, usage }.
 * Throws GeminiError with status 429 (+ retryAfter seconds) when the free quota says wait.
 */
async function generateJSON({ kind, system, prompt, schema, maxOutputTokens = 16384, temperature = 0.4, timeoutMs = 100000 }) {
  if (process.env.GEMINI_MOCK === "1") return require("./_mock.js").generate({ kind, system, prompt });
  const key = cleanKey(process.env.GEMINI_API_KEY);
  if (!key) throw new GeminiError("Conversion is not set up yet: the Gemini API key is missing.", 503);
  const model = await pickModel(kind, key);
  const body = (withSchema) => JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", ...(withSchema && schema ? { responseSchema: schema } : {}), temperature, maxOutputTokens },
  });
  for (const withSchema of [true, false]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res, text;
    try {
      res = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: body(withSchema),
      });
      text = await res.text();
    } catch (e) {
      throw new GeminiError(e.name === "AbortError" ? "Gemini took too long to answer." : "Could not reach Gemini.", 504, 5);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) throw new GeminiError("The free Gemini quota needs a short break.", 429, retrySeconds(text));
    if (res.status === 503 || res.status === 500) throw new GeminiError("Gemini is busy right now.", 503, 20);
    if (res.status === 400 && withSchema && /schema/i.test(text)) continue; // retry once without the schema
    if (!res.ok) throw new GeminiError(`Gemini error ${res.status}: ${text.slice(0, 200)}`, 502);
    const data = JSON.parse(text);
    const cand = (data.candidates || [])[0] || {};
    const out = ((cand.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (!out) throw new GeminiError(`Gemini returned nothing (${cand.finishReason || "no reason given"}).`, 502, 5);
    return { data: parseJson(out), model, usage: data.usageMetadata || {} };
  }
  throw new GeminiError("Gemini rejected the request.", 502);
}

module.exports = { generateJSON, GeminiError, pickModel };
