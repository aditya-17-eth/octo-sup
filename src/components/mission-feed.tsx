"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, LocateFixed, Radar } from "lucide-react";
import { hbar, type PublicMission } from "@/lib/domain";
export function Status({ state }: { state: string }) {
  return (
    <span className={`status status-${state.toLowerCase()}`}>
      <span />
      {state.replaceAll("_", " ")}
    </span>
  );
}
export function MissionFeed({ compact = false }: { compact?: boolean }) {
  const [missions, setMissions] = useState<PublicMission[]>([]),
    [filter, setFilter] = useState("ALL"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const r = await fetch("/api/missions");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (live) {
          setMissions(d.missions);
          setError("");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const visible = missions
    .filter((m) => filter === "ALL" || m.state === filter)
    .slice(0, compact ? 4 : 100);
  return (
    <section className="feed">
      <div className="section-heading">
        <div>
          <span className="eyebrow">The observation network</span>
          <h2>{compact ? "Mission feed" : "Find your next mission"}</h2>
        </div>
        {compact ? (
          <Link className="text-link" href="/missions">
            View all missions <ArrowUpRight size={16} />
          </Link>
        ) : (
          <span className="muted">
            {missions.length} published · updates every 15s
          </span>
        )}
      </div>
      {!compact && (
        <div className="tabs" aria-label="Filter missions">
          {["ALL", "OPEN", "CLAIMED", "VERIFIED", "PURCHASED"].map((s) => (
            <button
              key={s}
              aria-pressed={s === filter}
              onClick={() => setFilter(s)}
            >
              {s === "ALL" ? "All missions" : s.toLowerCase()}
            </button>
          ))}
        </div>
      )}
      <div className="feed-table">
        <div className="feed-head">
          <span>Mission / location</span>
          <span>Status</span>
          <span>Report price</span>
          <span />
        </div>
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <div className="empty">Connecting to the mission network…</div>
        ) : !visible.length ? (
          <div className="empty">
            <Radar size={32} />
            <h3>
              {missions.length
                ? "No missions in this state"
                : "The next signal starts with you."}
            </h3>
            <p>Create a mission to ask a human what an API can’t tell you.</p>
            <Link className="text-link" href="/missions/new">
              Create a mission <ArrowUpRight size={16} />
            </Link>
          </div>
        ) : (
          visible.map((m) => (
            <Link className="mission-row" href={`/missions/${m.id}`} key={m.id}>
              <div>
                <small>{m.id.slice(0, 8)}</small>
                <h3>{m.title}</h3>
                <p>
                  <LocateFixed size={12} />
                  {m.area}
                  <span>
                    Expires{" "}
                    {new Date(m.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              </div>
              <Status state={m.state} />
              <div className="price">
                {hbar(m.priceTinybars)} <span>HBAR</span>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
