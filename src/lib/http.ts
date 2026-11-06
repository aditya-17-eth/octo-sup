import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { db } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let secret: Promise<string> | undefined;
function sessionSecret() {
  return (secret ??= (async () => {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
      return process.env.SESSION_SECRET;
    if (process.env.NODE_ENV === "production")
      throw new HttpError(
        503,
        "Set SESSION_SECRET (at least 32 characters) before production use.",
      );
    await mkdir("data", { recursive: true });
    try {
      return await readFile("data/session.key", "utf8");
    } catch {
      const key = randomBytes(32).toString("hex");
      try {
        await writeFile("data/session.key", key, { flag: "wx", mode: 0o600 });
        return key;
      } catch {
        return readFile("data/session.key", "utf8");
      }
    }
  })());
}
export function constantEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function session(create = true) {
  const jar = await cookies();
  const value = jar.get("reality-session")?.value;
  if (value) {
    const [id, signature] = value.split(".");
    if (
      id &&
      signature &&
      constantEqual(
        signature,
        createHmac("sha256", await sessionSecret())
          .update(id)
          .digest("hex"),
      )
    )
      return id;
  }
  if (!create) return undefined;
  const id = randomUUID();
  const signature = createHmac("sha256", await sessionSecret())
    .update(id)
    .digest("hex");
  jar.set("reality-session", `${id}.${signature}`, {
    httpOnly: true,
    sameSite: "strict",
    secure:
      new URL(process.env.APP_URL || "http://127.0.0.1:3000").protocol ===
      "https:",
    path: "/",
    maxAge: 604800,
  });
  return id;
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || "http://127.0.0.1:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(
      403,
      "Use the application origin for browser mutations.",
    );
}
export function requireAgent(request: Request) {
  const token = process.env.AGENT_API_TOKEN;
  if (!token || token.length < 32)
    throw new HttpError(
      503,
      "Configure AGENT_API_TOKEN (at least 32 characters) to enable the signing wallet.",
    );
  if (
    !constantEqual(
      request.headers.get("authorization") || "",
      `Bearer ${token}`,
    )
  )
    throw new HttpError(401, "Agent bearer token required.");
}
export async function rateLimit(key: string, maximum = 20, windowMs = 3600000) {
  const result = await (
    await db()
  ).execute({
    sql: `INSERT INTO rate_limits(key,count,resetAt) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resetAt<=? THEN 1 ELSE count+1 END, resetAt=CASE WHEN resetAt<=? THEN excluded.resetAt ELSE resetAt END RETURNING count`,
    args: [key, Date.now() + windowMs, Date.now(), Date.now()],
  });
  if (Number(result.rows[0].count) > maximum)
    throw new HttpError(
      429,
      "Request limit reached. Try again after the current window.",
    );
}
export async function json<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (Number(request.headers.get("content-length") || 0) > 65536)
    throw new HttpError(413, "Request body too large.");
  const body = await request.text();
  if (body.length > 65536) throw new HttpError(413, "Request body too large.");
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new HttpError(
      400,
      "Invalid request. Check the required fields and limits.",
    );
  }
}
export function api(
  handler: (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known)
        console.error(
          "API operation failed",
          error instanceof Error ? error.name : "unknown",
        );
      return Response.json(
        {
          error: known
            ? error.message
            : "Operation failed. Refresh and retry; check the server logs if it persists.",
        },
        {
          status: known ? error.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
}
