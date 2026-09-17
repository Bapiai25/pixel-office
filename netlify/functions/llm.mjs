import { json, corsHeaders, clientIp, rateLimit, liveData, dataBlock, askProvider, HOUSE_RULES } from "./_lib.mjs";

/* Server-side desk answer: the owner's key pays, the visitor needs no key.
   Rate limited per IP. Never echoes the key. */
export default async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "POST only" }, origin);

  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const configured = !!(provider && (provider === "pollinations" || process.env.LLM_API_KEY));
  if (!configured) return json(503, { error: "server AI not configured" }, origin);

  const limit = rateLimit(clientIp(req), {
    perHour: Number(process.env.RATE_PER_HOUR || 30),
    perDay: Number(process.env.RATE_PER_DAY || 120),
  });
  if (!limit.ok) return json(429, { error: limit.reason, retryAfter: limit.retryAfter }, origin);

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid JSON" }, origin); }
  const question = String(body.question || "").slice(0, 800).trim();
  const desk = String(body.desk || "Market Intelligence").slice(0, 60);
  const role = String(body.role || "").slice(0, 120);
  const kind = String(body.kind || "market").slice(0, 30);
  const notes = String(body.notes || "").slice(0, 400);
  if (question.length < 2) return json(400, { error: "question too short" }, origin);

  const symbols = Array.isArray(body.symbols) ? body.symbols.filter(s => /^[A-Z]{2,6}$/.test(s)).slice(0, 6) : ["BTC", "ETH", "SOL"];
  const data = await liveData(symbols);

  const system = `${HOUSE_RULES}\n\nYOU ARE: the ${desk} desk${role ? " (" + role + ")" : ""}. Task classification: ${kind}.`;
  const user = `Desk question: ${question}${notes ? "\n\nContext from the floor: " + notes : ""}\n\n${dataBlock(data)}`;

  try {
    const answer = await askProvider(system, user);
    return json(200, { answer, engine: provider, source: data.source, remaining: limit.remaining }, origin);
  } catch (e) {
    return json(502, { error: "provider call failed", detail: String(e.message).slice(0, 160) }, origin);
  }
};
