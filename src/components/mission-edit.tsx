"use client";
import { useState } from "react";
import type { PublicMission } from "@/lib/domain";
import { Button } from "./ui/button";
export function MissionEdit({
  mission,
  onSaved,
}: {
  mission: PublicMission;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit open mission
      </Button>
    );
  return (
    <form
      className="panel form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await fetch(`/api/missions/${mission.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: f.get("title"),
              question: f.get("question"),
              area: f.get("area"),
              priceTinybars: Math.round(Number(f.get("price")) * 1e8),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          await onSaved();
          setOpen(false);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Edit observation brief</h2>
      <label>
        Mission title
        <input
          name="title"
          defaultValue={mission.title}
          minLength={10}
          maxLength={140}
          required
        />
      </label>
      <label>
        Observation criteria
        <textarea
          name="question"
          defaultValue={mission.question}
          minLength={15}
          maxLength={1500}
          rows={4}
          required
        />
      </label>
      <label>
        General area
        <input
          name="area"
          defaultValue={mission.area}
          minLength={2}
          maxLength={100}
          required
        />
      </label>
      <label>
        Report price (HBAR)
        <input
          name="price"
          type="number"
          min="0.00000001"
          max="1"
          step="0.00000001"
          defaultValue={mission.priceTinybars / 1e8}
          required
        />
      </label>
      <p className="muted">
        Expiry stays unchanged. Pending human-verification requests will be
        invalidated so workers can review the new brief.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save brief"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Close editor
        </Button>
      </div>
    </form>
  );
}
