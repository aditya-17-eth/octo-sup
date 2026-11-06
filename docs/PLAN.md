# REALITY.EXE implementation

Minimal architecture: Next.js App Router + TypeScript + Tailwind + shadcn-style Radix components; libSQL (file SQLite locally, Turso remotely); private sanitized camera JPEGs on a persistent volume or S3. Opaque signed browser sessions authorize mission ownership and claims. No contracts.

Milestones (commit each runnable milestone):
1. Runnable shell, environment contract, current official SDK dependencies.
2. Durable mission creation/listing, guarded transitions, owner cancellation, challenge and evidence UI.
3. 0G image-input API, validated JSON assessment, request/model receipt; fail closed.
4. x402 v2 report endpoint; official facilitator discovery/verification/settlement; durable replay ledger and agent budget reservations. Only real settlement unlocks reports.
5. IDKit 4.x RP signing, server verification bound to mission/session/nonce, unique nullifiers, denial/cancellation; never claim on an invalid proof.
6. Security tests, responsive QA, deployment configuration, README and 2:45 demo script.

Visual direction: graphite #101211, black #080a09, white #f1f3ed, muted #89928b, lime #d5ff4f, caution #f2b66d. System grotesk display, restrained monospace protocol data. Left-aligned mission queue and a right-side live trace; an oversized API statement anchors the home page. No invented activity or balances. Empty states ask for a real mission. Mobile prioritizes verification, challenge and camera.

External gates: funded Hedera testnet buyer and merchant ID; 0G key/credits and an available multimodal provider compatible with selected trust mode; World app/RP signing key and a human credential/simulator; production hosting credentials and durable storage. Secrets are supplied locally, never in public responses or git.
