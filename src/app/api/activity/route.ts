import { timeline, expireMissions } from "@/lib/db";
import { api } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  await expireMissions();
  return Response.json(
    { events: await timeline() },
    { headers: { "Cache-Control": "no-store" } },
  );
});
