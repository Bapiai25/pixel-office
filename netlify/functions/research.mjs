import { liveData, dataBlock, askProvider, telegram, blobStore, HOUSE_RULES, esc } from "./_lib.mjs";

/* The office keeps researching with nobody watching: hourly, server-side.
   Publishes to Telegram and stores the post so the site can show it. */
export const config = { schedule: "@hourly" };

const ROTATION = [
  { desk: "Market Intelligence", ask: "Scan the tape: what changed and what is the regime?" },
  { desk: "Technical", ask: "Where is structure holding or breaking in the tracked set?" },
  { desk: "Portfolio Risk", ask: "What is the biggest risk in the majors right now, stated plainly?" },
  { desk: "Narrative", ask: "Which categories are attracting capital, and what would make that overheated?" },
  { desk: "On-chain", ask: "What do BTC mempool conditions say about network demand?" },
  { desk: "Quant", ask: "What do volatility and correlation say about the current regime?" },
];

export async function runResearch() {
  if (String(process.env.RESEARCH_ENABLED || "").toLowerCase() === "false") {
    return { ok: false, reason: "research disabled" };
  }
  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const configured = !!(provider && (provider === "pollinations" || process.env.LLM_API_KEY));
  const slot = new Date().getUTCHours() % ROTATION.length;
  const job = ROTATION[slot];
  const data = await liveData(["BTC", "ETH", "SOL"]);

  let answer, engine = provider || "local";
  if (configured) {
    try {
      answer = await askProvider(`${HOUSE_RULES}\n\nYOU ARE: the ${job.desk} desk.`,
        `Desk question: ${job.ask}\n\n${dataBlock(data)}`);
    } catch (e) { answer = null; engine = "unavailable: " + String(e.message).slice(0, 80); }
  }
  if (!answer) {
    /* no LLM reachable — publish the honest data read instead of nothing */
    answer = [
      `DATA (${data.source}): ${data.prices.join(" · ") || "LIVE DATA UNAVAILABLE"}`,
      data.fng ? `SENTIMENT: Fear & Greed ${data.fng} (alternative.me)` : "SENTIMENT: LIVE DATA UNAVAILABLE",
      data.fees ? `ON-CHAIN: BTC mempool ${data.fees} (mempool.space)` : "ON-CHAIN: LIVE DATA UNAVAILABLE",
      data.categories.length ? `NARRATIVES: ${data.categories.join(", ")} (CoinGecko categories)` : "NARRATIVES: LIVE DATA UNAVAILABLE",
      "",
      "INTERPRETATION: a price-only read — I will not dress it up as more.",
      "SCORE: NO SCORE — this is a data snapshot, not a desk verdict.",
      "Research, not financial advice.",
    ].join("\n");
    engine = "local data read";
  }

  const at = new Date().toISOString();
  const post = { at, desk: job.desk, ask: job.ask, answer, engine, source: data.source };

  const store = await blobStore("research");
  if (store) { try { await store.setJSON(`post/${at}`, post); } catch {} }

  const sent = await telegram(`🏢 <b>Pixel Office · ${esc(job.desk)}</b>\n<i>${esc(job.ask)}</i>\n\n${esc(answer)}\n\n<i>${esc(data.source)} · ${esc(engine)} · ${at.slice(0, 16).replace("T", " ")} UTC</i>`);

  return { ok: true, desk: job.desk, engine, stored: !!store, telegram: sent, at };
}

export default async () => {
  const r = await runResearch();
  return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
};
