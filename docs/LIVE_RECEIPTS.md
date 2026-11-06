# Live testnet receipts — 2026-11-06

These are real on-chain receipts, independently read from the Hedera testnet mirror node. Neither receipt is a contributor payout.

## Merchant provisioning

- Buyer/payer: `0.0.11337091`
- New merchant: `0.0.11337967`
- Transaction: `0.0.11337091@1793962117.446255405`
- Mirror result: `CRYPTOCREATEACCOUNT / SUCCESS`
- Initial merchant funding: 0.1 test HBAR
- [HashScan account creation](https://hashscan.io/testnet/transaction/0.0.11337091%401793962117.446255405)

The merchant signing key is retained only in ignored local private storage and .env.local. It is never printed or included in this document.

## Actual autonomous x402 HTTP diagnostic

- Resource: an explicitly synthetic payment diagnostic on a temporary loopback HTTP server. It contains no human evidence and asserts no World/0G verification.
- Flow: first GET returned HTTP 402 with SDK-built PAYMENT-REQUIRED; the buyer signed a real native-HBAR transfer; the retry returned HTTP 200 with PAYMENT-RESPONSE after official-facilitator settlement.
- Facilitator: `https://x402.org/facilitator`
- Network: `hedera:testnet`
- Buyer debit: `100000` tinybars (0.001 HBAR)
- Merchant credit: `100000` tinybars
- Fee payer: `0.0.9185802` (separate network fee)
- Transaction: `0.0.9185802@1793962324.386029501`
- Consensus timestamp: `1793962330.045763562`
- Mirror result: `CRYPTOTRANSFER / SUCCESS`
- Signed memo: `REALITY:68d4cfe7-19d6-47f0-b292-c5ca408eea89`
- [HashScan x402 diagnostic settlement](https://hashscan.io/testnet/transaction/0.0.9185802%401793962324.386029501)

This validates the actual x402/Hedera signing, verification and settlement exchange, not a complete marketplace purchase of human-verified evidence. The diagnostic is intentionally absent from the normal mission/payment tables. Its private journal remains under ignored data/diagnostics.

## Remaining core-flow gates

- The supplied buyer signing key matches its on-chain ECDSA account key.
- The saved World RP key produces a valid local signature. An initial signer-address mismatch was reported; the user subsequently confirmed the World configuration was corrected. An actual mission-bound simulator/human proof is still pending.
- The live IDKit cancellation path was demonstrated: its pending request was cancelled, the backend recorded WORLD_CANCELLED, and the mission remained OPEN. A new request was handed to the user for manual completion.
- A real authenticated private image probe against 0G returned HTTP 502: provider quote fetch ended with EOF. There was no model response or trace request ID. The diagnostic uses only a synthetic color swatch and creates no mission assessment.
- Private inference stays enforced. No standard-routing fallback, synthetic human proof, or fabricated assessment is enabled.
