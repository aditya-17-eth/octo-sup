import { signRequest } from "@worldcoin/idkit-core/signing";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, event, expireMissions, mission } from "@/lib/db";
import { api, HttpError, json, rateLimit, sameOrigin, session } from "@/lib/http";
import { worldConfig } from "@/lib/world";
export const runtime = "nodejs";
export const POST = api(async (request, ctx) => {
  sameOrigin(request); const who = (await session())!; await rateLimit(`world-request:${who}`, 12);
  await expireMissions(); const id = (await ctx.params).id, m = await mission(id);
  if (!m || m.state !== "OPEN") throw new HttpError(409, "This mission is not open for a human claim.");
  const config = worldConfig();
  const signature = signRequest({ signingKeyHex: config.signingKey, action: config.action, ttl: 300 });
  const requestId = randomUUID(), signal = `reality:${id}:${who}:${requestId}`, client = await db();
  await client.batch([
    { sql: "UPDATE world_requests SET status='CANCELLED' WHERE missionId=? AND sessionId=? AND status='PENDING'", args: [id, who] },
    { sql: "INSERT INTO world_requests(id,missionId,sessionId,nonce,signal,expiresAt,status) VALUES(?,?,?,?,?,?,'PENDING')", args: [requestId, id, who, signature.nonce, signal, signature.expiresAt * 1000] },
  ], "write");
  await event(client, id, "WORLD_REQUESTED", `Human eligibility requested via World ID (${config.environment}). Mission remains open.`);
  return Response.json({ requestId, signal, appId: config.appId, action: config.action, environment: config.environment, rp_context: { rp_id: config.rpId, nonce: signature.nonce, created_at: signature.createdAt, expires_at: signature.expiresAt, signature: signature.sig } }, { headers: { "Cache-Control": "private, no-store" } });
});
export const DELETE = api(async (request, ctx) => {
  sameOrigin(request); const who = (await session())!, id = (await ctx.params).id;
  const body = await json(request, z.object({ requestId: z.string().uuid() }).strict());
  const client = await db();
  const result = await client.execute({ sql: "UPDATE world_requests SET status='CANCELLED' WHERE id=? AND missionId=? AND sessionId=? AND status='PENDING'", args: [body.requestId, id, who] });
  if (result.rowsAffected) await event(client, id, "WORLD_CANCELLED", "Human verification cancelled. Protected mission claim did not occur.");
  return Response.json({ cancelled: true });
});
