import { integrationStatus } from "@/lib/config";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(integrationStatus(), { headers: { "Cache-Control": "no-store" } }); }
