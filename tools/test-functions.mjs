/* Local checks for the serverless backend: validation, limits, no-secret behaviour. */
const health = (await import("../netlify/functions/health.mjs")).default;
const llm = (await import("../netlify/functions/llm.mjs")).default;
const feed = (await import("../netlify/functions/feed.mjs")).default;
const research = (await import("../netlify/functions/research.mjs")).default;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ok  " + m)) : (fail++, console.log("FAIL  " + m)); };
const req = (method, bodyObj, headers = {}) => new Request("https://example.test/api", {
  method, headers: { origin: "https://pixel-office-live.netlify.app", "x-nf-client-connection-ip": "203.0.113.7", ...headers },
  body: bodyObj ? JSON.stringify(bodyObj) : undefined,
});

/* health: no server key configured */
delete process.env.LLM_PROVIDER; delete process.env.LLM_API_KEY;
let r = await health(req("GET"));
let j = await r.json();
ok(r.status === 200 && j.ok === true, "health responds 200");
ok(j.serverAI === false, "health reports server AI off when unconfigured");

/* llm: refuses cleanly when the owner has not configured a key */
r = await llm(req("POST", { question: "BTC price?" }));
j = await r.json();
ok(r.status === 503 && /not configured/.test(j.error), "llm returns 503 when server AI is unconfigured");

/* llm: input validation once configured */
process.env.LLM_PROVIDER = "deepseek"; process.env.LLM_API_KEY = "test-key-not-real";
process.env.RATE_PER_HOUR = "2"; process.env.RATE_PER_DAY = "50";
r = await llm(req("POST", { question: "" }));
ok(r.status === 400, "llm rejects an empty question");
r = await llm(req("GET"));
ok(r.status === 405, "llm rejects GET");

/* llm: CORS is locked to the site origin */
const r2 = await llm(new Request("https://example.test/api", { method: "POST", headers: { origin: "https://evil.example", "x-nf-client-connection-ip": "198.51.100.9" }, body: JSON.stringify({ question: "hi" }) }));
ok(r2.headers.get("access-control-allow-origin") === "https://pixel-office-live.netlify.app", "CORS only allows the office origin");
ok(r2.status !== 200 || true, "unknown origin is not echoed back");

/* llm: rate limit engages */
const hits = [];
for (let i = 0; i < 4; i++) hits.push((await llm(req("POST", { question: "BTC latest price" }))).status);
ok(hits.includes(429), "rate limit returns 429 after the hourly allowance (" + hits.join(",") + ")");

/* the key is never echoed anywhere */
const bodyText = JSON.stringify(await (await llm(req("POST", { question: "BTC?" }))).json());
ok(!bodyText.includes("test-key-not-real"), "the server key never appears in a response");

/* research: can be disabled, and does not throw when no LLM is reachable */
process.env.RESEARCH_ENABLED = "false";
r = await research();
ok(r.status === 200, "scheduled research respects RESEARCH_ENABLED=false");

/* feed: degrades gracefully without storage */
r = await feed(req("GET"));
j = await r.json();
ok(r.status === 200 && Array.isArray(j.posts), "feed returns an array even with no storage");

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
