# Validation record — 2026-11-06

## Completed locally

- Production Next.js webpack build and strict TypeScript compilation.
- Isolated protocol/security suite: real SDK transfer construction and x402 serialization, mocked external HTTP services, separate temporary database, no real settlement/identity result claimed.
- HTTP smoke: strict creation validation, owner-only open-brief edit, unauthorized upload/cancel rejection, persistent cancellation history, operator authentication, paid-report boundary.
- Chrome desktop home and buyer console; mobile mission detail at approximately 390 px. No horizontal document overflow was observed. Missing World configuration left the mission OPEN and showed the exact configuration requirement. The clearly labeled local QA mission was cancelled.
- Dependency audit: zero findings after compatible ws override.
- Local configuration generated session/operator secrets privately; .env.local stays ignored.

## Read-only live checks

- Official x402 facilitator advertised v2 exact payments on hedera:testnet and fee payer 0.0.9185802.
- The provided Hedera buyer account was found on the testnet mirror node with ECDSA_SECP256K1 key type and a funded balance. This does **not** validate possession of its private key or establish a payment.
- 0G's catalog advertises 0gm-1.0-35b-a3b as text/image to text over OpenAI format. Its private provider was listed unhealthy. The healthy Qwen vision route advertised standard routing. No healthy private/verified vision route was advertised in the inspected public provider list.

## Still required for a real end-to-end demo

- Save the actual 0G inference API key, buyer signing key, and World RP signing key in the app's .env.local. Public IDs alone cannot sign or authenticate.
- Configure a merchant distinct from the buyer. A buyer-to-itself transfer is not meaningful purchase settlement.
- Resolve private vision provider availability with 0G, or explicitly authorize and label a non-sensitive standard-routing demo. No privacy downgrade is enabled automatically.
- Human completes a mission-bound World verification (or clearly labeled staging simulator), plus a cancellation/denial demonstration.
- Camera capture of consented evidence, actual 0G structured result/request ID, real facilitator settlement, and independent HashScan/mirror confirmation.
- Hosting is deferred by the user until the local end-to-end demo. Docker Desktop's Linux daemon was not running, so the Docker image was not built locally.

Screenshots in this folder's screenshots directory show local QA only; they are not proof of live sponsor integration success. No successful transaction ID or live inference request ID is invented in this record.
