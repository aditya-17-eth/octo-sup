import { db, expireMissions, mission, publicMission, timeline, transition } from "@/lib/db";
import { api, HttpError, sameOrigin, session } from "@/lib/http";
export const GET = api(async (_, ctx) => {
  await expireMissions();
  const m = await mission((await ctx.params).id);
  if (!m) throw new HttpError(404, "Mission not found.");
  const receipts = await (await db()).execute({ sql: "SELECT transactionId,payer,createdAt FROM payments WHERE missionId=? AND status='SETTLED'", args: [m.id] });
  return Response.json({ mission: await publicMission(m, await session(false)), events: await timeline(m.id), payments: receipts.rows }, { headers: { "Cache-Control": "no-store" } });
});
export const DELETE = api(async (request, ctx) => {
  sameOrigin(request);
  const who = await session();
  const tx = await (await db()).transaction("write");
  try {
    const m = await mission((await ctx.params).id, tx);
    if (!m) throw new HttpError(404, "Mission not found.");
    if (m.owner !== who && m.claimant !== who) throw new HttpError(403, "Only the creator or claimed worker may cancel this mission.");
    if (!["OPEN", "CLAIMED"].includes(m.state)) throw new HttpError(409, "Cancellation is only available before submission.");
    await transition(tx, m, "CANCELLED"); await tx.commit();
  } finally { tx.close(); }
  return Response.json({ success: true });
});
