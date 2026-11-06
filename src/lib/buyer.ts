import { x402Client } from "@x402/core/client";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import {
  AccountId,
  PrivateKey,
  Hbar,
  TransferTransaction,
  TransactionId,
  createHederaClient,
  type ClientHederaSigner,
} from "@x402/hedera";
import type { PaymentRequired } from "@x402/core/types";
import { reportMemo } from "./payments";
// Official signer interface + Hiero SDK transfer construction, with an additional
// signed mission memo. This prevents a payment being redeemed for another report.
export async function signReportPayment(
  required: PaymentRequired,
  missionId: string,
) {
  const accountId = process.env.HEDERA_BUYER_ACCOUNT_ID,
    privateKey = process.env.HEDERA_BUYER_PRIVATE_KEY;
  if (!accountId || !privateKey)
    throw new Error(
      "Configure the funded Hedera testnet buyer account and private key.",
    );
  const rawKey = privateKey.trim();
  const key = /^(?:0x)?[0-9a-fA-F]{64}$/.test(rawKey)
    ? process.env.HEDERA_BUYER_KEY_TYPE === "ed25519"
      ? PrivateKey.fromStringED25519(rawKey)
      : PrivateKey.fromStringECDSA(rawKey)
    : PrivateKey.fromString(rawKey);
  const signer: ClientHederaSigner = {
    accountId,
    async createPartiallySignedTransferTransaction(req) {
      if (
        req.network !== "hedera:testnet" ||
        req.asset !== "0.0.0" ||
        req.extra?.requiredMemo !== reportMemo(missionId)
      )
        throw new Error("Unsupported report payment requirements");
      if (typeof req.extra?.feePayer !== "string")
        throw new Error("Facilitator fee payer missing");
      const amount = BigInt(req.amount);
      if (
        amount <= 0n ||
        amount >
          BigInt(process.env.AGENT_MAX_PER_PURCHASE_TINYBARS || "1000000")
      )
        throw new Error("Signing cap exceeded");
      const client = createHederaClient("hedera:testnet");
      try {
        const tx = new TransferTransaction()
          .addHbarTransfer(
            AccountId.fromString(accountId),
            Hbar.fromTinybars((-amount).toString()),
          )
          .addHbarTransfer(
            AccountId.fromString(req.payTo),
            Hbar.fromTinybars(amount.toString()),
          )
          .setTransactionId(
            TransactionId.generate(AccountId.fromString(req.extra.feePayer)),
          )
          .setTransactionMemo(reportMemo(missionId))
          .setTransactionValidDuration(120)
          .freezeWith(client);
        return Buffer.from((await tx.sign(key)).toBytes()).toString("base64");
      } finally {
        client.close();
      }
    },
  };
  const client = new x402Client()
    .register("hedera:testnet", new ExactHederaScheme(signer))
    .setSpendControls({
      allowedAssets: [
        {
          network: "hedera:testnet",
          asset: "0.0.0",
          maxAmountPerPayment:
            process.env.AGENT_MAX_PER_PURCHASE_TINYBARS || "1000000",
        },
      ],
    });
  return client.createPaymentPayload(required);
}
