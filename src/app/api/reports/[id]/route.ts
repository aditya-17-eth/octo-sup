import { protectedReport } from "@/lib/payments";
import { api } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const GET = api(async (request, ctx) => protectedReport(request, (await ctx.params).id));
