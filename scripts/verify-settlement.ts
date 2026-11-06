// Read-only independent chain verification. No keys needed.
import { TransactionId } from "@x402/hedera";
const id = process.argv[2];
if (!id)
  throw new Error(
    "Usage: npm run verify-settlement -- <0.0.account@seconds.nanoseconds>",
  );
const canonical = TransactionId.fromString(id).toString();
const [account, timestamp] = canonical.split("@");
const mirrorId = `${account}-${timestamp.replace(".", "-")}`;
const response = await fetch(
  `https://testnet.mirrornode.hedera.com/api/v1/transactions/${encodeURIComponent(mirrorId)}`,
  { signal: AbortSignal.timeout(20000) },
);
if (!response.ok)
  throw new Error(
    `Mirror node HTTP ${response.status}. Consensus indexing may take a few seconds.`,
  );
const body = await response.json();
const transaction = body.transactions?.find(
  (t: { name: string; result: string }) =>
    t.name === "CRYPTOTRANSFER" && t.result === "SUCCESS",
);
if (!transaction)
  throw new Error(
    "No successful crypto transfer found. Do not claim settlement success.",
  );
console.log(
  JSON.stringify(
    {
      network: "hedera:testnet",
      transactionId: canonical,
      consensusTimestamp: transaction.consensus_timestamp,
      result: transaction.result,
      memo: Buffer.from(transaction.memo_base64 || "", "base64").toString(
        "utf8",
      ),
      transfers: transaction.transfers,
      hashscan: `https://hashscan.io/testnet/transaction/${encodeURIComponent(canonical)}`,
      note: "Confirm the mission memo and merchant credit match the payment ledger. This receipt does not prove a contributor payout.",
    },
    null,
    2,
  ),
);
export {};
