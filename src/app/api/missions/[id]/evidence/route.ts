import { db, expireMissions, mission, transition } from "@/lib/db";
import { api, HttpError, rateLimit, sameOrigin, session } from "@/lib/http";
import { deleteEvidence, readEvidence, storeEvidence } from "@/lib/evidence";
export const runtime = "nodejs";
export const GET = api(async (_, ctx) => {
  const m = await mission((await ctx.params).id),
    who = await session(false);
  if (!m || !who || (m.claimant !== who && m.owner !== who))
    throw new HttpError(
      403,
      "Private evidence is available only to this mission's creator or worker.",
    );
  if (!m.evidenceKey) throw new HttpError(404, "Evidence not yet submitted.");
  return new Response(new Uint8Array(await readEvidence(m.evidenceKey)), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline; filename=evidence.jpg",
    },
  });
});
export const POST = api(async (request, ctx) => {
  sameOrigin(request);
  const who = (await session())!;
  await rateLimit(`upload:${who}`, 12);
  await expireMissions();
  const id = (await ctx.params).id,
    m = await mission(id);
  if (!m || m.claimant !== who)
    throw new HttpError(
      403,
      "Claim this mission with World ID before submitting evidence.",
    );
  if (
    m.state !== "CLAIMED" ||
    !m.challengeExpiresAt ||
    m.challengeExpiresAt <= Date.now()
  )
    throw new HttpError(
      409,
      "The claim challenge expired or was already used. Cancel and create a fresh mission.",
    );
  const length = Number(request.headers.get("content-length"));
  if (!length || length > 7 * 1024 * 1024)
    throw new HttpError(413, "Provide an upload under 6 MB.");
  const form = await request.formData();
  if (form.get("consent") !== "yes")
    throw new HttpError(400, "Evidence processing consent is required.");
  if (form.get("challenge") !== m.challenge)
    throw new HttpError(400, "Challenge mismatch. Refresh the mission.");
  const file = form.get("photo");
  if (!(file instanceof File))
    throw new HttpError(400, "Capture a photo first.");
  const stored = await storeEvidence(file);
  const tx = await (await db()).transaction("write");
  try {
    const current = await mission(id, tx);
    if (
      !current ||
      current.claimant !== who ||
      current.challengeExpiresAt! <= Date.now() ||
      current.state !== "CLAIMED"
    )
      throw new HttpError(409, "The claim is no longer available.");
    await transition(tx, current, "SUBMITTED", {
      evidenceKey: stored.key,
      evidenceHash: stored.hash,
      submittedAt: Date.now(),
    });
    await tx.commit();
  } catch (e) {
    await deleteEvidence(stored.key);
    throw e;
  } finally {
    tx.close();
  }
  return Response.json({ success: true });
});
