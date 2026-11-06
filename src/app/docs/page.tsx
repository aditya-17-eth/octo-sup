import Link from "next/link";
export default function Docs() {
  return (
    <article className="page narrow docs">
      <div className="page-title">
        <div>
          <span className="eyebrow">Protocol reference / v0.1</span>
          <h1>
            Reality is an input.
            <br />
            Trust has boundaries.
          </h1>
          <p>How humans, visual models, and autonomous payments connect.</p>
        </div>
      </div>
      <div className="notice">
        Hackathon testnet software. Integration code is real; a configured key
        does not establish that an integration has succeeded. Only actual
        returned receipts appear in the mission timeline.
      </div>
      <h2>The request lifecycle</h2>
      <pre>{`OPEN → CLAIMED → SUBMITTED → UNDER_REVIEW\n                                ├ VERIFIED → PURCHASED\n                                └ REJECTED\n\nOPEN / CLAIMED → CANCELLED\nActive unpurchased missions → EXPIRED`}</pre>
      <p>
        A mission stays open while World verification is pending. The backend
        validates the proof before atomically assigning one worker. A fresh
        one-time challenge includes the mission ID and expires within ten
        minutes. Submitted images are re-encoded as JPEG to remove metadata and
        stored outside public assets.
      </p>
      <h2>Mission API</h2>
      <pre>{`GET    /api/missions\nPOST   /api/missions\nGET    /api/missions/:id\nDELETE /api/missions/:id\nPOST   /api/missions/:id/claim-request\nDELETE /api/missions/:id/claim-request\nPOST   /api/missions/:id/claim\nPOST   /api/missions/:id/evidence\nPOST   /api/missions/:id/review\nGET    /api/activity\nGET    /api/status`}</pre>
      <p>
        Browser mutations require a same-origin request. Creation returns an
        opaque signed HttpOnly session cookie, used to authorize cancellation
        and private evidence access. Mission creation accepts title, question,
        general area, integer priceTinybars, and durationMinutes. Limits:
        140-character title, 1,500-character question, 1 tinybar–1 HBAR price,
        10-minute–24-hour lifetime. No personal coordinates are collected.
      </p>
      <pre>
        {JSON.stringify(
          {
            title: "Is the Hedera booth currently staffed?",
            question:
              "Show the sign, staff area, and the physical challenge. Is a representative available?",
            area: "Sponsor hall",
            priceTinybars: 100000,
            durationMinutes: 60,
          },
          null,
          2,
        )}
      </pre>
      <h2>The paid report boundary</h2>
      <pre>{`GET /api/reports/:missionId\n\nHTTP/1.1 402 Payment Required\nPAYMENT-REQUIRED: <base64 x402 v2 requirements>\n\n// Agent constructs a Hedera HBAR TransferTransaction.\n// Exact amount; merchant allowlist; testnet only.\n// Signed memo: REALITY:<missionId>\n\nGET /api/reports/:missionId\nPAYMENT-SIGNATURE: <base64 signed x402 payload>\n\nHTTP/1.1 200 OK\nPAYMENT-RESPONSE: <base64 facilitator settlement receipt>`}</pre>
      <p>
        The resource server registers <code>ExactHederaScheme</code> from{" "}
        <code>@x402/hedera</code> with <code>@x402/core</code>. It discovers the
        facilitator’s current testnet fee payer, verifies signed transfer bytes,
        reserves the transaction ID in SQL, and calls settlement. Only a
        successful receipt matching the Hedera network and transaction unlocks
        the answer. The custom signed memo prevents redeeming a payment for a
        different mission.
      </p>
      <p>
        Default facilitator:{" "}
        <a
          href="https://x402.org/facilitator/supported"
          target="_blank"
          rel="noreferrer"
        >
          official x402 facilitator capability endpoint
        </a>
        . HBAR uses asset <code>0.0.0</code>, with 100,000,000 tinybars per
        HBAR. The fee payer sponsors network fees. No contract is needed.
      </p>
      <h2>Autonomous buyer</h2>
      <pre>{`# After configuring .env.local and starting the server:\nnpm run agent\n\n# Operator-authenticated endpoint:\nPOST /api/agent\nAuthorization: Bearer <AGENT_API_TOKEN>\nContent-Type: application/json\n\n{\n  "runId": "<new UUID; reuse for idempotency>",\n  "maxPriceTinybars": 1000000,\n  "minConfidence": 0.8\n}`}</pre>
      <p>
        The buyer discovers missions through HTTP, filters for verified
        evidence, confidence, price and freshness, then ranks eligible reports
        by confidence divided by price. It reserves a durable total budget
        before signing. Environment caps cannot be raised by a client. An
        operator token authorizes a run; there is no human wallet approval
        during the purchase exchange.
      </p>
      <p>
        Receipts and report responses in <code>GET /api/agent</code> require the
        operator token. An unresolved paid request keeps its spending
        reservation. The recovery endpoint <code>POST /api/agent/recover</code>{" "}
        accepts <code>{'{ "runId": "..." }'}</code> and retries the saved signed
        payment without signing a second transaction. Never manually change an
        unknown payment to paid.
      </p>
      <h2>0G evidence assessment</h2>
      <p>
        The server sends a base64 image to 0G’s current{" "}
        <a
          href="https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/image-inputs"
          target="_blank"
          rel="noreferrer"
        >
          OpenAI-compatible image-input API
        </a>
        . The selected vision model is configurable. The app persists{" "}
        <code>x_0g_trace.request_id</code>, the actual response model, the
        structured assessment, and the private raw provider response. Invalid
        JSON or a missing request ID fails closed.
      </p>
      <p>
        Private trust mode is requested by default. No compatible private vision
        provider means failure, not a silent fallback. Setting{" "}
        <code>OG_TRUST_MODE=verified</code> explicitly permits verified routing
        with provider-specific privacy; it does not establish hardware-isolated
        private inference. The app labels the requested trust mode and does not
        claim to independently verify attestation.
      </p>
      <h2>World’s trust moment</h2>
      <p>
        Proof of Human is the minimum credential chosen to prevent an unverified
        client from occupying a scarce mission claim. IDKit 4.x requests are
        signed on the backend, bound to a mission/session signal and a
        short-lived nonce, and validated through World’s backend API. Nullifiers
        are normalized to decimal strings and stored uniquely per mission and
        action. Proof blobs are never stored or returned publicly.
      </p>
      <p>
        <code>WORLD_ENVIRONMENT=staging</code> uses simulator credentials and is
        visibly labeled. Production requires a real configured RP and a
        compatible human credential. Cancelling, using an expired request,
        mismatching the signal, or receiving a denial prevents the protected
        claim.
      </p>
      <h2>What these receipts do—and don’t—establish</h2>
      <ul>
        <li>World verifies human eligibility and uniqueness, not honesty.</li>
        <li>
          Visual inference assesses submitted evidence; it cannot establish
          capture time, location, or liveness.
        </li>
        <li>
          A physical challenge reduces simple replay. It does not eliminate
          digital forgery or collusion.
        </li>
        <li>
          Model confidence is self-reported and is not a calibrated probability.
        </li>
        <li>
          Raw evidence stays restricted to creator and worker. A buyer pays for
          a derived report.
        </li>
        <li>
          The buyer’s transfer pays the merchant. Contributor payout is a
          separate, currently unimplemented transfer.
        </li>
      </ul>
      <h2>Operating limits</h2>
      <p>
        This build uses a shared operator buyer wallet for the hackathon. It is
        not a multi-tenant custody service. Anonymous creation has session-based
        limits, which can be bypassed by creating new sessions; deploy behind
        ingress rate limits and abuse controls before opening to the public. Use
        a persistent disk or Turso and private S3. Configure backups, access
        controls, retention and monitoring for real users.
      </p>
      <p>
        Privacy consent covers server storage and the selected 0G processing
        path. Images are retained until an operator applies a documented
        retention policy. There is no automatic refund or contributor payout.
        Payment timeouts require operator reconciliation; report receipts can be
        recovered with the original signed authorization.
      </p>
      <h2>Official references</h2>
      <ul>
        <li>
          <a href="https://ethglobal.com/events/mumbai/prizes">
            ETHGlobal Mumbai prize requirements
          </a>
        </li>
        <li>
          <a href="https://docs.hedera.com/solutions/ai/x402/merchant-integration">
            Hedera merchant integration
          </a>
        </li>
        <li>
          <a href="https://docs.hedera.com/solutions/ai/x402/pay-with-x402">
            Hedera buyer integration
          </a>
        </li>
        <li>
          <a href="https://docs.hedera.com/solutions/ai/x402/facilitators">
            Supported Hedera facilitators
          </a>
        </li>
        <li>
          <a href="https://pc.0g.ai/models">0G model catalog</a>
        </li>
        <li>
          <a href="https://docs.world.org/world-id/idkit/integrate">
            World IDKit integration
          </a>
        </li>
      </ul>
      <Link href="/missions" className="button button-primary">
        Open mission control
      </Link>
    </article>
  );
}
