"use client";
import { Button } from "./ui/button";
export function WorldClaim({ missionId: _id, onClaimed: _refresh }: { missionId: string; onClaimed: () => Promise<void> }) { return <><Button disabled>World ID setup required</Button><p className="muted">Claims stay locked until a server-verified World ID flow is configured.</p></>; }
