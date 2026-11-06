import {
  db,
  expireMissions,
  mission,
  publicMission,
  timeline,
  transition,
  event,
} from "@/lib/db";
import { api, HttpError, sameOrigin, session, json } from "@/lib/http";
import { createMissionSchema } from "@/lib/domain";
export const PATCH = api(async (request, ctx) => {
  sameOrigin(request);
  const who = await session();
  const body = await json(
    request,
    createMissionSchema.omit({ durationMinutes: true }),
  );
  const tx = await (await db()).transaction("write");
  try {
    const m = await mission((await ctx.params).id, tx);
    if (!m || m.owner !== who)
      throw new HttpError(403, "Only the mission creator can edit this brief.");
    if (m.state !== "OPEN" || m.expiresAt <= Date.now())
      throw new HttpError(
        409,
        "A brief can only be edited while its mission is open and unexpired.",
      );
    await tx.execute({
      sql: "UPDATE missions SET title=?,question=?,area=?,priceTinybars=?,revision=revision+1 WHERE id=? AND revision=?",
      args: [
        body.title,
        body.question,
        body.area,
        body.priceTinybars,
        m.id,
        m.revision,
      ],
    });
    await tx.execute({
      sql: "UPDATE world_requests SET status='CANCELLED' WHERE missionId=? AND status IN ('PENDING','VERIFYING')",
      args: [m.id],
    });
    await event(
      tx,
      m.id,
      "EDITED",
      "Creator updated the open mission brief. Prior pending claim requests were invalidated.",
    );
    await tx.commit();
  } finally {
    tx.close();
  }
  return Response.json({ success: true });
});
export const GET = api(async (_, ctx) => {
  await expireMissions();
  const m = await mission((await ctx.params).id);
  if (!m) throw new HttpError(404, "Mission not found.");
  const receipts = await (
    await db()
  ).execute({
    sql: "SELECT transactionId,payer,createdAt FROM payments WHERE missionId=? AND status='SETTLED'",
    args: [m.id],
  });
  return Response.json(
    {
      mission: await publicMission(m, await session(false)),
      events: await timeline(m.id),
      payments: receipts.rows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
export const DELETE = api(async (request, ctx) => {
  sameOrigin(request);
  const who = await session();
  const tx = await (await db()).transaction("write");
  try {
    const m = await mission((await ctx.params).id, tx);
    if (!m) throw new HttpError(404, "Mission not found.");
    if (m.owner !== who && m.claimant !== who)
      throw new HttpError(
        403,
        "Only the creator or claimed worker may cancel this mission.",
      );
    if (!["OPEN", "CLAIMED"].includes(m.state))
      throw new HttpError(
        409,
        "Cancellation is only available before submission.",
      );
    await transition(tx, m, "CANCELLED");
    await tx.commit();
  } finally {
    tx.close();
  }
  return Response.json({ success: true });
});
