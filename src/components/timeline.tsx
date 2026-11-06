"use client";
import Link from "next/link";
export type TimelineEvent = { id: string; missionId: string | null; kind: string; message: string; createdAt: number; details: Record<string, string> };
export function Timeline({ events, showMission = false }: { events: TimelineEvent[]; showMission?: boolean }) {
  return !events.length ? <div className="empty"><h3>No events yet.</h3><p>Published missions and real integration receipts will appear here.</p></div> : <ol className="timeline">{events.map(e => <li key={e.id}><time>{new Date(e.createdAt).toLocaleString()}</time><p>{e.message}</p>{showMission && e.missionId && <Link href={`/missions/${e.missionId}`}><small>Mission {e.missionId.slice(0, 8)}</small></Link>}{e.details.transactionId && <p><a href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(e.details.transactionId)}`} target="_blank" rel="noreferrer">View settlement on HashScan ↗</a></p>}{e.details.requestId && <small className="wrap">0G request {e.details.requestId}</small>}</li>)}</ol>;
}
