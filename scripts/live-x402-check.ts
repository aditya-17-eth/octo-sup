/** Real Hedera testnet HTTP x402 diagnostic. No human identity/evidence is asserted.
 * Sends 0.001 test HBAR to the configured merchant, within the normal signing cap.
 * Its receipt is saved separately from the marketplace mission/payment database.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { inspectHederaTransaction } from "@x402/hedera";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { signReportPayment } from "../src/lib/buyer";
const merchant = process.env.HEDERA_MERCHANT_ACCOUNT_ID;
if (!merchant || merchant === process.env.HEDERA_BUYER_ACCOUNT_ID)
  throw new Error("A distinct testnet merchant is required.");
const diagnosticId = randomUUID(),
  amount = "100000",
  url = "http://127.0.0.1:3017/payment-diagnostic";
const server = new x402ResourceServer(
  new HTTPFacilitatorClient({
    url: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
    timeoutMs: 60000,
  }),
);
server.register("hedera:testnet", new ExactHederaScheme());
await server.initialize();
const requirements = await server.buildPaymentRequirements({
  scheme: "exact",
  network: "hedera:testnet",
  payTo: merchant,
  price: { amount, asset: "0.0.0" },
  maxTimeoutSeconds: 120,
  extra: { missionId: diagnosticId, requiredMemo: `REALITY:${diagnosticId}` },
});
const required = await server.createPaymentRequiredResponse(requirements, {
  url,
  description:
    "Explicit payment-pipeline diagnostic; not human evidence, not a World verification, not a 0G assessment.",
  mimeType: "application/json",
});
const journal: Record<string, unknown> = {
  kind: "REAL_X402_DIAGNOSTIC_ONLY",
  diagnosticId,
  network: "hedera:testnet",
  merchant,
  amountTinybars: amount,
  status: "PREPARED",
  createdAt: new Date().toISOString(),
};
await mkdir("data/diagnostics", { recursive: true });
const file = `data/diagnostics/x402-${diagnosticId}.json`;
const save = () =>
  writeFile(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
await save();
let consumed = false;
const http = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  try {
    if (request.method !== "GET" || request.url !== "/payment-diagnostic") {
      response.writeHead(404).end("{}");
      return;
    }
    const header = request.headers["payment-signature"];
    if (typeof header !== "string") {
      response.setHeader(
        "PAYMENT-REQUIRED",
        encodePaymentRequiredHeader(required),
      );
      response.writeHead(402).end(JSON.stringify(required));
      return;
    }
    if (consumed) {
      response
        .writeHead(409)
        .end(
          JSON.stringify({
            error:
              "Diagnostic payment already attempted; do not sign another payment.",
          }),
        );
      return;
    }
    consumed = true;
    const payload = decodePaymentSignatureHeader(header);
    if (payload.resource?.url !== url) throw new Error("Resource mismatch");
    journal.signedPayload = payload;
    journal.transactionId = inspectHederaTransaction(
      String(payload.payload.transaction),
    ).transactionId;
    journal.status = "VERIFYING";
    await save();
    const verified = await server.verifyPayment(payload, requirements[0]);
    journal.verification = verified;
    await save();
    if (!verified.isValid) {
      journal.status = "REJECTED";
      await save();
      response
        .writeHead(402)
        .end(
          JSON.stringify({
            error: verified.invalidReason || "verification_failed",
          }),
        );
      return;
    }
    journal.status = "SETTLING";
    await save();
    const receipt = await server.settlePayment(payload, requirements[0]);
    journal.receipt = receipt;
    journal.status = receipt.success ? "SETTLED" : "FAILED";
    await save();
    if (!receipt.success) {
      response
        .writeHead(402)
        .end(
          JSON.stringify({
            error: receipt.errorReason || "settlement_failed",
            receipt,
          }),
        );
      return;
    }
    response.setHeader(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader(receipt),
    );
    response
      .writeHead(200)
      .end(
        JSON.stringify({
          diagnostic:
            "Actual autonomous x402 payment for a synthetic diagnostic resource only. No mission evidence or human verification is claimed.",
          payment: receipt,
        }),
      );
  } catch (e) {
    journal.status = "UNKNOWN";
    journal.failureClass = e instanceof Error ? e.name : "unknown";
    await save();
    response
      .writeHead(502)
      .end(
        JSON.stringify({
          error:
            "Diagnostic outcome requires reconciliation; no new payment will be signed automatically.",
        }),
      );
  }
});
await new Promise<void>((resolve, reject) => {
  http.once("error", reject);
  http.listen(3017, "127.0.0.1", resolve);
});
try {
  const first = await fetch(url);
  if (first.status !== 402 || !first.headers.get("payment-required"))
    throw new Error("Did not receive genuine HTTP 402 requirements.");
  const payload = await signReportPayment(
    decodePaymentRequiredHeader(first.headers.get("payment-required")!),
    diagnosticId,
  );
  const response = await fetch(url, {
    headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    signal: AbortSignal.timeout(150000),
  });
  const result = await response.json();
  console.log(
    JSON.stringify(
      {
        kind: journal.kind,
        initialHttpStatus: first.status,
        paidHttpStatus: response.status,
        status: journal.status,
        merchant,
        amountTinybars: amount,
        transactionId: journal.transactionId,
        payment: result.payment || result.receipt || null,
        error: result.error || null,
        hashscan: journal.transactionId
          ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(String(journal.transactionId))}`
          : null,
        note: "Diagnostic resource only; this does not complete the human-evidence marketplace flow.",
      },
      null,
      2,
    ),
  );
  if (!response.ok) process.exitCode = 1;
} finally {
  http.close();
}
