// Node 22+: npm run agent (reads local secrets, prints only the resulting public trace/report).
const origin = process.env.APP_URL || "http://127.0.0.1:3000";
const response = await fetch(`${origin}/api/agent`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AGENT_API_TOKEN || ""}` },
  body: JSON.stringify({ runId: crypto.randomUUID(), ...(process.argv[2] ? { missionId: process.argv[2] } : {}), maxPriceTinybars: Number(process.env.AGENT_MAX_PER_PURCHASE_TINYBARS || 1000000), minConfidence: .8 }),
});
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
export {};
