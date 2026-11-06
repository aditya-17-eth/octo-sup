import { api, json, requireAgent } from "@/lib/http";
import { db } from "@/lib/db";
import { agentInputSchema, runAgent } from "@/lib/agent";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const POST = api(async request => { requireAgent(request); return Response.json({ run: await runAgent(await json(request, agentInputSchema)) }, { headers: { "Cache-Control": "private, no-store" } }); });
export const GET = api(async request => {
  requireAgent(request);
  const client = await db(), runs = await client.execute("SELECT * FROM agent_runs ORDER BY createdAt DESC LIMIT 30"), spent = await client.execute("SELECT COALESCE(SUM(amount),0) AS amount FROM agent_runs WHERE status IN ('RESERVED','UNKNOWN','SETTLED')");
  return Response.json({ runs: runs.rows, reservedOrSpentTinybars: Number(spent.rows[0].amount), budgetTinybars: Number(process.env.AGENT_TOTAL_BUDGET_TINYBARS || 10000000), perPurchaseCapTinybars: Number(process.env.AGENT_MAX_PER_PURCHASE_TINYBARS || 1000000) }, { headers: { "Cache-Control": "private, no-store" } });
});
