import { json, corsHeaders, blobStore } from "./_lib.mjs";

/* Recent server-side research, so a visitor who arrives later still sees the office working. */
export default async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders(origin) });
  const store = await blobStore("research");
  if (!store) return json(200, { posts: [], note: "storage unavailable" }, origin);
  try {
    const { blobs } = await store.list({ prefix: "post/" });
    const keys = blobs.map(b => b.key).sort().reverse().slice(0, 12);
    const posts = (await Promise.all(keys.map(async k => {
      const v = await store.get(k, { type: "json" });
      return v ? { ...v, key: k } : null;
    }))).filter(Boolean);
    return json(200, { posts }, origin);
  } catch (e) {
    return json(200, { posts: [], note: String(e.message).slice(0, 120) }, origin);
  }
};
