import { json, corsHeaders } from "./_lib.mjs";
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders(req.headers.get("origin")) });
  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const configured = !!(provider && (provider === "pollinations" || process.env.LLM_API_KEY));
  return json(200, {
    ok: true,
    version: 1,
    serverAI: configured,
    provider: configured ? provider : null,
    model: process.env.LLM_MODEL || null,
    research: !!process.env.RESEARCH_ENABLED,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    limits: { perHour: Number(process.env.RATE_PER_HOUR || 30), perDay: Number(process.env.RATE_PER_DAY || 120) },
    note: configured
      ? "Server AI is available: the office can answer without the visitor supplying a key."
      : "Server AI is not configured. The app still works — visitors use the free keyless tier or their own key.",
  }, req.headers.get("origin"));
};
