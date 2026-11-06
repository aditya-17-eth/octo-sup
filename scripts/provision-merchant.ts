// Creates one real Hedera TESTNET merchant after explicit operator authorization.
// A private journal is written BEFORE submission to prevent duplicate creation on a lost response.
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TransactionId,
} from "@hiero-ledger/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const payer = process.env.HEDERA_BUYER_ACCOUNT_ID,
  raw = process.env.HEDERA_BUYER_PRIVATE_KEY?.trim();
if (!payer || !raw) throw new Error("Buyer credentials are missing.");
if (process.env.HEDERA_MERCHANT_ACCOUNT_ID)
  throw new Error(
    "Merchant already configured. This script will not create a duplicate.",
  );
const key = /^(?:0x)?[0-9a-fA-F]{64}$/.test(raw)
  ? PrivateKey.fromStringECDSA(raw)
  : PrivateKey.fromString(raw);
const mirror = await fetch(
  `https://testnet.mirrornode.hedera.com/api/v1/accounts/${encodeURIComponent(payer)}`,
  { signal: AbortSignal.timeout(20000) },
);
if (!mirror.ok) throw new Error("Buyer not found on testnet.");
const account = await mirror.json();
if (
  account.key?._type !== "ECDSA_SECP256K1" ||
  account.key?.key?.toLowerCase() !== key.publicKey.toStringRaw().toLowerCase()
)
  throw new Error(
    "Buyer private key does not match the testnet account's public key.",
  );
await mkdir("data", { recursive: true });
const journalPath = "data/merchant-provision.json";
try {
  const prior = JSON.parse(await readFile(journalPath, "utf8"));
  if (prior.transactionId)
    throw new Error(
      `A merchant creation was already attempted: ${prior.transactionId}. Recover its receipt; do not submit a second creation.`,
    );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const merchant = PrivateKey.generateECDSA(),
  client = Client.forTestnet();
client.setOperator(AccountId.fromString(payer), key);
client.setRequestTimeout(30000);
const transactionId = TransactionId.generate(AccountId.fromString(payer));
const journal = {
  network: "hedera:testnet",
  transactionId: transactionId.toString(),
  merchantPrivateKey: merchant.toStringDer(),
  merchantEvmAddress: `0x${merchant.publicKey.toEvmAddress().replace(/^0x/, "")}`,
  status: "PREPARED",
  merchantAccountId: "",
};
await writeFile(journalPath, JSON.stringify(journal), {
  flag: "wx",
  mode: 0o600,
});
try {
  const transaction = new AccountCreateTransaction()
    .setECDSAKeyWithAlias(merchant.publicKey)
    .setInitialBalance(new Hbar(0.1))
    .setMaxAutomaticTokenAssociations(0)
    .setAccountMemo("REALITY.EXE testnet merchant")
    .setTransactionMemo(
      "REALITY.EXE merchant provisioning; not an x402 purchase",
    )
    .setMaxTransactionFee(new Hbar(1))
    .setTransactionId(transactionId)
    .freezeWith(client);
  journal.status = "SUBMITTING";
  await writeFile(journalPath, JSON.stringify(journal), { mode: 0o600 });
  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.accountId || receipt.status.toString() !== "SUCCESS")
    throw new Error("No successful merchant creation receipt.");
  journal.merchantAccountId = receipt.accountId.toString();
  journal.status = "CREATED";
  await writeFile(journalPath, JSON.stringify(journal), { mode: 0o600 });
  let env = await readFile(".env.local", "utf8");
  env = env.replace(
    /^HEDERA_MERCHANT_ACCOUNT_ID=.*$/m,
    `HEDERA_MERCHANT_ACCOUNT_ID=${journal.merchantAccountId}`,
  );
  env += `\n# Created testnet merchant key; retained privately for account recovery only.\nHEDERA_MERCHANT_PRIVATE_KEY=${journal.merchantPrivateKey}\n`;
  await writeFile(".env.local", env, { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        status: "CREATED",
        network: journal.network,
        merchantAccountId: journal.merchantAccountId,
        transactionId: journal.transactionId,
        hashscan: `https://hashscan.io/testnet/transaction/${encodeURIComponent(journal.transactionId)}`,
        note: "Account provisioning only. This is neither an x402 purchase nor a contributor payout. Private merchant key saved locally; not printed.",
      },
      null,
      2,
    ),
  );
} catch (e) {
  journal.status = "UNKNOWN";
  await writeFile(journalPath, JSON.stringify(journal), { mode: 0o600 });
  console.error(
    "Merchant provisioning did not return a confirmed receipt. Saved transaction for recovery:",
    journal.transactionId,
  );
  console.error("Failure class:", e instanceof Error ? e.name : "unknown");
  process.exitCode = 1;
} finally {
  client.close();
}
