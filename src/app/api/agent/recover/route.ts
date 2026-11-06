import { z } from "zod";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { db, event } from "@/lib/db";
import { api, HttpError, json, requireAgent } from "@/lib/http";
import { reportUrl } from "@/lib/payments";
export const maxDuration = 180;
export const POST = api(async (request) => {
  requireAgent(request);
  const body = await json(
      request,
      z.object({ runId: z.string().uuid() }).strict(),
    ),
    client = await db();
  const result = await client.execute({
      sql: "SELECT a.*,p.signature FROM agent_runs a JOIN agent_payloads p ON p.runId=a.id WHERE a.id=?",
      args: [body.runId],
    }),
    run = result.rows[0];
  if (!run)
    throw new HttpError(404, "No saved signed payment exists for this run.");
  if (run.status === "SETTLED") return Response.json({ status: "SETTLED" });
  if (run.status !== "UNKNOWN")
    throw new HttpError(
      409,
      "Only unresolved submitted payments can be recovered.",
    );
  const response = await fetch(reportUrl(String(run.missionId)), {
    headers: { "PAYMENT-SIGNATURE": String(run.signature) },
    redirect: "error",
    signal: AbortSignal.timeout(150000),
    cache: "no-store",
  });
  if (!response.ok || !response.headers.get("payment-response"))
    throw new HttpError(
      409,
      "No settled receipt could be recovered. Keep the reservation and reconcile the transaction; do not sign another payment.",
    );
  const receipt = decodePaymentResponseHeader(
      response.headers.get("payment-response")!,
    ),
    report = await response.json();
  if (
    !receipt.success ||
    receipt.network !== "hedera:testnet" ||
    report.missionId !== run.missionId
  )
    throw new HttpError(409, "Recovered receipt did not match the mission.");
  const trace = JSON.parse(String(run.trace));
  trace.push({
    at: Date.now(),
    message:
      "Recovered the original paid response using saved signed bytes. No new payment was signed.",
  });
  await client.execute({
    sql: "UPDATE agent_runs SET status='SETTLED',receipt=?,report=?,trace=?,updatedAt=? WHERE id=? AND status='UNKNOWN'",
    args: [
      JSON.stringify(receipt),
      JSON.stringify(report),
      JSON.stringify(trace),
      Date.now(),
      body.runId,
    ],
  });
  await event(
    client,
    String(run.missionId),
    "AGENT_RECOVERED",
    "Original settled report receipt recovered without a new payment.",
    { transactionId: receipt.transaction },
  );
  return Response.json({ status: "SETTLED" });
});
