"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  Fingerprint,
  Cpu,
  Wallet,
  ArrowUpRight,
  Play,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { hbar } from "@/lib/domain";
import { Button } from "@/components/ui/button";
type Run = {
  id: string;
  missionId: string;
  status: string;
  amount: number;
  trace: string;
  receipt: string | null;
  report: string | null;
  createdAt: number;
};
type Config = {
  world: { ready: boolean; environment: string };
  og: { ready: boolean; model: string; trustMode: string };
  hedera: { ready: boolean; network: string };
  agent: { ready: boolean };
};
function Console() {
  const search = useSearchParams(),
    [config, setConfig] = useState<Config | null>(null),
    [token, setToken] = useState(""),
    [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState<Run | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [price, setPrice] = useState("0.01"),
    [confidence, setConfidence] = useState("0.8"),
    [budget, setBudget] = useState<{ spent: number; total: number } | null>(
      null,
    );
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Could not read integration status."));
  }, []);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/agent", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setRuns(d.runs);
    setBudget({ spent: d.reservedOrSpentTinybars, total: d.budgetTinybars });
    if (selected)
      setSelected(d.runs.find((x: Run) => x.id === selected.id) || selected);
  }, [token, selected]);
  async function connect() {
    setError("");
    try {
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          runId: crypto.randomUUID(),
          ...(search.get("mission")
            ? { missionId: search.get("mission") }
            : {}),
          maxPriceTinybars: Math.round(Number(price) * 1e8),
          minConfidence: Number(confidence),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSelected(d.run);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/agent/recover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ runId: selected.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const receipt = selected?.receipt ? JSON.parse(selected.receipt) : null;
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">Autonomous buyer / testnet</span>
          <h1>Give your agent a line to reality.</h1>
          <p>Discover. Evaluate. Receive 402. Sign. Settle. Read.</p>
        </div>
        <Bot size={40} color="var(--lime)" />
      </div>
      <div className="integration-grid">
        <div className="integration">
          <div>
            <h3>World ID</h3>
            <p>
              {config?.world.ready
                ? `${config.world.environment} · ${config.world.environment === "production" ? "real credential verification" : "simulator credentials"}`
                : "App and RP configuration required"}
            </p>
          </div>
          <Fingerprint size={22} />
        </div>
        <div className="integration">
          <div>
            <h3>0G Private Computer</h3>
            <p>
              {config?.og.ready
                ? `${config.og.model} · ${config.og.trustMode} requested`
                : "API key and credits required"}
            </p>
          </div>
          <Cpu size={22} />
        </div>
        <div className="integration">
          <div>
            <h3>Hedera x402</h3>
            <p>
              {config?.hedera.ready
                ? "Testnet merchant configured · not connectivity checked"
                : "Merchant account required"}
            </p>
          </div>
          <Wallet size={22} />
        </div>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <section className="panel stack">
            <h2>Buyer policy</h2>
            <p>
              Enter the operator API token to authorize the server wallet. The
              token stays in this page’s memory. Once launched, the agent signs
              testnet payments within its configured caps without wallet popups.
            </p>
            <label>
              Operator API token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                placeholder="AGENT_API_TOKEN from your local environment"
              />
            </label>
            <div className="form-grid">
              <label>
                Maximum report price (HBAR)
                <input
                  type="number"
                  min="0.00000001"
                  max="1"
                  step="0.00000001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label>
                Minimum assessment confidence
                <select
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                >
                  <option value="0.8">80%</option>
                  <option value="0.9">90%</option>
                  <option value="0.95">95%</option>
                </select>
              </label>
            </div>
            {search.get("mission") && (
              <p className="muted wrap">
                Target mission: {search.get("mission")}
              </p>
            )}
            <div className="metrics">
              <div>
                <small>Total spending cap</small>
                <strong>
                  {budget ? hbar(budget.total) : "—"} <small>HBAR</small>
                </strong>
              </div>
              <div>
                <small>Settled or reserved</small>
                <strong>
                  {budget ? hbar(budget.spent) : "—"} <small>HBAR</small>
                </strong>
              </div>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="row">
              <Button disabled={busy || token.length < 32} onClick={run}>
                <Play size={14} />
                {busy ? "Agent executing…" : "Run autonomous purchase"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || token.length < 32}
                onClick={connect}
              >
                <RefreshCw size={14} />
                Load receipts
              </Button>
            </div>
            {!config?.agent.ready && (
              <p className="notice">
                Buyer wallet configuration is incomplete. No payment can be
                signed until a funded testnet account and server key are
                configured.
              </p>
            )}
            <p className="muted">
              Value policy ranks eligible reports by confidence / price. At
              least 150 seconds of mission validity must remain. Total budget
              includes unresolved payments.
            </p>
          </section>
          <section className="panel">
            <h2>Response trace</h2>
            {selected ? (
              <>
                <div className="row">
                  <span
                    className={`status status-${selected.status === "SETTLED" ? "verified" : "claimed"}`}
                  >
                    {selected.status}
                  </span>
                  <Link
                    className="text-link"
                    href={`/missions/${selected.missionId}`}
                  >
                    Open mission <ArrowUpRight size={13} />
                  </Link>
                </div>
                <div className="trace">
                  {JSON.parse(selected.trace).map(
                    (line: { at: number; message: string }, i: number) => (
                      <div className="trace-line" key={i}>
                        <time>{new Date(line.at).toLocaleTimeString()}</time>
                        <span>{line.message}</span>
                      </div>
                    ),
                  )}
                </div>
                {receipt && (
                  <dl className="receipt">
                    <dt>Transaction ID</dt>
                    <dd>
                      <a
                        href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(receipt.transaction)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {receipt.transaction} ↗
                      </a>
                    </dd>
                    <dt>Contributor payout</dt>
                    <dd>Not made · purchase receipt only</dd>
                  </dl>
                )}
                {selected.report && (
                  <>
                    <h3>Paid report response</h3>
                    <pre>
                      {JSON.stringify(JSON.parse(selected.report), null, 2)}
                    </pre>
                  </>
                )}
                {selected.status === "UNKNOWN" && (
                  <Button
                    variant="outline"
                    disabled={busy || token.length < 32}
                    onClick={recover}
                  >
                    Recover original paid response
                  </Button>
                )}
                {selected.status === "UNKNOWN" && (
                  <p className="notice">
                    Do not launch a second payment. The operator must reconcile
                    the existing signed transfer; its budget reservation remains
                    locked.
                  </p>
                )}
              </>
            ) : (
              <div className="empty">
                <Bot size={30} />
                <h3>No run selected</h3>
                <p>
                  Launch the agent to see actual HTTP and settlement events.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="panel">
            <h2>Purchase ledger</h2>
            {!runs.length ? (
              <p>
                No buyer runs loaded. Authenticate to read the private ledger.
              </p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="trace-line"
                  style={{
                    background: "transparent",
                    borderInline: 0,
                    borderBottom: 0,
                    color: "inherit",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <span>
                    {r.missionId.slice(0, 8)}
                    <small style={{ display: "block" }}>{r.status}</small>
                  </span>
                  <span>{hbar(r.amount)} HBAR</span>
                </button>
              ))
            )}
          </section>
          <section className="panel stack">
            <h2>The payment boundary</h2>
            <p>
              Reports stay locked until the facilitator verifies and settles the
              signed transfer. A client transaction ID or success flag is never
              authorization.
            </p>
            <pre>{`GET /api/reports/:id\n← 402 PAYMENT-REQUIRED\n\nSign Hedera transfer\nGET + PAYMENT-SIGNATURE\n← 200 PAYMENT-RESPONSE`}</pre>
            <Link href="/docs" className="text-link">
              Read the protocol <ArrowUpRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
export default function Agent() {
  return (
    <Suspense fallback={<div className="loading">Loading buyer console…</div>}>
      <Console />
    </Suspense>
  );
}
