# REALITY.EXE

**The physical world, as an API for AI.** A human observation marketplace for ETHGlobal Mumbai: mission-bound World ID claims, private camera evidence, 0G visual assessments, and autonomous Hedera testnet x402 purchases.

## Run locally

Node.js 22+, npm, and git. From the repository root:

```powershell
npm ci
npm run setup
npm run dev
```

Open http://127.0.0.1:3000. Use that exact origin; `APP_URL` controls same-origin protection and the canonical paid resource URL. Use HTTPS with a reachable phone URL for an actual mobile camera/World flow; update `APP_URL` and the World app’s allowed origins accordingly.

Local mission creation/browsing works without integration keys. Claims, inference and purchase **fail closed** when unconfigured. There is no mock-success switch, seed feed, fake balance or fabricated transaction in the application. Missing keys do not bypass protected actions.

Generate separate random values for `SESSION_SECRET` and `AGENT_API_TOKEN`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`npm run setup` creates `.env.local` from the example and fills missing session/operator secrets privately without printing them. It preserves nonempty values. Never paste private keys into mission text or chat. The app also supports an ignored persistent session key automatically in development; production requires an explicit secret.

## Configure the three live integrations

| Integration         | Exact requirement                                                                                                                                 | What proves it worked                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| World IDKit 4.x     | Developer app ID, RP ID, RP signing key, `claim-mission` action and allowed web origin, compatible Proof of Human credential or staging simulator | Backend `/api/v4/verify/{rp_id}` success in the expected environment, then atomic mission claim       |
| 0G Private Computer | Router API key with credits, image-capable model, provider compatible with requested trust mode                                                   | Actual returned JSON, response model and `x_0g_trace.request_id` persisted                            |
| Hedera x402         | Merchant account ID; separate funded testnet buyer account ID and private key; official/listed testnet facilitator                                | Successful matching facilitator settle receipt, transaction ID, HashScan and mirror-node confirmation |

