import { json, corsHeaders } from "./_lib.mjs";
import { runResearch } from "./research.mjs";

/* Manual trigger for one research cycle (the schedule runs hourly on its own).
   Requires ADMIN_TOKEN — if it is not set, this endpoint refuses to run. */
export default async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders(origin) });
  const token = process.env.ADMIN_TOKEN || "";
  if (!token) return json(403, { error: "ADMIN_TOKEN is not set — use the hourly schedule instead" }, origin);
  const given = new URL(req.url).searchParams.get("token") || req.headers.get("x-admin-token") || "";
  if (given !== token) return json(401, { error: "bad token" }, origin);
  const result = await runResearch();
  return json(200, result, origin);
};
