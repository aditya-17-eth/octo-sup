# Sponsor integration debrief

Status is deliberately separated from test fixtures. Fill live results after credentials and a human are available.

| Track                       | Implemented                                                                                                                                                                                  | Live validation pending                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Hedera / AI Agents That Pay | Core/hedera 2.30.0, official facilitator discovery, real SDK signed native-HBAR transfers, memo binding, verify/settle gate, autonomous price/value policy, budget ledger, HashScan receipts | Funded buyer/merchant configuration; real successful consensus transaction; compare merchant credit and memo on mirror node         |
| 0G / Private Computer       | Current Router image-input request, JSON schema, request/model receipt, private raw-response persistence, fail-closed trust mode                                                             | API key/credits; compatible private vision provider; actual successful image inference and persisted request ID                     |
| World / Best Use of IDKit   | IDKit 4.6.0, server RP signing, Proof of Human, mission/session signal and nonce, backend v4 verification, nullifier uniqueness, cancellation/denial                                         | Registered app/RP/action/origins; simulator or human completion; successful real backend result and meaningful cancelled/denied run |

## Time to first success

- Runnable app and production build: completed during implementation.
- Isolated protocol suite: completed, explicitly synthetic external service responses.
- Real Hedera x402 diagnostic settled successfully; exact public receipt is in [LIVE_RECEIPTS.md](LIVE_RECEIPTS.md). No elapsed integration time is fabricated.
- First live World proof and successful 0G visual response remain pending; no time-to-success claim is made for them.

## Friction observed

- Current IDKit is 4.x, so older v2/v3 widget and verifier examples are incompatible with the chosen flow.
- Current x402 spending controls do not treat native HBAR as an implicit allowed default asset; the client must explicitly allow `0.0.0` with an atomic spending cap.
- The standard HBAR transfer is not intrinsically bound to an HTTP mission. A custom signer interface adds a signed mission memo and the resource server enforces it.
- 0G model catalog vision capability and private provider availability are separate checks. A live catalog entry does not prove a private vision route exists.
- Windows Turbopack CSS workers failed; webpack builds succeed on this host.

## Highest-impact documentation improvement

A maintained end-to-end Next.js example covering current IDKit RP signing + mission signal verification, and a native-HBAR x402 client with explicit spending policy and lost-response recovery, would reduce integration ambiguity. For 0G, expose a directly queryable combined filter for model + image input + API format + private trust mode, alongside the exact receipt fields.

## Trust decision

Proof of Human is proportionate to assigning one worker a mission. The system does not need a name, passport, exact location, or an extra identity credential. It still treats the human’s evidence as untrusted and requires a separate visual assessment. Neither identity nor model assessment substitutes for payment settlement.
