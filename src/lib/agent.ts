import { z } from "zod";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { db, event } from "./db";
import { HttpError } from "./http";
import { type PublicMission } from "./domain";
import { reportUrl } from "./payments";
import { signReportPayment } from "./buyer";
export const agentInputSchema = z.object({
  runId: z.string().uuid(), missionId: z.string().uuid().optional(),
  maxPriceTinybars: z.number().int().positive().max(100000000).default(1000000),
  minConfidence: z.number().min(.8).max(1).default(.8),
}).strict();
type AgentInput = z.infer<typeof agentInputSchema>;
export type TraceLine = { at: number; message: string };
export async function runAgent(input: AgentInput) {
  const client = await db();
  const existing = await client.execute({ sql: "SELECT id,missionId,status,amount,trace,receipt,report,createdAt,updatedAt FROM agent_runs WHERE id=?", args: [input.runId] });
  if (existing.rows[0]) return existing.rows[0];
  if (!process.env.HEDERA_BUYER_ACCOUNT_ID || !process.env.HEDERA_BUYER_PRIVATE_KEY) throw new HttpError(503, "Add HEDERA_BUYER_ACCOUNT_ID and HEDERA_BUYER_PRIVATE_KEY for a funded testnet wallet.");
  const trace: TraceLine[] = [];
  const log = (message: string) => trace.push({ at: Date.now(), message });
  log("Discovering missions through GET /api/missions.");
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
  const discovered = await fetch(`${origin}/api/missions`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!discovered.ok) throw new HttpError(502, "Mission discovery failed.");
  const data = await discovered.json() as { missions: PublicMission[] };
  const cap = Math.min(input.maxPriceTinybars, Number(process.env.AGENT_MAX_PER_PURCHASE_TINYBARS || 1000000));
  const candidates = data.missions.filter(m => ["VERIFIED", "PURCHASED"].includes(m.state) && m.expiresAt > Date.now() + 150000 && m.priceTinybars <= cap && m.assessment && m.assessment.confidence >= input.minConfidence && (!input.missionId || m.id === input.missionId));
  candidates.sort((a, b) => (b.assessment!.confidence / b.priceTinybars) - (a.assessment!.confidence / a.priceTinybars));
  const m = candidates[0];
  if (!m) throw new HttpError(409, "No fresh verified report meets the confidence threshold, price cap, and 150-second settlement window.");
  log(`Selected ${m.id}: confidence ${m.assessment!.confidence}; ${m.priceTinybars} tinybars. Value policy = confidence / price.`);
  const reserve = await client.transaction("write");
  try {
    const used = await reserve.execute("SELECT COALESCE(SUM(amount),0) AS spent FROM agent_runs WHERE status IN ('RESERVED','UNKNOWN','SETTLED')");
    const total = Number(process.env.AGENT_TOTAL_BUDGET_TINYBARS || 10000000);
    if (!Number.isSafeInteger(total) || total <= 0 || Number(used.rows[0].spent) + m.priceTinybars > total) throw new HttpError(409, "The durable agent spending budget is exhausted or invalid.");
    const prior = await reserve.execute({ sql: "SELECT id FROM agent_runs WHERE missionId=? AND status IN ('RESERVED','UNKNOWN','SETTLED')", args: [m.id] });
    if (prior.rows.length) throw new HttpError(409, "The buyer already purchased or reserved this mission. Open its existing trace.");
    log("Reserved amount against the persistent total budget.");
    await reserve.execute({ sql: "INSERT INTO agent_runs(id,missionId,status,amount,trace,createdAt,updatedAt) VALUES(?,?,'RESERVED',?,?,?,?)", args: [input.runId, m.id, m.priceTinybars, JSON.stringify(trace), Date.now(), Date.now()] });
    await reserve.commit();
  } finally { reserve.close(); }
  let submitted = false;
  try {
    const url = reportUrl(m.id);
    const unpaid = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(70000) });
    if (unpaid.status !== 402 || !unpaid.headers.get("payment-required")) throw new Error(`Expected HTTP 402 with PAYMENT-REQUIRED; received ${unpaid.status}.`);
    log("Received HTTP 402 Payment Required from the protected report endpoint.");
    const required = decodePaymentRequiredHeader(unpaid.headers.get("payment-required")!);
    const accepted = required.accepts.filter(r => r.scheme === "exact" && r.network === "hedera:testnet" && r.asset === "0.0.0" && r.payTo === process.env.HEDERA_MERCHANT_ACCOUNT_ID && r.amount === String(m.priceTinybars) && r.extra?.missionId === m.id);
    if (required.x402Version !== 2 || required.resource?.url !== url || accepted.length !== 1) throw new Error("Payment quote failed the agent's recipient, network, resource, or amount policy.");
    log("Quote matches merchant allowlist, exact HBAR price, mission, and testnet policy.");
    const payload = await signReportPayment({ ...required, accepts: accepted }, m.id);
    const signature = encodePaymentSignatureHeader(payload);
    // Stored privately before network submission so a lost response never causes a second signature.
    await client.execute({ sql: "INSERT INTO agent_payloads(runId,signature) VALUES(?,?)", args: [input.runId, signature] });
    log("Signed a real Hedera testnet transfer with a mission-bound memo. No human wallet approval.");
    await client.execute({ sql: "UPDATE agent_runs SET trace=?,updatedAt=? WHERE id=?", args: [JSON.stringify(trace), Date.now(), input.runId] });
    submitted = true;
    const paid = await fetch(url, { headers: { "PAYMENT-SIGNATURE": signature }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(150000) });
    const report = await paid.json();
    if (!paid.ok || !paid.headers.get("payment-response")) throw new Error(`Paid retry returned HTTP ${paid.status}; report receipt not accepted.`);
    const receipt = decodePaymentResponseHeader(paid.headers.get("payment-response")!);
    if (!receipt.success || receipt.network !== "hedera:testnet" || !receipt.transaction || report.missionId !== m.id) throw new Error("Missing or mismatched settlement receipt.");
    log(`Facilitator settled Hedera transaction ${receipt.transaction}. Report received.`);
    await client.execute({ sql: "UPDATE agent_runs SET status='SETTLED',trace=?,receipt=?,report=?,updatedAt=? WHERE id=?", args: [JSON.stringify(trace), JSON.stringify(receipt), JSON.stringify(report), Date.now(), input.runId] });
    await event(client, m.id, "AGENT_COMPLETED", "Autonomous buyer received the paid report after x402 settlement.", { transactionId: receipt.transaction, runId: input.runId });
  } catch (error) {
    const state = submitted ? "UNKNOWN" : "FAILED";
    log(error instanceof Error ? error.message : "Agent request failed.");
    if (submitted) log("Budget remains reserved. Inspect the transaction before retrying; no automatic second payment will be signed.");
    await client.execute({ sql: "UPDATE agent_runs SET status=?,trace=?,updatedAt=? WHERE id=?", args: [state, JSON.stringify(trace), Date.now(), input.runId] });
    await event(client, m.id, `AGENT_${state}`, submitted ? "Agent purchase needs reconciliation. Its spending reservation remains locked." : "Agent stopped before payment submission. No successful settlement claimed.", { runId: input.runId });
  }
  return (await client.execute({ sql: "SELECT * FROM agent_runs WHERE id=?", args: [input.runId] })).rows[0];
}
