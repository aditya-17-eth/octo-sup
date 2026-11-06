/** Isolated protocol fixtures. No call in this suite settles real funds or proves a real identity.
 * Fixture SQL is never used by the running application, and the file is removed after the suite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import sharp from "sharp";
import {
  PrivateKey,
  Transaction,
  inspectHederaTransaction,
} from "@x402/hedera";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import {
  db,
  expireMissions,
  mission,
  publicMission,
  transition,
} from "../src/lib/db";
import {
  assertTransition,
  createMissionSchema,
  type Mission,
} from "../src/lib/domain";
import { validateWorldBinding } from "../src/lib/world";
import { protectedReport, reportUrl } from "../src/lib/payments";
import { signReportPayment } from "../src/lib/buyer";
import { runAgent } from "../src/lib/agent";
import {
  storeEvidence,
  readEvidence,
  deleteEvidence,
} from "../src/lib/evidence";
import { assessEvidence } from "../src/lib/og";

const testDatabase = `data/test-${randomUUID()}.db`;
process.env.DATABASE_URL = `file:${testDatabase}`;
process.env.APP_URL = "http://127.0.0.1:3000";
process.env.X402_FACILITATOR_URL = "https://fixture.invalid/facilitator";
process.env.HEDERA_MERCHANT_ACCOUNT_ID = "0.0.1001";
process.env.HEDERA_BUYER_ACCOUNT_ID = "0.0.1002";
process.env.HEDERA_BUYER_PRIVATE_KEY =
  PrivateKey.generateED25519().toStringDer();
process.env.AGENT_MAX_PER_PURCHASE_TINYBARS = "1000000";
process.env.AGENT_TOTAL_BUDGET_TINYBARS = "100000";
process.env.OG_API_KEY = "fixture-only-not-real";
process.env.OG_BASE_URL = "https://fixture.invalid/v1";
process.env.OG_TRUST_MODE = "private";
process.env.EVIDENCE_DRIVER = "local";

async function seed(state = "VERIFIED", price = 100000) {
  const id = randomUUID(),
    client = await db();
  await client.execute({
    sql: "INSERT INTO missions(id,title,question,area,priceTinybars,state,createdAt,expiresAt,owner,claimant,challenge,challengeExpiresAt,submittedAt,worldEnvironment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      id,
      "Fixture observation question?",
      "Assess this fixture image for protocol tests only.",
      "Fixture venue",
      price,
      state,
      Date.now(),
      Date.now() + 3600000,
      "owner-fixture",
      "worker-fixture",
      `${id.slice(0, 8)}-TEST`,
      Date.now() + 600000,
      Date.now(),
      "staging",
    ],
  });
  if (["VERIFIED", "PURCHASED"].includes(state))
    await client.execute({
      sql: "INSERT INTO reports(missionId,decision,confidence,model,requestId,trustMode,assessment,rawResponse,createdAt) VALUES(?,'VERIFIED',0.95,'fixture-model',?,'private',?,'{}',?)",
      args: [
        id,
        `fixture-${id}`,
        JSON.stringify({
          decision: "VERIFIED",
          confidence: 0.95,
          explanation: "Isolated fixture assessment only.",
          answer: "FIXTURE_ONLY",
          challengeVisible: true,
        }),
        Date.now(),
      ],
    });
  return (await mission(id))!;
}
test("REALITY.EXE security and protocol acceptance (isolated HTTP fixtures)", async (t) => {
  const originalFetch = globalThis.fetch;
  let allowVerify = true,
    allowSettle = true,
    settleCalls = 0,
    invalidJson = false,
    loseResponse = false;
  let discovery: Mission[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.endsWith("/supported"))
      return Response.json({
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "hedera:testnet",
            extra: { feePayer: "0.0.1003" },
          },
        ],
        extensions: [],
        signers: { "hedera:*": ["0.0.1003"] },
      });
    if (url.endsWith("/verify"))
      return Response.json({
        isValid: allowVerify,
        payer: "0.0.1002",
        ...(!allowVerify ? { invalidReason: "fixture_invalid_signature" } : {}),
      });
    if (url.endsWith("/settle")) {
      settleCalls++;
      const body = JSON.parse(String(init!.body));
      return Response.json({
        success: allowSettle,
        network: "hedera:testnet",
        payer: "0.0.1002",
        transaction: inspectHederaTransaction(
          body.paymentPayload.payload.transaction,
        ).transactionId,
        ...(!allowSettle
          ? { errorReason: "fixture_insufficient_balance" }
          : {}),
      });
    }
    if (url.endsWith("/chat/completions")) {
      const headers = new Headers(init?.headers),
        body = JSON.parse(String(init?.body));
      assert.equal(headers.get("x-0g-provider-trust-mode"), "private");
      assert.match(
        body.messages[1].content[1].image_url.url,
        /^data:image\/jpeg;base64,/,
      );
      return Response.json({
        id: "fixture-completion",
        model: "fixture-vision",
        choices: [
          {
            message: {
              content: invalidJson
                ? "not JSON"
                : JSON.stringify({
                    decision: "VERIFIED",
                    confidence: 0.97,
                    explanation: "Fixture model response for testing only.",
                    answer: "FIXTURE_ONLY",
                    challengeVisible: true,
                  }),
            },
          },
        ],
        x_0g_trace: { request_id: randomUUID() },
      });
    }
    if (url.endsWith("/api/missions"))
      return Response.json({
        missions: await Promise.all(discovery.map((m) => publicMission(m))),
      });
    if (url.includes("/api/reports/")) {
      const response = await protectedReport(
        new Request(url, init),
        url.split("/").at(-1)!,
      );
      if (loseResponse && new Headers(init?.headers).has("payment-signature"))
        throw new Error("Fixture lost response after settlement");
      return response;
    }
    throw new Error(`Unexpected external request in isolated test: ${url}`);
  }) as typeof fetch;
  try {
    await t.test(
      "strict validation and server-side transition guards reject shortcuts",
      () => {
        assert.throws(() =>
          createMissionSchema.parse({
            title: "Valid title question?",
            question: "Sufficient observation criteria",
            area: "Hall",
            priceTinybars: 1,
            durationMinutes: 60,
            state: "VERIFIED",
          }),
        );
        assert.throws(() => assertTransition("OPEN", "PURCHASED"));
        assert.throws(() => assertTransition("REJECTED", "VERIFIED"));
        assert.throws(() => assertTransition("CANCELLED", "CLAIMED"));
      },
    );
    await t.test("concurrent claim attempts have one winner", async () => {
      const m = await seed("OPEN");
      const attempts = await Promise.allSettled([
        transition(await db(), m, "CLAIMED", { claimant: "worker-a" }),
        transition(await db(), m, "CLAIMED", { claimant: "worker-b" }),
      ]);
      assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal((await mission(m.id))!.state, "CLAIMED");
    });
    await t.test(
      "expired mission cannot be claimed and has an expiration event",
      async () => {
        const m = await seed("OPEN");
        await (
          await db()
        ).execute({
          sql: "UPDATE missions SET expiresAt=? WHERE id=?",
          args: [Date.now() - 1, m.id],
        });
        await assert.rejects(transition(await db(), m, "CLAIMED"));
        await expireMissions();
        assert.equal((await mission(m.id))!.state, "EXPIRED");
      },
    );
    await t.test(
      "public mission omits challenge, identities, evidence keys and report answer",
      async () => {
        const m = await seed();
        const result = await publicMission(m);
        for (const field of [
          "owner",
          "claimant",
          "challenge",
          "evidenceKey",
          "evidenceHash",
          "rawResponse",
          "answer",
        ])
          assert.equal(field in result, false);
        assert.equal(
          (await publicMission(m, "worker-fixture")).challenge,
          m.challenge,
        );
      },
    );
    await t.test(
      "World proof must match mission signal, nonce, action and environment",
      () => {
        const binding = {
          nonce: "fixture-nonce",
          signal: "mission-session-request",
          action: "claim-mission",
          environment: "production",
        };
        const proof = {
          protocol_version: "4.0",
          nonce: binding.nonce,
          action: binding.action,
          environment: "production",
          responses: [
            {
              identifier: "proof_of_human",
              issuer_schema_id: 1,
              signal_hash: hashSignal(binding.signal),
              nullifier: "0x00FF",
              proof: ["1", "2", "3", "4", "5"],
              expires_at_min: Math.floor(Date.now() / 1000) + 600,
            },
          ],
        };
        assert.equal(validateWorldBinding(proof, binding).nullifier, "255");
        for (const change of [
          { nonce: "replay" },
          { signal: "another-mission" },
          { action: "another-action" },
          { environment: "staging" },
        ])
          assert.throws(() =>
            validateWorldBinding(proof, { ...binding, ...change }),
          );
        assert.throws(() =>
          validateWorldBinding(
            {
              ...proof,
              responses: [{ ...proof.responses[0], expires_at_min: 1 }],
            },
            binding,
          ),
        );
      },
    );
    await t.test(
      "evidence storage rejects SVG and re-encodes images without metadata",
      async () => {
        await assert.rejects(
          storeEvidence(
            new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" }),
          ),
        );
        const source = await sharp({
          create: { width: 32, height: 32, channels: 3, background: "#d5ff4f" },
        })
          .jpeg()
          .withMetadata()
          .toBuffer();
        const stored = await storeEvidence(
          new File([new Uint8Array(source)], "fixture.jpg", {
            type: "image/jpeg",
          }),
        );
        const metadata = await sharp(await readEvidence(stored.key)).metadata();
        assert.equal(metadata.exif, undefined);
        assert.equal(stored.hash.length, 64);
        const m = await seed("SUBMITTED");
        m.evidenceKey = stored.key;
        const assessed = await assessEvidence(m);
        assert.equal(assessed.model, "fixture-vision");
        assert.ok(assessed.requestId);
        assert.equal(assessed.trustMode, "private");
        invalidJson = true;
        await assert.rejects(assessEvidence(m), /invalid assessment JSON/);
        invalidJson = false;
        await deleteEvidence(stored.key);
      },
    );
    await t.test(
      "unpaid report returns genuine x402 v2 requirements without paid content",
      async () => {
        const m = await seed();
        const response = await protectedReport(
          new Request(reportUrl(m.id)),
          m.id,
        );
        assert.equal(response.status, 402);
        const required = decodePaymentRequiredHeader(
          response.headers.get("payment-required")!,
        );
        assert.equal(required.x402Version, 2);
        assert.equal(required.accepts[0].network, "hedera:testnet");
        assert.equal(required.accepts[0].asset, "0.0.0");
        assert.equal(required.accepts[0].extra?.feePayer, "0.0.1003");
        assert.equal((await response.text()).includes("FIXTURE_ONLY"), false);
      },
    );
    await t.test(
      "transaction ID and paid flag cannot unlock a report",
      async () => {
        const m = await seed();
        const r = await protectedReport(
          new Request(`${reportUrl(m.id)}?paid=true&transactionId=anything`, {
            headers: {
              "X-Payment-Status": "settled",
              "X-Transaction-ID": "anything",
            },
          }),
          m.id,
        );
        assert.equal(r.status, 402);
      },
    );
    await t.test("raw ECDSA key signs a mission-bound transfer", async () => {
      const original = process.env.HEDERA_BUYER_PRIVATE_KEY;
      const originalType = process.env.HEDERA_BUYER_KEY_TYPE;
      const key = PrivateKey.generateECDSA();
      process.env.HEDERA_BUYER_PRIVATE_KEY = key.toStringRaw();
      process.env.HEDERA_BUYER_KEY_TYPE = "ecdsa";
      try {
        const m = await seed();
        const unpaid = await protectedReport(
          new Request(reportUrl(m.id)),
          m.id,
        );
        const payload = await signReportPayment(
          decodePaymentRequiredHeader(unpaid.headers.get("payment-required")!),
          m.id,
        );
        const tx = Transaction.fromBytes(
          Buffer.from(String(payload.payload.transaction), "base64"),
        );
        assert.equal(tx.transactionMemo, `REALITY:${m.id}`);
        assert.ok(key.publicKey.verifyTransaction(tx));
      } finally {
        process.env.HEDERA_BUYER_PRIVATE_KEY = original;
        if (originalType === undefined)
          delete process.env.HEDERA_BUYER_KEY_TYPE;
        else process.env.HEDERA_BUYER_KEY_TYPE = originalType;
      }
    });
    async function signedRequest(m: Mission) {
      const initial = await protectedReport(new Request(reportUrl(m.id)), m.id);
      const required = decodePaymentRequiredHeader(
        initial.headers.get("payment-required")!,
      );
      const payload = await signReportPayment(required, m.id);
      return {
        payload,
        request: new Request(reportUrl(m.id), {
          headers: {
            "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload),
          },
        }),
      };
    }
    await t.test(
      "facilitator rejection never settles or releases a report",
      async () => {
        const m = await seed(),
          signed = await signedRequest(m),
          before = settleCalls;
        allowVerify = false;
        const r = await protectedReport(signed.request, m.id);
        allowVerify = true;
        assert.equal(r.status, 402);
        assert.equal(settleCalls, before);
        assert.equal((await mission(m.id))!.state, "VERIFIED");
      },
    );
    await t.test(
      "failed settlement never publishes purchase success",
      async () => {
        const m = await seed(),
          signed = await signedRequest(m);
        allowSettle = false;
        await assert.rejects(
          protectedReport(signed.request, m.id),
          /Settlement failed/,
        );
        allowSettle = true;
        assert.equal((await mission(m.id))!.state, "VERIFIED");
      },
    );
    await t.test(
      "successful protocol fixture settles once; retries return the same report receipt",
      async () => {
        const m = await seed(),
          signed = await signedRequest(m),
          before = settleCalls;
        const response = await protectedReport(signed.request, m.id);
        assert.equal(response.status, 200);
        assert.ok(response.headers.get("payment-response"));
        assert.equal((await response.json()).assessment.answer, "FIXTURE_ONLY");
        assert.equal((await mission(m.id))!.state, "PURCHASED");
        const repeat = await protectedReport(signed.request, m.id);
        assert.equal(repeat.status, 200);
        assert.equal(settleCalls, before + 1);
        await (
          await db()
        ).execute({
          sql: "UPDATE missions SET expiresAt=? WHERE id=?",
          args: [Date.now() - 1, m.id],
        });
        assert.equal(
          (await protectedReport(signed.request, m.id)).status,
          200,
          "Paid receipt remains recoverable after sale expiry",
        );
        const other = await seed();
        const altered = {
          ...signed.payload,
          resource: { ...signed.payload.resource!, url: reportUrl(other.id) },
        };
        const replay = await protectedReport(
          new Request(reportUrl(other.id), {
            headers: {
              "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(altered),
            },
          }),
          other.id,
        );
        assert.equal(replay.status, 402);
        assert.equal(settleCalls, before + 1);
      },
    );
    await t.test(
      "autonomous buyer executes discover / 402 / sign / retry with persistent idempotency and budget",
      async () => {
        const m = await seed();
        discovery = [m];
        const runId = randomUUID();
        const run = await runAgent({
          runId,
          maxPriceTinybars: 100000,
          minConfidence: 0.8,
        });
        assert.equal(run.status, "SETTLED");
        assert.equal(
          (
            await runAgent({
              runId,
              maxPriceTinybars: 100000,
              minConfidence: 0.8,
            })
          ).id,
          runId,
        );
        const other = await seed();
        discovery = [other];
        await assert.rejects(
          runAgent({
            runId: randomUUID(),
            maxPriceTinybars: 100000,
            minConfidence: 0.8,
          }),
          /budget/,
        );
      },
    );
    await t.test(
      "lost paid response locks budget and never signs a second transfer",
      async () => {
        process.env.AGENT_TOTAL_BUDGET_TINYBARS = "200000";
        const m = await seed();
        discovery = [m];
        loseResponse = true;
        const run = await runAgent({
          runId: randomUUID(),
          maxPriceTinybars: 100000,
          minConfidence: 0.8,
        });
        loseResponse = false;
        assert.equal(run.status, "UNKNOWN");
        const other = await seed();
        discovery = [other];
        await assert.rejects(
          runAgent({
            runId: randomUUID(),
            maxPriceTinybars: 100000,
            minConfidence: 0.8,
          }),
          /budget/,
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    (await db()).close();
    for (const suffix of ["", "-wal", "-shm"])
      await unlink(`${testDatabase}${suffix}`).catch(() => {});
  }
});
