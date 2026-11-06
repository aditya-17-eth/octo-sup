import { randomUUID } from "node:crypto";
import { db, event, expireMissions, publicMission } from "@/lib/db";
import { createMissionSchema, type Mission } from "@/lib/domain";
import { api, json, rateLimit, sameOrigin, session } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  await expireMissions();
  const who = await session(false);
  const result = await (
    await db()
  ).execute("SELECT * FROM missions ORDER BY createdAt DESC LIMIT 100");
  return Response.json(
    {
      missions: await Promise.all(
        result.rows.map((row) => publicMission(row as unknown as Mission, who)),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
export const POST = api(async (request) => {
  sameOrigin(request);
  const who = (await session())!;
  await rateLimit(`create:${who}`, 20);
  const data = await json(request, createMissionSchema);
  const id = randomUUID(),
    now = Date.now();
  const tx = await (await db()).transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO missions(id,title,question,area,priceTinybars,state,createdAt,expiresAt,owner) VALUES(?,?,?,?,?,'OPEN',?,?,?)",
      args: [
        id,
        data.title,
        data.question,
        data.area,
        data.priceTinybars,
        now,
        now + data.durationMinutes * 60000,
        who,
      ],
    });
    await event(
      tx,
      id,
      "OPEN",
      "Mission published. Awaiting a verified human claim.",
    );
    await tx.commit();
  } finally {
    tx.close();
  }
  return Response.json({ id }, { status: 201 });
});
