// Imports only public, independently confirmed diagnostic facts into the audit timeline.
// It never creates a mission/report or changes payment authorization.
import { readFile, readdir } from "node:fs/promises";
import { db, event } from "../src/lib/db";
const client = await db();
async function once(
  kind: string,
  transactionId: string,
  message: string,
  details: object,
) {
  const existing = await client.execute({
    sql: "SELECT id FROM events WHERE kind=? AND json_extract(details,'$.transactionId')=?",
    args: [kind, transactionId],
  });
  if (!existing.rows.length)
    await event(client, null, kind, message, { ...details, transactionId });
}
const provision = JSON.parse(
  await readFile("data/merchant-provision.json", "utf8"),
);
const createId = provision.transactionId
  .replace("@", "-")
  .replace(/(\d+)\.(\d+)$/, "$1-$2");
const create = await (
  await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/transactions/${createId}`,
  )
).json();
if (
  !create.transactions?.some(
    (t: { name: string; result: string; entity_id: string }) =>
      t.name === "CRYPTOCREATEACCOUNT" &&
      t.result === "SUCCESS" &&
      t.entity_id === provision.merchantAccountId,
  )
)
  throw new Error("Merchant creation is not confirmed by the mirror node.");
await once(
  "MERCHANT_CREATED",
  provision.transactionId,
  "Separate testnet merchant created. Account provisioning only; no report purchase or contributor payout.",
  { merchant: provision.merchantAccountId },
);
for (const filename of await readdir("data/diagnostics")) {
  if (!filename.startsWith("x402-") || !filename.endsWith(".json")) continue;
  const diagnostic = JSON.parse(
    await readFile(`data/diagnostics/${filename}`, "utf8"),
  );
  if (diagnostic.status !== "SETTLED" || !diagnostic.receipt?.success) continue;
  const tx = String(diagnostic.transactionId)
    .replace("@", "-")
    .replace(/(\d+)\.(\d+)$/, "$1-$2");
  const result = await (
    await fetch(
      `https://testnet.mirrornode.hedera.com/api/v1/transactions/${tx}`,
    )
  ).json();
  const transfer = result.transactions?.find(
    (t: { name: string; result: string }) =>
      t.name === "CRYPTOTRANSFER" && t.result === "SUCCESS",
  );
  const credited = transfer?.transfers
    ?.filter((t: { account: string }) => t.account === diagnostic.merchant)
    .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (credited !== Number(diagnostic.amountTinybars))
    throw new Error("Diagnostic merchant credit did not match.");
  await once(
    "X402_DIAGNOSTIC_SETTLED",
    diagnostic.transactionId,
    "Real autonomous x402 diagnostic settled 0.001 test HBAR. Diagnostic resource only; no human-evidence report purchase or contributor payout.",
    {
      merchant: diagnostic.merchant,
      amountTinybars: diagnostic.amountTinybars,
      scope: "standalone_payment_diagnostic",
    },
  );
}
console.log(
  "Confirmed public setup/diagnostic receipts recorded. No mission, report, or payment authorization was created.",
);
client.close();
