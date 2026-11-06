"use client";
import { useEffect, useState } from "react";
import { Timeline, type TimelineEvent } from "@/components/timeline";
export default function Activity() {
  const [events, setEvents] = useState<TimelineEvent[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/activity");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (live) setEvents(d.events);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="page narrow">
      <div className="page-title">
        <div>
          <span className="eyebrow">Network audit log</span>
          <h1>Every signal has a history.</h1>
          <p>
            Actual mission transitions, assessment receipts, and payment
            outcomes.
          </p>
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="panel">
        <Timeline events={events} showMission />
      </div>
    </div>
  );
}
