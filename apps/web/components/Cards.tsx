import type {
  HeartbeatStatus,
  PayrollStream,
  Receipt,
  Successor,
  TokenBalance,
  Vault,
} from "@ephor/shared/types";
import { usd, num, secs } from "@/lib/format";
import { short } from "@/lib/config";

export function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-ink-border bg-ink-panel/80 p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {hint && <span className="text-right text-[11px] text-slate-500">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

const HB: Record<HeartbeatStatus["state"], { c: string; label: string; bar: string }> = {
  healthy: { c: "text-alive", label: "Healthy", bar: "bg-alive" },
  "due-soon": { c: "text-notice", label: "Due soon", bar: "bg-notice" },
  overdue: { c: "text-handover", label: "Overdue", bar: "bg-handover" },
  silent: { c: "text-sweep", label: "Silent", bar: "bg-sweep" },
};

export function HeartbeatHero({
  hb,
  onHeartbeat,
  busy,
}: {
  hb: HeartbeatStatus;
  onHeartbeat?: () => void;
  busy?: boolean;
}) {
  const meta = HB[hb.state] ?? HB.healthy;
  const total = num(hb.windowBlocks) || 1;
  const remaining = num(hb.blocksRemaining);
  const pct = Math.max(2, Math.min(100, (remaining / total) * 100));
  return (
    <Panel className="relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                hb.state === "healthy" ? "heartbeat-dot bg-alive" : "bg-slate-500"
              }`}
            />
            Founder heartbeat
          </div>
          <div className={`mt-1 text-3xl font-semibold ${meta.c}`}>{meta.label}</div>
          <div className="mt-1 text-sm text-slate-400">
            {remaining > 0 ? (
              <>
                {hb.blocksRemaining.toString()} blocks to deadline · {secs(hb.blocksRemaining, hb.secondsPerBlock)}
              </>
            ) : (
              "Window lapsed — succession can proceed"
            )}
          </div>
        </div>
        <button
          onClick={onHeartbeat}
          disabled={!onHeartbeat || busy}
          className="rounded-xl border border-alive/40 bg-alive/10 px-5 py-3 text-sm font-semibold text-alive transition hover:bg-alive/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Sending…" : "❤ Heartbeat — I'm here"}
        </button>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-raised">
        <div className={`h-full rounded-full ${meta.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-slate-500">
        <span>last {hb.lastHeartbeatBlock.toString()}</span>
        <span>now {hb.currentBlock.toString()}</span>
        <span>deadline {hb.deadlineBlock.toString()}</span>
      </div>
    </Panel>
  );
}

export function PayrollCard({ payroll }: { payroll: PayrollStream }) {
  return (
    <Panel title="Payroll" hint="reserve-funded · runs during succession">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-alive/15 px-2.5 py-1 text-[11px] font-semibold text-alive">Never misses</span>
        <span className="text-xs text-slate-500">
          {payroll.recipients.length} recipients · {payroll.asset}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Stat label="Reserve" value={`$${usd(payroll.reserveBalance)}`} sub={`${payroll.reserveFundedPeriods} periods funded`} />
        <Stat label="Per period" value={`$${usd(payroll.totalPerPeriod)}`} sub={`every ${payroll.periodBlocks.toString()} blocks`} />
      </div>
      <div className="mt-3 font-mono text-[11px] text-slate-500">
        next run @ {payroll.nextRunBlock.toString()}
        {payroll.lastRunBlock ? ` · last @ ${payroll.lastRunBlock.toString()}` : ""}
      </div>
    </Panel>
  );
}

export function SuccessorsCard({ successors }: { successors: Successor[] }) {
  return (
    <Panel title="Successors" hint="capped operational role at Handover">
      <div className="space-y-3">
        {successors.map((s) => (
          <div key={s.index} className="rounded-xl border border-ink-border bg-ink-raised/50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-100">{s.label}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s.active ? "bg-handover/15 text-handover" : "bg-slate-700/40 text-slate-400"
                }`}
              >
                {s.active ? "active" : "standby"}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500">{short(s.wallet)}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniStat label="per-tx" value={`$${usd(s.caps.perTxCap)}`} />
              <MiniStat label="daily" value={`$${usd(s.caps.dailyCap)}`} />
              <MiniStat label="split" value={`${(s.splitBps / 100).toFixed(0)}%`} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

export function BalancesCard({ vault, balances }: { vault: Vault; balances: TokenBalance[] }) {
  return (
    <Panel title="Treasury" hint="protected balance">
      <div className="space-y-2">
        {balances.map((b) => (
          <div key={b.asset} className="flex items-center justify-between rounded-lg bg-ink-raised/50 px-3 py-2">
            <span className="text-sm text-slate-300">{b.asset}</span>
            <span className="font-mono text-sm text-slate-100">${usd(b.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Stat label="Payroll reserve" value={`$${usd(vault.payrollReserve)}`} />
        <Stat label="Protected" value={`$${usd(vault.totalProtected)}`} />
      </div>
    </Panel>
  );
}

const KIND_COLOR: Record<string, string> = {
  Heartbeat: "text-alive",
  ContinuityNotice: "text-notice",
  HandoverActivated: "text-handover",
  PayrollPaid: "text-alive",
  SuccessorSpend: "text-handover",
  Split: "text-brand",
  SweepExecuted: "text-sweep",
  Swap: "text-brand",
  CrossChainBurn: "text-brand",
  CrossChainMint: "text-brand",
  YieldPark: "text-brand",
  StageCancelled: "text-alive",
  GuardianVeto: "text-sweep",
  Unfrozen: "text-alive",
};

export function ReceiptsCard({ receipts }: { receipts: Receipt[] }) {
  return (
    <Panel title="Activity" hint="every transition is evented">
      <div className="max-h-72 space-y-2 overflow-auto pr-1">
        {receipts.length === 0 && <div className="text-sm text-slate-500">No events yet.</div>}
        {receipts.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 border-b border-ink-border/60 pb-2 last:border-0">
            <div>
              <div className={`text-xs font-semibold ${KIND_COLOR[r.kind] ?? "text-slate-300"}`}>{r.kind}</div>
              <div className="text-xs text-slate-400">{r.memo}</div>
            </div>
            <div className="whitespace-nowrap text-right font-mono text-[10px] text-slate-500">
              #{r.blockNumber.toString()}
              {r.explorerUrl && (
                <a href={r.explorerUrl} target="_blank" rel="noreferrer" className="block text-brand hover:underline">
                  tx ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
