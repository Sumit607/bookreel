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

/**
 * The models to try, best first: Flash models (newest, stable before preview), then Flash-Lite when allowed.
 * On the free tier each Flash model has its own small daily quota, so a used-up model just hands over to the next.
 */
async function ladder({ tier = "best", allowLite = false }, key) {
  if (process.env.GEMINI_MOCK === "1") return tier === "lite" ? ["mock-lite"] : ["mock-flash-2", "mock-flash-1", ...(allowLite ? ["mock-lite"] : [])];
  const models = (await listModels(key)).filter((m) => {
    const n = m.name || "";
    return /^models\/gemini-\d/.test(n) && /flash/.test(n) && (m.supportedGenerationMethods || []).includes("generateContent")
      && !/(image|tts|audio|live|embedding|exp|8b|thinking|computer)/.test(n);
  }).map((m) => m.name.replace(/^models\//, ""));
  const order = (list) => list.sort((a, b) => version(b) - version(a) || /preview/.test(a) - /preview/.test(b) || a.length - b.length);
  const flash = order(models.filter((n) => !/lite/.test(n)));
  const lite = order(models.filter((n) => /lite/.test(n)));
  const out = tier === "lite" ? lite : [...flash, ...(allowLite ? lite : [])];
  if (!out.length) throw new GeminiError("No Gemini Flash model is available for this key.", 502);
  return out;
}

/** Newest usable model of a kind ("flash" or "lite"). */
async function pickModel(kind, key) {
  return (await ladder({ tier: kind === "lite" ? "lite" : "best", allowLite: false }, key))[0];
}

/** Next midnight in California, when Google resets the free daily quotas (plus a minute). */
function quotaReset(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const into = (+parts.hour % 24) * 3600 + +parts.minute * 60 + +parts.second;
  return now + (86400 - into) * 1000 + 60000;
}

function retrySeconds(body) {
  try {
    const details = (JSON.parse(body).error || {}).details || [];
    const info = details.find((d) => String(d["@type"] || "").includes("RetryInfo"));
    if (info && info.retryDelay) return Math.ceil(parseFloat(info.retryDelay));
  } catch (e) { /* not JSON */ }
  return 30;
}

/** Which quotas a 429 names, with their limits, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier=20". */
function quotaIds(body) {
  try {
    const details = (JSON.parse(body).error || {}).details || [];
    const v = details.flatMap((d) => d.violations || []);
    return v.map((x) => `${x.quotaId || x.quotaMetric}${x.quotaValue ? `=${x.quotaValue}` : ""}`).join(", ") || body.slice(0, 200);
  } catch (e) { return String(body).slice(0, 200); }
}

/** A 429 that means "this model's quota for today is gone" rather than "slow down for a minute". */
function isDaily(body) {
  return /PerDay/i.test(body) || retrySeconds(body) > 3600;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  throw new GeminiError("Gemini returned text that is not valid JSON.", 502);
}

const lastCall = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Free tier: about 5 requests a minute for Flash, 10 for Flash-Lite. Space calls to one model out. */
async function pace(model) {
  const gap = /lite/.test(model) ? 6500 : 12500;
  const wait = (lastCall.get(model) || 0) + gap - Date.now();
  if (wait > 0 && process.env.GEMINI_MOCK !== "1") await sleep(wait);
  lastCall.set(model, Date.now());
}

async function callModel(model, key, { system, prompt, schema, maxOutputTokens, temperature, timeoutMs, thinking = "" }) {
  // thinking: "" leaves the model's default (MEDIUM on 3.x Flash); "low" makes it think less, so it answers sooner
  // and never spends the whole output budget on thinking. Lite models think minimally anyway.
  let think = /lite/.test(model) ? "" : thinking;
  const body = (withSchema) => JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", ...(withSchema && schema ? { responseSchema: schema } : {}), temperature, maxOutputTokens,
      ...(think ? { thinkingConfig: { thinkingLevel: think } } : {}) },
  });
  for (let withSchema = true, tries = 0; tries < 3; tries++) {
    await pace(model);
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
    if (res.status === 429) {
      const e = new GeminiError("The free Gemini quota needs a short break.", 429, retrySeconds(text));
      e.daily = isDaily(text);
      e.detail = quotaIds(text);
      console.error("gemini", model, 429, e.daily ? "daily" : "per-minute", e.detail);
      throw e;
    }
    if (res.status === 503 || res.status === 500) {
      const e = new GeminiError("Gemini is busy right now.", 503, 20);
      e.detail = text.slice(0, 300).replace(/\s+/g, " ");
      throw e;
    }
    if (res.status === 404) { const e = new GeminiError(`Model ${model} is not available.`, 404); e.skip = true; throw e; }
    if (res.status === 400 && think && /thinking/i.test(text)) { // a model that does not take this setting
      console.error("gemini", model, "refused thinkingLevel", think, text.slice(0, 160).replace(/\s+/g, " "));
      think = "";
      continue;
    }
    if (res.status === 400 && withSchema && schema && /schema/i.test(text)) { withSchema = false; continue; } // once without the schema
    if (!res.ok) throw new GeminiError(`Gemini error ${res.status}: ${text.slice(0, 200)}`, 502);
    const data = JSON.parse(text);
    const cand = (data.candidates || [])[0] || {};
    const out = ((cand.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    const usage = data.usageMetadata || {};
    if (!out) throw new GeminiError(`Gemini returned nothing (${cand.finishReason || "no reason given"}).`, 502, 5);
    try {
      return { data: parseJson(out), usage };
    } catch (e) {
      // Usually the answer was cut off: thinking and the JSON share the output budget.
      const why = `${cand.finishReason || "?"}, ${out.length} chars, ${usage.thoughtsTokenCount || 0} thinking tokens`;
      console.error("gemini", model, "bad JSON", why, JSON.stringify(out.slice(-160)));
      throw new GeminiError(`Gemini's answer was not complete JSON (${why}).`, 502, 5);
    }
  }
  throw new GeminiError("Gemini rejected the request.", 502);
}

/**
 * One JSON request down the model ladder. Returns { data, model, usage }.
 * quota: { exhausted: { model: untilMs }, mark(model, untilMs) } shared by every job, so a model whose daily
 * quota is gone is skipped until it resets. When every allowed model is used up, throws a 429 GeminiError with
 * daily = true and resetAt; a per-minute limit throws a 429 with retryAfter seconds.
 */
async function generateJSON({ tier = "best", allowLite = false, quota = null, kind, system, prompt, schema, maxOutputTokens = 16384, temperature = 0.4, timeoutMs = 100000, deadline = 0, rotate = 0, prefer = "", thinking = "" }) {
  if (kind) { tier = kind === "lite" ? "lite" : "best"; allowLite = allowLite || kind === "flash"; }
  const mock = process.env.GEMINI_MOCK === "1";
  const key = mock ? "mock" : cleanKey(process.env.GEMINI_API_KEY);
  if (!key) throw new GeminiError("Conversion is not set up yet: the Gemini API key is missing.", 503);
  const now = Date.now();
  let models = (await ladder({ tier, allowLite }, key)).filter((m) => !(quota && quota.exhausted && quota.exhausted[m] > now));
  // Start with the model that answered last time (it is evidently not overloaded), then the rest best first.
  if (prefer && models.includes(prefer)) models = [prefer, ...models.filter((m) => m !== prefer)];
  // After a "busy" answer the next try starts with the next model, so retries spread over the models' daily allowances.
  if (rotate && models.length > 1) models = [...models.slice(rotate % models.length), ...models.slice(0, rotate % models.length)];
  let busy = null;
  for (const model of models) {
    const left = deadline ? deadline - Date.now() - 5000 : Infinity;
    if (left < 30000) { busy = busy || new GeminiError("Gemini took too long to answer.", 504, 5); break; }
    try {
      const r = mock ? await require("./_mock.js").generate({ model, system, prompt }) : await callModel(model, key, { system, prompt, schema, maxOutputTokens, temperature, thinking, timeoutMs: Math.min(timeoutMs, left) });
      return { data: r.data, model, usage: r.usage || {} };
    } catch (e) {
      if (e.status === 429 && e.daily) { if (quota) await quota.mark(model, quotaReset()); continue; }
      if (e.skip) continue;
      // Overloaded or slow: the next model in the ladder may well answer.
      if (e.status === 503 || e.status === 500 || e.status === 504) {
        console.error("gemini", model, e.status, e.message, e.detail || "", `prompt ${prompt.length} chars`);
        // Refusals count against the small daily allowances (20 requests per model on the free tier), so a busy
        // model ends this try; the next try, a few minutes later, starts with another model.
        throw e;
      }
      throw e;
    }
  }
  if (busy) throw busy;
  const err = new GeminiError("Today's free Gemini quota for the better models is used up.", 429, Math.ceil((quotaReset() - Date.now()) / 1000));
  err.daily = true;
  err.resetAt = quotaReset();
  throw err;
}

module.exports = { generateJSON, GeminiError, pickModel, ladder, quotaReset, callModel, cleanKey };
