import {
  createClient,
  type Client,
  type InValue,
  type Transaction,
} from "@libsql/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Mission, PublicMission, MissionState } from "./domain";
import { assertTransition } from "./domain";
import { randomUUID } from "node:crypto";

let pending: Promise<Client> | undefined;
export function db(): Promise<Client> {
  return (pending ??= initialize().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
async function initialize() {
  const url = process.env.DATABASE_URL || "file:data/reality.db";
  if (url.startsWith("file:") && url !== "file::memory:") {
    const filename = url.startsWith("file:///")
      ? fileURLToPath(url)
      : path.resolve(url.slice(5));
    await mkdir(path.dirname(filename), { recursive: true });
  }
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, question TEXT NOT NULL, area TEXT NOT NULL,
      priceTinybars INTEGER NOT NULL CHECK(priceTinybars > 0), state TEXT NOT NULL,
      createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, owner TEXT NOT NULL,
      claimant TEXT, challenge TEXT, challengeExpiresAt INTEGER, evidenceKey TEXT,
      evidenceHash TEXT, submittedAt INTEGER, worldEnvironment TEXT, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, missionId TEXT, kind TEXT NOT NULL, message TEXT NOT NULL,
      createdAt INTEGER NOT NULL, details TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS event_time ON events(createdAt DESC);
    CREATE TABLE IF NOT EXISTS reports (
      missionId TEXT PRIMARY KEY, decision TEXT NOT NULL, confidence REAL NOT NULL,
      model TEXT NOT NULL, requestId TEXT NOT NULL, trustMode TEXT NOT NULL,
      assessment TEXT NOT NULL, rawResponse TEXT NOT NULL, createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS world_requests (
      id TEXT PRIMARY KEY, missionId TEXT NOT NULL, sessionId TEXT NOT NULL,
      nonce TEXT UNIQUE NOT NULL, signal TEXT NOT NULL, expiresAt INTEGER NOT NULL, status TEXT NOT NULL,
      missionRevision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nullifiers (
      nullifier TEXT NOT NULL, action TEXT NOT NULL, missionId TEXT NOT NULL,
      PRIMARY KEY(nullifier, action, missionId)
    );
    CREATE TABLE IF NOT EXISTS payments (
      digest TEXT PRIMARY KEY, missionId TEXT NOT NULL, status TEXT NOT NULL,
      transactionId TEXT UNIQUE, payer TEXT, receipt TEXT, payloadHash TEXT NOT NULL, createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, missionId TEXT NOT NULL, status TEXT NOT NULL,
      amount INTEGER NOT NULL, trace TEXT NOT NULL, receipt TEXT, report TEXT,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resetAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inference_requests (id TEXT PRIMARY KEY,missionId TEXT NOT NULL,model TEXT NOT NULL,rawResponse TEXT NOT NULL,createdAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS review_jobs (missionId TEXT PRIMARY KEY,token TEXT NOT NULL,startedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_payloads (runId TEXT PRIMARY KEY,signature TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_agent_purchase_per_mission ON agent_runs(missionId) WHERE status IN ('RESERVED','UNKNOWN','SETTLED');
  `);
  const migration = await client.transaction("write");
  try {
    const columns = await migration.execute(
      "PRAGMA table_info(world_requests)",
    );
    if (!columns.rows.some((column) => column.name === "missionRevision"))
      await migration.execute(
        "ALTER TABLE world_requests ADD COLUMN missionRevision INTEGER NOT NULL DEFAULT 0",
      );
    await migration.execute(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,appliedAt INTEGER NOT NULL)",
    );
    await migration.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations(version,appliedAt) VALUES(1,?)",
      args: [Date.now()],
    });
    await migration.commit();
  } finally {
    migration.close();
  }
  return client;
}
export type Executor = Pick<Client | Transaction, "execute">;
export async function event(
  executor: Executor,
  missionId: string | null,
  kind: string,
  message: string,
  details: object = {},
) {
  await executor.execute({
    sql: "INSERT INTO events(id,missionId,kind,message,createdAt,details) VALUES(?,?,?,?,?,?)",
    args: [
      randomUUID(),
      missionId,
      kind,
      message,
      Date.now(),
      JSON.stringify(details),
    ],
  });
}
export async function expireMissions() {
  const client = await db();
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: "SELECT id FROM missions WHERE expiresAt <= ? AND state IN ('OPEN','CLAIMED','SUBMITTED','UNDER_REVIEW','VERIFIED')",
      args: [Date.now()],
    });
    for (const row of result.rows) {
      await tx.execute({
        sql: "UPDATE missions SET state='EXPIRED',revision=revision+1 WHERE id=?",
        args: [row.id],
      });
      await event(
        tx,
        String(row.id),
        "EXPIRED",
        "Mission expired. New submissions and purchases are closed.",
      );
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}
export async function mission(
  id: string,
  executor?: Executor,
): Promise<Mission | null> {
  const result = await (executor || (await db())).execute({
    sql: "SELECT * FROM missions WHERE id=?",
    args: [id],
  });
  return (result.rows[0] as unknown as Mission) || null;
}
export async function transition(
  tx: Executor,
  current: Mission,
  next: MissionState,
  fields: Record<string, InValue> = {},
) {
  assertTransition(current.state, next);
  const allowed = [
    "claimant",
    "challenge",
    "challengeExpiresAt",
    "evidenceKey",
    "evidenceHash",
    "submittedAt",
    "worldEnvironment",
  ];
  if (Object.keys(fields).some((key) => !allowed.includes(key)))
    throw new Error("Unsupported transition field");
  const pairs = Object.keys(fields).map((key) => `${key}=?`);
  const r = await tx.execute({
    sql: `UPDATE missions SET state=?,revision=revision+1${pairs.length ? "," + pairs.join(",") : ""} WHERE id=? AND state=? AND revision=? AND expiresAt>?`,
    args: [
      next,
      ...Object.values(fields),
      current.id,
      current.state,
      current.revision,
      Date.now(),
    ],
  });
  if (r.rowsAffected !== 1)
    throw new Error("Mission changed or expired; refresh and try again");
  await event(
    tx,
    current.id,
    next,
    `Mission ${next.toLowerCase().replaceAll("_", " ")}.`,
  );
}
export async function publicMission(
  m: Mission,
  sessionId?: string,
): Promise<PublicMission> {
  const {
    owner,
    claimant,
    challenge,
    challengeExpiresAt,
    evidenceKey: _key,
    evidenceHash: _hash,
    revision: _rev,
    ...safe
  } = m;
  const r = await (
    await db()
  ).execute({
    sql: "SELECT decision,confidence,model,requestId,trustMode FROM reports WHERE missionId=?",
    args: [m.id],
  });
  return {
    ...safe,
    isOwner: owner === sessionId,
    isClaimant: claimant === sessionId,
    ...(claimant === sessionId ? { challenge, challengeExpiresAt } : {}),
    assessment: (r.rows[0] as unknown as PublicMission["assessment"]) || null,
  };
}
export async function timeline(id?: string) {
  const result = await (
    await db()
  ).execute({
    sql: `SELECT * FROM events ${id ? "WHERE missionId=?" : ""} ORDER BY createdAt DESC LIMIT 100`,
    args: id ? [id] : [],
  });
  return result.rows.map((row) => ({
    ...row,
    details: JSON.parse(String(row.details)),
  }));
}
