"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Fingerprint, ShieldCheck, LockKeyhole } from "lucide-react";
import { type PublicMission, hbar } from "@/lib/domain";
import { Status } from "@/components/mission-feed";
import { Timeline, type TimelineEvent } from "@/components/timeline";
import { Camera } from "@/components/camera";
import { Button } from "@/components/ui/button";
import { WorldClaim } from "@/components/world-claim";
import { MissionEdit } from "@/components/mission-edit";
export default function MissionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    [m, setM] = useState<PublicMission | null>(null),
    [events, setEvents] = useState<TimelineEvent[]>([]),
    [payments, setPayments] = useState<
      { transactionId: string; payer: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState<File | null>(null),
    [consent, setConsent] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/missions/${id}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setM(data.mission);
    setEvents(data.events);
    setPayments(data.payments);
  }, [id]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const t = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      10000,
    );
    return () => clearInterval(t);
  }, [refresh]);
  async function action(path: string, method = "POST", body?: FormData) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/missions/${id}${path}`, { method, body });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPhoto(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!m)
    return (
      <div className="page narrow">
        {error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : (
          <div className="loading">Loading mission…</div>
        )}
      </div>
    );
  return (
    <div className="page">
      <Link href="/missions" className="back">
        <ArrowLeft size={15} /> All missions
      </Link>
      <div className="page-title">
        <div>
          <span className="eyebrow">Mission {m.id.slice(0, 8)}</span>
          <h1>{m.title}</h1>
          <p>{m.area}</p>
        </div>
        <Status state={m.state} />
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <h2>Observation brief</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.question}</p>
            <div className="detail-meta">
              <div>
                <small>Report price</small>
                <span className="price">{hbar(m.priceTinybars)} HBAR</span>
              </div>
              <div>
                <small>Expires</small>
                {new Date(m.expiresAt).toLocaleString()}
              </div>
              <div>
                <small>Contributor payout</small>Not enabled
              </div>
            </div>
          </section>
          {m.state === "OPEN" && (
            <section className="panel stack">
              <h2>
                <Fingerprint size={20} /> A fresh human claim
              </h2>
              <p>
                Prove human eligibility with World ID before this mission is
                assigned. Verification is tied to this mission and your current
                browser session.
              </p>
              <WorldClaim missionId={m.id} onClaimed={refresh} />
              <div className="notice">
                World ID checks eligibility and uniqueness. It does not
                establish honesty, location, or evidence authenticity.
              </div>
            </section>
          )}
          {m.state === "CLAIMED" && m.isClaimant && (
            <section className="panel stack">
              <h2>Capture a fresh observation</h2>
              <p>
                Write this exact challenge on paper and include it in the scene.
                Do not add it as a digital overlay.
              </p>
              <div className="challenge">{m.challenge}</div>
              <p className="muted">
                Challenge expires{" "}
                {new Date(m.challengeExpiresAt!).toLocaleTimeString()}. It can
                be used for one submission.
              </p>
              <Camera onCapture={setPhoto} />
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I consent to private storage and 0G processing of this photo. I
                have permission to capture the scene and avoided sensitive
                personal information.
              </label>
              <Button
                disabled={
                  !photo ||
                  !consent ||
                  busy ||
                  Date.now() >= m.challengeExpiresAt!
                }
                onClick={() => {
                  const form = new FormData();
                  form.set("photo", photo!);
                  form.set("consent", "yes");
                  form.set("challenge", m.challenge!);
                  void action("/evidence", "POST", form);
                }}
              >
                {busy ? "Uploading…" : "Submit private evidence"}
              </Button>
            </section>
          )}
          {m.state === "CLAIMED" && !m.isClaimant && (
            <section className="panel">
              <h2>Worker in the field</h2>
              <p>
                This mission has been claimed. Waiting for a fresh camera
                observation.
              </p>
            </section>
          )}
          {["SUBMITTED", "UNDER_REVIEW"].includes(m.state) && (
            <section className="panel stack">
              <h2>Evidence assessment</h2>
              <p>
                0G will assess the submitted image against the brief and the
                visible challenge. The model cannot prove capture time,
                liveness, or location.
              </p>
              {m.isClaimant &&
                (m.state === "SUBMITTED" ||
                  (m.state === "UNDER_REVIEW" &&
                    Date.now() -
                      (events.find((e) => e.kind === "UNDER_REVIEW")
                        ?.createdAt || Date.now()) >
                      180000)) && (
                  <Button
                    disabled={busy}
                    onClick={() => void action("/review")}
                  >
                    {busy
                      ? "Assessing with 0G…"
                      : m.state === "UNDER_REVIEW"
                        ? "Retry interrupted assessment"
                        : "Assess evidence with 0G"}
                  </Button>
                )}
              {m.state === "UNDER_REVIEW" && (
                <p className="notice">
                  Assessment in progress. Refreshes automatically.
                </p>
              )}
            </section>
          )}
          {m.assessment && (
            <section className="panel">
              <h2>
                <ShieldCheck size={18} /> Assessed evidence receipt
              </h2>
              <dl className="receipt">
                <dt>Decision</dt>
                <dd>{m.assessment.decision}</dd>
                <dt>Confidence</dt>
                <dd>
                  {Math.round(m.assessment.confidence * 100)}% · model
                  self-report
                </dd>
                <dt>Model</dt>
                <dd>{m.assessment.model}</dd>
                <dt>0G request ID</dt>
                <dd>{m.assessment.requestId}</dd>
                <dt>Requested trust</dt>
                <dd>
                  {m.assessment.trustMode} · no independent attestation check
                </dd>
                <dt>World environment</dt>
                <dd>
                  {m.worldEnvironment}
                  {m.worldEnvironment !== "production"
                    ? " · simulated credential"
                    : ""}
                </dd>
              </dl>
              <p className="notice">
                This is an AI assessment of evidence, not cryptographic proof of
                the observed scene. The answer and explanation are inside the
                paid report.
              </p>
            </section>
          )}
          {["VERIFIED", "PURCHASED"].includes(m.state) && (
            <section className="panel stack">
              <h2>
                <LockKeyhole size={19} /> Intelligence, behind HTTP 402
              </h2>
              <p>
                The structured answer is available after verified Hedera testnet
                settlement. A transaction ID supplied by a client never unlocks
                the report.
              </p>
              <pre>GET /api/reports/{m.id}</pre>
              <Link
                className="button button-primary"
                href={`/agent?mission=${m.id}`}
              >
                Open buyer console
              </Link>
            </section>
          )}
          {["REJECTED", "CANCELLED", "EXPIRED"].includes(m.state) && (
            <section className="notice">
              This mission is {m.state.toLowerCase()}. It cannot accept a new
              claim or purchase. Create a new mission for a fresh observation.
            </section>
          )}
          {m.isOwner && m.state === "OPEN" && (
            <MissionEdit mission={m} onSaved={refresh} />
          )}
          {(m.isOwner || m.isClaimant) &&
            ["OPEN", "CLAIMED"].includes(m.state) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action("", "DELETE")}
              >
                Cancel mission
              </Button>
            )}
        </div>
        <aside className="stack">
          {payments.length > 0 && (
            <section className="panel">
              <h2>Purchase receipts</h2>
              {payments.map((p) => (
                <dl className="receipt" key={p.transactionId}>
                  <dt>Network</dt>
                  <dd>Hedera testnet</dd>
                  <dt>Transaction</dt>
                  <dd>
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(p.transactionId)}`}
                    >
                      {p.transactionId} ↗
                    </a>
                  </dd>
                  <dt>Contributor paid</dt>
                  <dd>No · buyer purchase only</dd>
                </dl>
              ))}
            </section>
          )}
          <section className="panel">
            <h2>Mission history</h2>
            <Timeline events={events} />
          </section>
          <p className="muted">
            Private evidence remains restricted to the creator and worker.
            Buyers receive a derived report, not the raw image.
          </p>
        </aside>
      </div>
    </div>
  );
}
