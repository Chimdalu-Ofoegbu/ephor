"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getScenario, scenarioOrder } from "@ephor/shared/scenarios";
import type { EphorSnapshot, ScenarioId } from "@ephor/shared/types";
import { Staircase } from "./Staircase";
import { HeartbeatHero, PayrollCard, SuccessorsCard, BalancesCard, ReceiptsCard, Panel } from "./Cards";
import { DEPLOYMENT, short, addressUrl, type Deployment } from "@/lib/config";
import { parse } from "@/lib/serial";

type Mode = "mock" | "live";
type Action = "heartbeat" | "advance" | "payroll";

const SCENARIO_LABELS: Record<ScenarioId, string> = {
  healthy: "1 · Healthy",
  "silence-begins": "2 · Silence",
  "stage1-notice": "3 · Notice",
  "stage2-handover": "4 · Handover",
  "stage3-sweep": "5 · Sweep",
  "owner-returns": "6 · Rewind",
};

export function Dashboard({ initialMode, deployment }: { initialMode: Mode; deployment: Deployment }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [sid, setSid] = useState<ScenarioId>("healthy");
  const [live, setLive] = useState<EphorSnapshot | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inFlight = useRef(false); // synchronous re-entry guard: `busy` state updates a tick too late

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 240));
      setLive(parse(text) as EphorSnapshot);
      setLiveErr(null);
    } catch (e) {
      setLiveErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    let stop = false;
    const tick = () => {
      if (!stop) void fetchLive();
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [mode, fetchLive]);

  const scenario = mode === "mock" ? getScenario(sid) : null;
  const snap: EphorSnapshot | null = mode === "mock" ? scenario!.snapshot : live;

  const act = useCallback(
    async (action: Action) => {
      if (mode === "mock") {
        setSid(action === "heartbeat" ? "owner-returns" : action === "advance" ? "stage1-notice" : "stage2-handover");
        return;
      }
      if (inFlight.current) return; // one tx at a time — two writes from the shared key would collide on nonce
      inFlight.current = true;
      setBusy(true);
      setMsg(`Sending ${action}…`);
      try {
        const r = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const body = await r.text();
        if (!r.ok) {
          setMsg(`${action} rejected — ${body}`);
        } else {
          const hash = (JSON.parse(body).hash as string) ?? "";
          setMsg(`${action} sent · ${hash.slice(0, 12)}…`);
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight.current = false;
        setBusy(false);
        setTimeout(() => void fetchLive(), 1200);
      }
    },
    [mode, fetchLive],
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight">Ephor</span>
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">Helios Robotics</span>
          </div>
          <div className="text-sm text-slate-400">
            Business continuity as programmable settlement — <span className="text-slate-300">the state never stops.</span>
          </div>
        </div>
        <div className="flex rounded-lg border border-ink-border bg-ink-panel p-0.5 text-xs">
          {(["mock", "live"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                mode === m
                  ? m === "live"
                    ? "bg-alive/20 text-alive"
                    : "bg-brand/20 text-brand"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "live" ? "● Live · Arc" : "Mock"}
            </button>
          ))}
        </div>
      </header>

      {mode === "mock" && (
        <div className="mt-6 rounded-2xl border border-ink-border bg-ink-panel/60 p-3">
          <div className="flex flex-wrap gap-2">
            {scenarioOrder.map((id) => (
              <button
                key={id}
                onClick={() => setSid(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  sid === id ? "bg-brand/20 text-brand ring-1 ring-brand/40" : "bg-ink-raised/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {SCENARIO_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-sm text-slate-400">{scenario!.caption}</p>
        </div>
      )}

      {mode === "live" && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-border bg-ink-panel/60 p-3">
          <span className="text-xs font-medium text-slate-400">Live controls</span>
          <button onClick={() => act("heartbeat")} disabled={busy} className="rounded-lg border border-alive/40 bg-alive/10 px-3 py-1.5 text-xs font-semibold text-alive transition hover:bg-alive/20 disabled:opacity-50">
            ❤ Heartbeat
          </button>
          <button onClick={() => act("advance")} disabled={busy} className="rounded-lg border border-notice/40 bg-notice/10 px-3 py-1.5 text-xs font-semibold text-notice transition hover:bg-notice/20 disabled:opacity-50">
            Advance →
          </button>
          <button onClick={() => act("payroll")} disabled={busy} className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 disabled:opacity-50">
            Run payroll
          </button>
          {msg && <span className="ml-1 font-mono text-[11px] text-slate-400">{msg}</span>}
          <span className="ml-auto text-[11px] text-slate-500">owner-signed · server-side</span>
        </div>
      )}

      {mode === "live" && liveErr && (
        <div className="mt-4 rounded-xl border border-sweep/40 bg-sweep/10 p-3 text-sm text-sweep">Live read error: {liveErr}</div>
      )}

      {!snap ? (
        <div className="mt-16 text-center text-slate-500">{mode === "live" ? "Connecting to Arc…" : "Loading…"}</div>
      ) : (
        <div className="mt-6 space-y-6">
          <HeartbeatHero hb={snap.heartbeat} onHeartbeat={() => act("heartbeat")} busy={busy} />
          <Panel title="Succession staircase" hint="advances only as each block window lapses · one heartbeat rewinds it">
            <Staircase stages={snap.stages} current={snap.vault.currentStage} />
          </Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <PayrollCard payroll={snap.payroll} />
            <SuccessorsCard successors={snap.successors} />
            <BalancesCard vault={snap.vault} balances={snap.balances} />
            <ReceiptsCard receipts={snap.receipts} />
          </div>
        </div>
      )}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-ink-border pt-5 text-xs text-slate-500">
        <span>{deployment.network} · chain {deployment.chainId} · USDC-as-gas</span>
        <div className="flex gap-4 font-mono">
          <a className="hover:text-brand" href={addressUrl(DEPLOYMENT.vault)} target="_blank" rel="noreferrer">
            vault {short(DEPLOYMENT.vault)} ↗
          </a>
          <a className="hover:text-brand" href={addressUrl(DEPLOYMENT.plan)} target="_blank" rel="noreferrer">
            plan {short(DEPLOYMENT.plan)} ↗
          </a>
        </div>
      </footer>
    </main>
  );
}
