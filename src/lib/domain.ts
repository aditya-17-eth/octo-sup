import { z } from "zod";
export const states = [
  "OPEN",
  "CLAIMED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "PURCHASED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type MissionState = (typeof states)[number];
const transitions: Record<MissionState, readonly MissionState[]> = {
  OPEN: ["CLAIMED", "EXPIRED", "CANCELLED"],
  CLAIMED: ["SUBMITTED", "EXPIRED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "EXPIRED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "SUBMITTED", "EXPIRED"],
  VERIFIED: ["PURCHASED", "EXPIRED"],
  REJECTED: [],
  PURCHASED: [],
  EXPIRED: [],
  CANCELLED: [],
};
export function assertTransition(from: MissionState, to: MissionState) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid transition: ${from} -> ${to}`);
}
export const createMissionSchema = z
  .object({
    title: z.string().trim().min(10).max(140),
    question: z.string().trim().min(15).max(1500),
    area: z.string().trim().min(2).max(100),
    priceTinybars: z.number().int().min(1).max(100000000),
    durationMinutes: z.number().int().min(10).max(1440),
  })
  .strict();
export const assessmentSchema = z
  .object({
    decision: z.enum(["VERIFIED", "REJECTED"]),
    confidence: z.number().min(0).max(1),
    explanation: z.string().min(10).max(3000),
    answer: z.string().min(1).max(3000),
    challengeVisible: z.boolean(),
  })
  .strict();
export type Assessment = z.infer<typeof assessmentSchema>;
export type Mission = {
  id: string;
  title: string;
  question: string;
  area: string;
  priceTinybars: number;
  state: MissionState;
  createdAt: number;
  expiresAt: number;
  owner: string;
  claimant: string | null;
  challenge: string | null;
  challengeExpiresAt: number | null;
  evidenceKey: string | null;
  evidenceHash: string | null;
  submittedAt: number | null;
  worldEnvironment: string | null;
  revision: number;
};
export type PublicMission = Omit<
  Mission,
  | "owner"
  | "claimant"
  | "challenge"
  | "challengeExpiresAt"
  | "evidenceKey"
  | "evidenceHash"
  | "revision"
> & {
  isOwner: boolean;
  isClaimant: boolean;
  challenge?: string | null;
  challengeExpiresAt?: number | null;
  assessment?: {
    decision: string;
    confidence: number;
    model: string;
    requestId: string;
    trustMode: string;
  } | null;
};
export function hbar(tinybars: number | string) {
  return (Number(tinybars) / 1e8).toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}