Use [World’s developer portal](https://developer.world.org), [0G’s console](https://pc.0g.ai), and [Hedera’s portal](https://portal.hedera.com). The official facilitator `https://x402.org/facilitator` needs no API key and was observed advertising `hedera:testnet` on 2026-11-06. Capabilities are rediscovered at runtime, not assumed forever.

Live catalog/provider discovery found that `qwen2.5-vl-72b-instruct` accepts images but its advertised provider uses standard routing. The default is now `0gm-1.0-35b-a3b`, which advertises image input and a private provider. On 2026-11-06 that provider was listed as unhealthy; no healthy private or verified vision provider was advertised. **This blocks private visual inference until provider availability changes.** `npm run doctor` checks it explicitly. Keep `OG_TRUST_MODE=private`; there is no silent fallback to standard routing. The UI labels the requested mode, not an independently validated attestation.

`WORLD_ENVIRONMENT=staging` is a simulator and visibly labeled. Set `production` for real credentials. This project chooses the supported 4.0 Proof of Human credential and disables legacy proofs. Repeated claim requests are bound to a fresh nonce and signal; uniqueness is enforced per mission/action so the same eligible worker may do different missions.

## Minimal architecture

- Next.js App Router, strict TypeScript, Tailwind 4, shadcn-compatible Radix button primitive.
- libSQL SQL transactions: SQLite file locally, Turso/libSQL URL + auth token in production.
- Signed HttpOnly session cookie authorizes browser mission ownership/claims; same-origin browser mutation guard.
- Sharp validates and re-encodes images, strips EXIF, limits dimensions/size. Private disk or S3 evidence storage; no public object URLs.
- 0G OpenAI-compatible HTTP adapter. Private raw responses and derived structured reports in SQL.
- `@x402/core` + `@x402/hedera` v2.30.0, Hiero SDK v2.90.1. A `ClientHederaSigner` uses the official SDK transfer construction plus an additional mission-bound transaction memo.
- Official IDKit/IDKit Core v4.6.0; backend RP signing and proof verification. Lockfile pins the full dependency graph.

No smart contract, escrow or payout claim is needed for the core purchase. The merchant receives purchase revenue. **Contributor payouts are not implemented.**

## Workflow and API

1. Create a mission at `/missions/new`, including observable criteria and a coarse public area.
2. Open its details, start World verification, and complete it in World App or the staging simulator. Cancellation/denial/expiry must leave the mission unclaimed.
3. The assigned worker writes the exact challenge on a physical object in the scene and captures a new camera photo. Consent is required. The server accepts the challenge once, before expiry.
4. Request 0G assessment. No missing/ambiguous challenge and no confidence below 0.8 is accepted as `VERIFIED`. A negative factual answer can still be verified if the scene sufficiently answers the question.
5. Open `/agent`, enter the operator API token, set price/confidence policy, and launch. Or run `npm run agent`. The agent discovers through HTTP, receives a real 402, signs server-side, and retries with `PAYMENT-SIGNATURE`.
6. Inspect the actual request ID, assessment, settlement transaction ID, HashScan link and history. Confirm the chain receipt independently:

```powershell
npm run doctor
npm run verify-settlement -- "0.0.ACCOUNT@SECONDS.NANOSECONDS"
```

The verifier reads the public testnet mirror node and prints consensus success, memo and transfers. Compare merchant credit and the mission memo against the ledger. Mirror indexing can lag; retry this read-only command after a few seconds if needed.

Public discovery: `GET /api/missions`, `GET /api/missions/:id`, `GET /api/activity`, `GET /api/status`. Owners can `PATCH /api/missions/:id` with title, question, area and priceTinybars while OPEN; edits invalidate pending claim requests and preserve expiry. Cancellation is a soft delete preserving the audit history. Public output excludes session IDs, nullifiers, proofs, signing keys, raw evidence, paid answer and raw model response. General area, mission brief, model, confidence, request ID, transaction receipt and operational events are public.

Paid resource: `GET /api/reports/:id`. No payment yields 402 with an SDK-built `PAYMENT-REQUIRED` header. A supplied `paid=true` or transaction ID cannot grant access. The exact signed transfer must verify and settle. Its signed memo is `REALITY:<missionId>`. Native HBAR asset is `0.0.0`; amounts are integer tinybars. The server checks and records a unique transaction ID before settlement. Successful same-payment retries recover the same report and receipt without a second settlement, including after sale expiry.

Operator-only: `POST /api/agent` (`runId` UUID, optional `missionId`, `maxPriceTinybars`, `minConfidence`), `GET /api/agent`, `POST /api/agent/recover` (`runId`). All require `Authorization: Bearer <AGENT_API_TOKEN>`. Reuse a run ID for idempotency. The total and per-purchase caps come from server configuration. The heuristic chooses confidence/price among reports with at least 150 seconds remaining; this is a simple disclosed value policy, not a learned economic model.

## State and failure semantics

```text
OPEN -> CLAIMED -> SUBMITTED -> UNDER_REVIEW -> VERIFIED -> PURCHASED
                                      \----> REJECTED
OPEN / CLAIMED -> CANCELLED
Active unpurchased states -> EXPIRED
UNDER_REVIEW -> SUBMITTED (provider failure/retry only)
```

Updates use revision compare-and-swap and SQL transactions. One claim can win a race. Expiry is enforced on reads and mutations; there is no scheduler dependency. Purchased receipts persist, but new purchases after expiry are disabled. A stale review can be retried after three minutes; no external network call holds a SQL write transaction.

A settled buyer transfer is **not** a contributor payout. Settlement timeouts are `UNKNOWN` and keep the agent budget reserved. The recovery endpoint only retries saved signed bytes. It never signs a new payment. If the facilitator outcome itself is unknown or the process crashed after settlement but before recording the receipt, keep access locked and reconcile against the mirror node and facilitator logs. This version deliberately has no API that lets an operator or client type a transaction ID to mark a report paid. Do not delete unknown reservations to “fix” a demo.

## Verification

```powershell
npm test
npm run typecheck
npm run build
# Against a running local server; creates and cancels a clearly labeled QA mission:
npm run smoke
```

The protocol suite uses an isolated temporary database, ephemeral signing keys, real x402 serialization and Hiero transfer construction, and explicitly mocked external HTTP responses. It covers transitions, competing claims, expiration, private response filtering, World signal/environment binding, image sanitization, 0G output validation, 402 requirements, transaction-ID bypass, failed verification/settlement, signed mission binding, replay, receipt recovery, autonomous purchase, and durable spending reservations. **Passing fixtures do not prove live sponsor integrations.** No fixture is available as an application mode.

The current Windows host had a Turbopack CSS-worker failure; `dev` and `build` intentionally use webpack. A compatible `ws` override removes the SDK tree’s transitive vulnerability; keep the lockfile and re-audit on dependency updates.

## Deploy

Recommended: Docker on a Node host with a persistent volume. A Dockerfile and Render blueprint are included. Set a canonical HTTPS `APP_URL`, random `SESSION_SECRET`, integration secrets, and durable storage before deployment. The container runs as the unprivileged `node` user. Mount `/app/data`; local SQLite and evidence use this path. Do not horizontally scale file SQLite or use an ephemeral serverless filesystem.

For Vercel: set `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN`, `EVIDENCE_DRIVER=s3` and private bucket credentials, stable session secret, and route duration allowances up to 300 seconds. Ingress must accept a 6 MB image; a proxy with a smaller body limit needs direct private presigned uploads (not implemented). Never expose a bucket through a public website/CDN. The database initialization is idempotent for this schema; schema upgrades require a deliberate migration and backup rather than ad hoc column edits.

Production hardening still needed: ingress/IP abuse controls, operator access control and key rotation, storage encryption/backup policy, automated evidence/raw-response retention, monitoring and settlement reconciliation, multi-tenant wallet authorization, and refunds/payouts. The existing rate limits are per-session and do not prevent session churn.

## Trust boundaries

World checks human eligibility, not honesty. Visual inference is assessed evidence, not cryptographic liveness/location proof. Physical challenges reduce basic replay but cannot prevent sophisticated fabrication. Exact locations are not requested; JPEG metadata is stripped. Creator and worker may access their mission’s private image; buyers receive only a derived report. 0G routing mode describes the requested provider policy, not a locally checked hardware attestation. Evidence and raw model responses remain in private storage until an operator applies a retention policy.

See [docs/DEMO.md](docs/DEMO.md) for the under-three-minute recording plan and [docs/INTEGRATION_DEBRIEF.md](docs/INTEGRATION_DEBRIEF.md) for the honest sponsor-validation checklist.

## Official sources

- https://ethglobal.com/events/mumbai/prizes
- https://docs.hedera.com/solutions/ai/x402/merchant-integration
- https://docs.hedera.com/solutions/ai/x402/pay-with-x402
- https://docs.hedera.com/solutions/ai/x402/facilitators
- https://docs.hedera.com/solutions/ai/x402/exact-scheme
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/image-inputs
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/chat-completions
- https://docs.world.org/world-id/idkit/integrate
