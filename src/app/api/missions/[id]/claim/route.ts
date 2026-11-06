import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, event, expireMissions, mission, transition } from "@/lib/db";
import { api, HttpError, json, rateLimit, sameOrigin, session } from "@/lib/http";
import { validateWorldBinding, worldConfig } from "@/lib/world";
export const runtime = "nodejs";
export const POST = api(async (request, ctx) => {
  sameOrigin(request); const who = (await session())!; await rateLimit(`world-verify:${who}`, 12);
  await expireMissions(); const id = (await ctx.params).id, config = worldConfig();
  const body = await json(request, z.object({ requestId: z.string().uuid(), result: z.unknown() }).strict());
  const client = await db();
  const result = await client.execute({ sql: "UPDATE world_requests SET status='VERIFYING' WHERE id=? AND missionId=? AND sessionId=? AND status='PENDING' AND expiresAt>? RETURNING *", args: [body.requestId, id, who, Date.now()] });
  const pending = result.rows[0];
  if (!pending) {
    await event(client, id, "WORLD_DENIED", "Expired, reused or invalid World request rejected. Mission claim did not occur.");
    throw new HttpError(409, "Verification request expired, was cancelled or has already been used. Start a fresh verification.");
  }
  try {
    const valid = validateWorldBinding(body.result, { nonce: String(pending.nonce), signal: String(pending.signal), action: config.action, environment: config.environment });
    let verification: Response;
    try { verification = await fetch(`https://developer.world.org/api/v4/verify/${encodeURIComponent(config.rpId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid.result), signal: AbortSignal.timeout(20000) }); }
    catch { throw new HttpError(502, "World verification service was unavailable. Mission remains unclaimed. Start a fresh verification to retry."); }
    if (!verification.ok) throw new HttpError(400, "World rejected the proof. Mission remains unclaimed.");
    const verdict = await verification.json();
    if (verdict.success !== true || verdict.environment !== config.environment) throw new HttpError(400, "World did not validate the expected environment. Mission remains unclaimed.");
    const tx = await client.transaction("write");
    try {
      const m = await mission(id, tx);
      if (!m || m.state !== "OPEN" || m.expiresAt <= Date.now() || Number(pending.expiresAt) <= Date.now()) throw new HttpError(409, "The mission or verification request expired, or another worker claimed it.");
      const duplicate = await tx.execute({ sql: "SELECT nullifier FROM nullifiers WHERE nullifier=? AND action=? AND missionId=?", args: [valid.nullifier, config.action, id] });
      if (duplicate.rows.length) throw new HttpError(409, "This human credential has already claimed this mission.");
      await tx.execute({ sql: "INSERT INTO nullifiers(nullifier,action,missionId) VALUES(?,?,?)", args: [valid.nullifier, config.action, id] });
      const challenge = `${id.slice(0, 8).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
      await transition(tx, m, "CLAIMED", { claimant: who, challenge, challengeExpiresAt: Math.min(Date.now() + 600000, m.expiresAt), worldEnvironment: config.environment });
      await tx.execute({ sql: "UPDATE world_requests SET status='VERIFIED' WHERE id=? AND status='VERIFYING'", args: [body.requestId] });
      await event(tx, id, "WORLD_VERIFIED", `Backend-verified World proof authorized this mission claim (${config.environment}${config.environment === "staging" ? "; simulator credential" : ""}).`);
      await tx.commit();
    } finally { tx.close(); }
    return Response.json({ claimed: true, environment: config.environment });
  } catch (error) {
    await client.execute({ sql: "UPDATE world_requests SET status='DENIED' WHERE id=? AND status='VERIFYING'", args: [body.requestId] });
    await event(client, id, "WORLD_DENIED", "Human verification failed or was ineligible. Protected claim was not granted.");
    throw error;
  }
});
