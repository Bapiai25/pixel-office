/* Shared helpers for the Pixel Office serverless backend.
   Secrets come from environment variables only — never from the repo. */

export const HOUSE_RULES = `You are one desk in a pixel-art crypto research office. Non-negotiable house rules:
- Never invent a number. Every figure must come from the LIVE DATA block or you say LIVE DATA UNAVAILABLE.
- Separate FACT, DATA, INTERPRETATION and SPECULATION explicitly.
- Name what is missing from the feed instead of guessing it.
- No hype, no promises, no price targets. Never give financial advice.
- Finish with a score out of 100 for your desk (or "NO SCORE - insufficient data") and one line naming the biggest uncertainty.
- If you reason first, put the reasoning inside <thinking>...</thinking> then give the answer outside it.
- Keep the final answer under 1200 characters.`;

export const SITE_ORIGINS = [
  "https://pixel-office-live.netlify.app",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:8090",
  "http://localhost:8090",
];

export function corsHeaders(origin) {
  const allowed = !origin || SITE_ORIGINS.includes(origin) ? (origin || SITE_ORIGINS[0]) : SITE_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

export function clientIp(req) {
  return req.headers.get("x-nf-client-connection-ip")
    || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
}

/* best-effort rate limit: per warm instance, plus an optional shared daily counter */
const HITS = new Map();
export function rateLimit(ip, { perHour = 30, perDay = 120 } = {}) {
  const now = Date.now();
  const b = HITS.get(ip) || { hour: now, hourCount: 0, day: now, dayCount: 0 };
  if (now - b.hour > 3600e3) { b.hour = now; b.hourCount = 0; }
  if (now - b.day > 86400e3) { b.day = now; b.dayCount = 0; }
  b.hourCount++; b.dayCount++;
  HITS.set(ip, b);
  if (b.hourCount > perHour) return { ok: false, reason: "hourly limit reached", retryAfter: Math.ceil((b.hour + 3600e3 - now) / 1000) };
  if (b.dayCount > perDay) return { ok: false, reason: "daily limit reached", retryAfter: Math.ceil((b.day + 86400e3 - now) / 1000) };
  return { ok: true, remaining: perHour - b.hourCount };
}

export async function blobStore(name = "research") {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore(name);
  } catch { return null; }
}

const CG_IDS = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", BNB: "binancecoin", DOGE: "dogecoin" };

export async function liveData(symbols = ["BTC", "ETH", "SOL"]) {
  const ids = symbols.map(s => CG_IDS[s]).filter(Boolean).join(",");
  const out = { prices: [], fng: null, fees: null, categories: [], source: "unavailable" };
  const get = async (url) => { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  try {
    const rows = await get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`);
    out.prices = rows.map(r => `${r.symbol.toUpperCase()} $${r.current_price} (${(r.price_change_percentage_24h ?? 0).toFixed(2)}% 24h)`);
    out.source = "CoinGecko";
  } catch { /* leave unavailable */ }
  try { const j = await get("https://api.alternative.me/fng/?limit=1"); out.fng = `${j.data[0].value}/100 ${j.data[0].value_classification}`; } catch {}
  try { const j = await get("https://mempool.space/api/v1/fees/recommended"); out.fees = `${j.fastestFee} sat/vB fast`; } catch {}
  try {
    const cats = await get("https://api.coingecko.com/api/v3/coins/categories");
    out.categories = cats.filter(c => c.market_cap > 5e8).sort((a, b) => (b.market_cap_change_24h || 0) - (a.market_cap_change_24h || 0))
      .slice(0, 5).map(c => `${c.name} ${(c.market_cap_change_24h || 0).toFixed(1)}%`);
  } catch {}
  return out;
}

export function dataBlock(d) {
  const L = [`LIVE DATA (source ${d.source}):`];
  L.push(d.prices.length ? d.prices.map(p => "- " + p).join("\n") : "- PRICES: LIVE DATA UNAVAILABLE");
  L.push(d.fng ? `- Fear & Greed: ${d.fng} (alternative.me)` : "- Fear & Greed: LIVE DATA UNAVAILABLE");
  L.push(d.fees ? `- BTC mempool: ${d.fees} (mempool.space)` : "- BTC mempool: LIVE DATA UNAVAILABLE");
  L.push(d.categories.length ? `- Category moves 24h: ${d.categories.join(", ")} (CoinGecko)` : "- Categories: LIVE DATA UNAVAILABLE");
  L.push("- Not provided: order books, funding, open interest, unlocks, wallet labels, news. Say LIVE DATA UNAVAILABLE for those.");
  return L.join("\n");
}

export async function askProvider(system, user) {
  const provider = (process.env.LLM_PROVIDER || "pollinations").toLowerCase();
  const key = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || "";
  const msgs = [{ role: "system", content: system }, { role: "user", content: user }];
  const post = async (url, body, headers = {}) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${provider} ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return r.json();
  };
  if (provider === "pollinations") {
    const d = await post("https://text.pollinations.ai/openai", { model: model || "openai", messages: msgs });
    return d.choices?.[0]?.message?.content || "";
  }
  if (!key) throw new Error("server key not configured");
  if (provider === "deepseek") {
    const d = await post("https://api.deepseek.com/chat/completions", { model: model || "deepseek-chat", messages: msgs }, { authorization: "Bearer " + key });
    return d.choices?.[0]?.message?.content || "";
  }
  if (provider === "openai") {
    const d = await post("https://api.openai.com/v1/chat/completions", { model: model || "gpt-4o-mini", messages: msgs }, { authorization: "Bearer " + key });
    return d.choices?.[0]?.message?.content || "";
  }
  if (provider === "claude") {
    const d = await post("https://api.anthropic.com/v1/messages",
      { model: model || "claude-3-5-haiku-latest", max_tokens: 1200, system, messages: [{ role: "user", content: user }] },
      { "x-api-key": key, "anthropic-version": "2023-06-01" });
    return (d.content || []).map(b => b.text || "").join("");
  }
  throw new Error("unknown provider " + provider);
}

export async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

export const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
