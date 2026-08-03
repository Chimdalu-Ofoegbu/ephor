import type { StageWindow, StageId } from "@ephor/shared/types";

const HUE: Record<number, { ring: string; text: string; bg: string; bar: string }> = {
  0: { ring: "ring-alive/60", text: "text-alive", bg: "from-alive/15", bar: "bg-alive" },
  1: { ring: "ring-notice/60", text: "text-notice", bg: "from-notice/15", bar: "bg-notice" },
  2: { ring: "ring-handover/60", text: "text-handover", bg: "from-handover/15", bar: "bg-handover" },
  3: { ring: "ring-sweep/60", text: "text-sweep", bg: "from-sweep/15", bar: "bg-sweep" },
};

const STATUS: Record<StageWindow["status"], string> = {
  inactive: "—",
  pending: "ready",
  active: "in progress",
  executed: "done",
  cancelled: "rewound",
};

export function Staircase({ stages, current }: { stages: StageWindow[]; current: StageId }) {
  return (
    <div className="grid grid-cols-4 items-end gap-3">
      {stages.map((s) => {
        const hue = HUE[s.id] ?? HUE[0];
        const isCurrent = s.id === current;
        const done = s.status === "executed";
        const dim = s.status === "inactive" || s.status === "cancelled";
        const window = BigInt(s.challengeWindowBlocks ?? 0);
        return (
          <div
            key={s.id}
            style={{ marginTop: (3 - s.id) * 26 }}
            className={`rounded-xl border border-ink-border bg-gradient-to-b ${hue.bg} to-transparent p-4 transition
              ${isCurrent ? `ring-2 ${hue.ring} shadow-glow` : ""} ${dim ? "opacity-45" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className={`font-mono text-xs ${hue.text}`}>{s.id}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">{STATUS[s.status]}</span>
            </div>
            <div className={`mt-1 text-lg font-semibold ${isCurrent ? hue.text : "text-slate-100"}`}>{s.name}</div>
            <p className="mt-1 min-h-[2.75rem] text-xs leading-snug text-slate-400">{s.summary}</p>
            <div className="mt-2 font-mono text-[11px] text-slate-500">
              {window > 0n ? `${window.toString()}-blk window` : " "}
            </div>
            <div className={`mt-1 h-1 rounded ${done ? hue.bar : "bg-ink-border"}`} />
          </div>
        );
      })}
    </div>
  );
}
