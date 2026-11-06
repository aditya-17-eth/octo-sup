import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { z } from "zod";
import { HttpError } from "./http";
export function worldConfig() {
  const appId = process.env.WORLD_APP_ID,
    rpId = process.env.WORLD_RP_ID,
    signingKey = process.env.WORLD_RP_SIGNING_KEY;
  if (!appId || !rpId || !signingKey)
    throw new HttpError(
      503,
      "Set WORLD_APP_ID, WORLD_RP_ID and WORLD_RP_SIGNING_KEY from the World developer portal. Mission remains unclaimed.",
    );
  const environment = process.env.WORLD_ENVIRONMENT || "staging";
  if (environment !== "staging" && environment !== "production")
    throw new HttpError(
      503,
      "WORLD_ENVIRONMENT must be staging or production.",
    );
  return {
    appId,
    rpId,
    signingKey,
    action: process.env.WORLD_ACTION || "claim-mission",
    environment,
  };
}
export const worldResultSchema = z
  .object({
    protocol_version: z.literal("4.0"),
    nonce: z.string().min(1).max(256),
    action: z.string().min(1).max(256),
    environment: z.enum(["production", "staging"]),
    responses: z
      .array(
        z
          .object({
            identifier: z.literal("proof_of_human"),
            issuer_schema_id: z.literal(1),
            signal_hash: z.string().min(1).max(100),
            nullifier: z.string().min(1).max(100),
            proof: z.array(z.string().max(256)).min(5).max(5),
            expires_at_min: z.number().int(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
export function validateWorldBinding(
  raw: unknown,
  expected: {
    nonce: string;
    signal: string;
    action: string;
    environment: string;
  },
) {
  const parsed = worldResultSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(
      400,
      "A valid World ID 4.0 proof-of-human response is required.",
    );
  const result = parsed.data;
  const proof = result.responses[0];
  if (
    result.nonce !== expected.nonce ||
    result.action !== expected.action ||
    result.environment !== expected.environment
  )
    throw new HttpError(
      400,
      "World proof does not match this request, action or environment.",
    );
  let nullifier: string;
  try {
    if (BigInt(proof.signal_hash) !== BigInt(hashSignal(expected.signal)))
      throw new Error("Signal mismatch");
    const n = BigInt(proof.nullifier);
    if (n < 0n || n >= 2n ** 256n) throw new Error("Invalid nullifier");
    nullifier = n.toString(10);
  } catch {
    throw new HttpError(
      400,
      "World proof is not bound to this mission and browser request.",
    );
  }
  if (proof.expires_at_min <= Math.floor(Date.now() / 1000))
    throw new HttpError(400, "World credential is expired.");
  return { result, nullifier };
}
