import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { inspectHederaTransaction, Transaction } from "@x402/hedera";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { createHash } from "node:crypto";
import { db, event, expireMissions, mission, transition } from "./db";
import { HttpError } from "./http";
export function reportUrl(id: string) { return `${(process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/reports/${id}`; }
export function reportMemo(id: string) { return `REALITY:${id}`; }
let initialized: Promise<x402ResourceServer> | undefined;
async function resourceServer() {
  if (!initialized) initialized = (async () => {
    const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator", timeoutMs: 60000 }));
    server.register("hedera:testnet", new ExactHederaScheme());
    await server.initialize();
    return server;
  })().catch(e => { initialized = undefined; throw e; });
  try { return await initialized; } catch { throw new HttpError(503, "Facilitator discovery failed. Confirm the selected facilitator currently supports Hedera testnet."); }
}
function paidReport(row: Record<string, unknown>, missionId: string) {
  return { missionId, assessment: JSON.parse(String(row.assessment)), model: row.model, requestId: row.requestId, requestedTrustMode: row.trustMode, assessedAt: row.createdAt,
    limitations: ["World ID checks human eligibility, not honesty.", "AI assessment does not prove liveness, capture time, or location.", "A challenge reduces basic replay; sophisticated forgery remains possible.", "No contributor payout has been made by this purchase."] };
}
export async function protectedReport(request: Request, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Report not found.");
  const client = await db();
  await expireMissions();
  const m = await mission(id);
  if (!m || !["VERIFIED", "PURCHASED"].includes(m.state)) throw new HttpError(409, "No purchasable verified report exists for this mission.");
  if (m.expiresAt <= Date.now()) throw new HttpError(410, "The report is no longer fresh enough to sell.");
  const stored = await client.execute({ sql: "SELECT * FROM reports WHERE missionId=? AND decision='VERIFIED'", args: [id] });
  if (!stored.rows[0]) throw new HttpError(404, "Report not found.");
  const merchant = process.env.HEDERA_MERCHANT_ACCOUNT_ID;
  if (!merchant || !/^0\.0\.\d+$/.test(merchant)) throw new HttpError(503, "Set a valid HEDERA_MERCHANT_ACCOUNT_ID to enable x402. Report remains locked.");
  const server = await resourceServer();
  const requirements = await server.buildPaymentRequirements({ scheme: "exact", network: "hedera:testnet", payTo: merchant,
    price: { amount: String(m.priceTinybars), asset: "0.0.0" }, maxTimeoutSeconds: 120,
    extra: { missionId: id, requiredMemo: reportMemo(id) },
  });
  const resource = { url: reportUrl(id), description: "REALITY.EXE assessed observation report. A mission-specific signed transaction memo is required.", mimeType: "application/json" };
  const signature = request.headers.get("payment-signature");
  const headers: Record<string, string> = { "Cache-Control": "private, no-store", "Vary": "PAYMENT-SIGNATURE" };
  async function paymentRequired(error?: string) {
    const body = await server.createPaymentRequiredResponse(requirements, resource, error);
    return Response.json(body, { status: 402, headers: { ...headers, "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body) } });
  }
  if (!signature) return paymentRequired();
  if (signature.length > 65536) throw new HttpError(400, "Payment signature exceeds the size limit.");
  let payload: PaymentPayload, transactionId: string, digest: string, payloadHash: string;
  try {
    payload = decodePaymentSignatureHeader(signature);
    if (payload.x402Version !== 2 || payload.resource?.url !== resource.url) return paymentRequired("Resource mismatch");
    const accepted = payload.accepted, expected = requirements[0];
    if (accepted.scheme !== "exact" || accepted.network !== "hedera:testnet" || accepted.asset !== "0.0.0" || accepted.amount !== expected.amount || accepted.payTo !== expected.payTo || accepted.extra?.feePayer !== expected.extra?.feePayer) return paymentRequired("Payment requirements mismatch");
    const rawTx = payload.payload.transaction;
    if (typeof rawTx !== "string") return paymentRequired("Missing Hedera transaction");
    const inspected = inspectHederaTransaction(rawTx);
    const tx = Transaction.fromBytes(Buffer.from(rawTx, "base64"));
    if (tx.transactionMemo !== reportMemo(id)) return paymentRequired("Signed transaction memo must bind this mission");
    transactionId = inspected.transactionId;
    digest = createHash("sha256").update(transactionId).digest("hex");
    payloadHash = createHash("sha256").update(rawTx).digest("hex");
  } catch { return paymentRequired("Malformed Hedera payment"); }
  const existing = await client.execute({ sql: "SELECT * FROM payments WHERE digest=?", args: [digest] });
  if (existing.rows[0]) {
    const p = existing.rows[0];
    if (p.missionId !== id) throw new HttpError(409, "This Hedera transaction is already bound to another mission.");
    if (p.status === "SETTLED") {
      // Recover only with the exact signed bytes that previously verified and settled.
      if (p.payloadHash !== payloadHash!) return paymentRequired("Signed payment does not match the settled authorization");
      const receipt = JSON.parse(String(p.receipt)) as SettleResponse;
      return Response.json({ ...paidReport(stored.rows[0], id), payment: receipt }, { headers: { ...headers, "PAYMENT-RESPONSE": encodePaymentResponseHeader(receipt) } });
    }
    throw new HttpError(409, "This payment is already processing or needs reconciliation. Do not create a second payment.");
  }
  let verification;
  try { verification = await server.verifyPayment(payload!, requirements[0]); }
  catch { await event(client, id, "PAYMENT_VERIFY_FAILED", "Facilitator payment verification failed. Report remains locked."); return paymentRequired("Facilitator verification failed"); }
  if (!verification.isValid) {
    await event(client, id, "PAYMENT_REJECTED", "Facilitator rejected the signed payment. Report remains locked.", { reason: verification.invalidReason || "invalid_payment" });
    return paymentRequired(verification.invalidReason || "Invalid payment");
  }
  // UNIQUE digest + transaction ID is the concurrency/replay lock. Never hold a DB transaction during network calls.
  try { await client.execute({ sql: "INSERT INTO payments(digest,missionId,status,transactionId,payer,payloadHash,createdAt) VALUES(?,?,'PROCESSING',?,?,?,?)", args: [digest!, id, transactionId!, verification.payer || null, payloadHash!, Date.now()] }); }
  catch { throw new HttpError(409, "This transaction is already reserved. Retry the same signed request after it finishes."); }
  let receipt: SettleResponse;
  try { receipt = await server.settlePayment(payload!, requirements[0]); }
  catch {
    await client.execute({ sql: "UPDATE payments SET status='UNKNOWN' WHERE digest=?", args: [digest!] });
    await event(client, id, "PAYMENT_UNKNOWN", "Settlement response was lost. Report remains locked pending operator reconciliation.", { transactionId: transactionId! });
    throw new HttpError(502, "Settlement outcome is unknown. Do not pay again; reconcile the transaction on Hedera.");
  }
  if (!receipt.success || receipt.network !== "hedera:testnet" || receipt.transaction !== transactionId!) {
    await client.execute({ sql: "UPDATE payments SET status=?,receipt=? WHERE digest=?", args: [receipt.success ? "UNKNOWN" : "FAILED", JSON.stringify(receipt), digest!] });
    await event(client, id, "PAYMENT_FAILED", "Facilitator did not return a matching successful Hedera settlement. Report remains locked.", { reason: receipt.errorReason || "receipt_mismatch", transactionId: transactionId! });
    throw new HttpError(402, "Settlement failed or requires reconciliation. Report remains locked.");
  }
  const complete = await client.transaction("write");
  try {
    await complete.execute({ sql: "UPDATE payments SET status='SETTLED',receipt=?,payer=? WHERE digest=?", args: [JSON.stringify(receipt), receipt.payer || verification.payer || null, digest!] });
    const current = (await mission(id, complete))!;
    if (current.state === "VERIFIED" && current.expiresAt > Date.now()) await transition(complete, current, "PURCHASED");
    await event(complete, id, "X402_SETTLED", "Buyer purchase settled on Hedera testnet. This is not a contributor payout.", { transactionId: receipt.transaction, payer: receipt.payer, amount: m.priceTinybars });
    await complete.commit();
  } finally { complete.close(); }
  return Response.json({ ...paidReport(stored.rows[0], id), payment: receipt }, { headers: { ...headers, "PAYMENT-RESPONSE": encodePaymentResponseHeader(receipt) } });
}
