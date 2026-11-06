import { randomUUID } from "node:crypto";
import { db, event, expireMissions, mission, transition } from "@/lib/db";
import { api, HttpError, rateLimit, sameOrigin, session } from "@/lib/http";
import { assessEvidence } from "@/lib/og";
export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = api(async (request, ctx) => {
  sameOrigin(request); const who = (await session())!; await rateLimit(`review:${who}`, 8);
  if (!process.env.OG_API_KEY) throw new HttpError(503, "Set OG_API_KEY and fund the 0G Private Computer account before requesting assessment.");
  await expireMissions(); const id = (await ctx.params).id, client = await db(), token = randomUUID();
  const tx = await client.transaction("write");
  let m;
  try {
    m = await mission(id, tx);
    if (!m || m.claimant !== who) throw new HttpError(403, "Only the claimed worker may request assessment.");
    if (m.state === "UNDER_REVIEW") {
      const job = await tx.execute({ sql: "SELECT startedAt FROM review_jobs WHERE missionId=?", args: [id] });
      if (!job.rows[0] || Number(job.rows[0].startedAt) > Date.now() - 180000) throw new HttpError(409, "Assessment is already in progress.");
      await transition(tx, m, "SUBMITTED");
      m = (await mission(id, tx))!;
    }
    if (m.state !== "SUBMITTED") throw new HttpError(409, "This mission is not ready for assessment.");
    await transition(tx, m, "UNDER_REVIEW");
    await tx.execute({ sql: "INSERT INTO review_jobs(missionId,token,startedAt) VALUES(?,?,?) ON CONFLICT(missionId) DO UPDATE SET token=excluded.token,startedAt=excluded.startedAt", args: [id, token, Date.now()] });
    await tx.commit();
  } finally { tx.close(); }
  try {
    const result = await assessEvidence(m!);
    const complete = await client.transaction("write");
    try {
      const current = (await mission(id, complete))!, job = await complete.execute({ sql: "SELECT token FROM review_jobs WHERE missionId=?", args: [id] });
      if (job.rows[0]?.token !== token || current.state !== "UNDER_REVIEW") throw new HttpError(409, "The assessment lease changed or mission expired.");
      await complete.execute({ sql: "INSERT INTO reports(missionId,decision,confidence,model,requestId,trustMode,assessment,rawResponse,createdAt) VALUES(?,?,?,?,?,?,?,?,?)", args: [id, result.assessment.decision, result.assessment.confidence, result.model, result.requestId, result.trustMode, JSON.stringify(result.assessment), result.rawResponse, Date.now()] });
      await transition(complete, current, result.assessment.decision);
      await event(complete, id, "OG_ASSESSED", "0G returned an evidence assessment. This is a model conclusion, not proof of the scene.", { requestId: result.requestId, model: result.model, decision: result.assessment.decision, confidence: result.assessment.confidence, trustMode: result.trustMode });
      await complete.commit();
    } finally { complete.close(); }
    return Response.json({ decision: result.assessment.decision, requestId: result.requestId, model: result.model });
  } catch (error) {
    const failed = await client.transaction("write");
    try {
      const current = await mission(id, failed), job = await failed.execute({ sql: "SELECT token FROM review_jobs WHERE missionId=?", args: [id] });
      if (current?.state === "UNDER_REVIEW" && current.expiresAt > Date.now() && job.rows[0]?.token === token) await transition(failed, current, "SUBMITTED");
      await event(failed, id, "OG_FAILED", error instanceof HttpError ? error.message : "0G assessment failed; no validated report was published.");
      await failed.commit();
    } finally { failed.close(); }
    throw error;
  }
});
