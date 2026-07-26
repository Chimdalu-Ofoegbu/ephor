/**
 * The six demo scenarios — deterministic snapshots for one-keypress switching in
 * the design session's dev panel (shift+D) and for camera takes.
 *
 * The arc: healthy pulse → silence → notice → capped handover (payroll still paying)
 * → policy sweep with per-leg receipts → and the money-shot, owner-returns, which
 * rewinds the whole staircase. Every number ties back to fixtures.ts.
 */
import { ARC, txUrl } from "./addresses";
import {
  ACTORS,
  ALLOCATIONS,
  COMPANY,
  LEGS,
  PAYROLL_RECIPIENTS,
  TX,
  makeBalances,
  makeSuccessors,
  share,
} from "./fixtures";
import type {
  HeartbeatState,
  HeartbeatStatus,
  PayrollStream,
  Plan,
  Receipt,
  ReceiptKind,
  Scenario,
  ScenarioId,
  StageId,
  StageName,
  StageStatus,
  StageWindow,
  Vault,
} from "./types";

// ── builders ────────────────────────────────────────────────────────────────

function makeHeartbeat(currentBlock: bigint, lastBeat: bigint, state: HeartbeatState): HeartbeatStatus {
  const deadlineBlock = lastBeat + COMPANY.windowBlocks;
  const blocksRemaining = deadlineBlock > currentBlock ? deadlineBlock - currentBlock : 0n;
  return {
    lastHeartbeatBlock: lastBeat,
    windowBlocks: COMPANY.windowBlocks,
    deadlineBlock,
    currentBlock,
    blocksRemaining,
    state,
    secondsPerBlock: ARC.secondsPerBlock,
  };
}

interface StageOpts {
  opensAtBlock?: bigint | null;
  challengeWindowBlocks?: bigint;
  executeAtBlock?: bigint | null;
  enteredAtBlock?: bigint | null;
  summary?: string;
}

function stage(id: StageId, name: StageName, status: StageStatus, opts: StageOpts = {}): StageWindow {
  return {
    id,
    name,
    status,
    opensAtBlock: opts.opensAtBlock ?? null,
    challengeWindowBlocks: opts.challengeWindowBlocks ?? 0n,
    executeAtBlock: opts.executeAtBlock ?? null,
    enteredAtBlock: opts.enteredAtBlock ?? null,
    summary: opts.summary ?? "",
  };
}

function makePayroll(lastRun: bigint, swept: boolean): PayrollStream {
  const reserveBalance = swept ? COMPANY.reserveUsdc + share(2000) : COMPANY.reserveUsdc;
  return {
    asset: "USDC",
    periodBlocks: COMPANY.payrollPeriodBlocks,
    nextRunBlock: lastRun + COMPANY.payrollPeriodBlocks,
    lastRunBlock: lastRun,
    recipients: PAYROLL_RECIPIENTS,
    totalPerPeriod: COMPANY.perPeriodUsdc,
    reserveFundedPeriods: Number(reserveBalance / COMPANY.perPeriodUsdc),
    reserveBalance,
    runsDuringSuccession: true,
  };
}

function makePlan(active: boolean, successorsActive: [boolean, boolean]): Plan {
  return {
    windowBlocks: COMPANY.windowBlocks,
    stageChallengeBlocks: COMPANY.stageChallengeBlocks,
    successors: makeSuccessors(successorsActive),
    allocations: ALLOCATIONS,
    payroll: {
      asset: "USDC",
      periodBlocks: COMPANY.payrollPeriodBlocks,
      reservePeriods: COMPANY.reservePeriods,
      recipients: PAYROLL_RECIPIENTS,
    },
    legs: LEGS,
    guardian: {
      guardians: [ACTORS.guardian1, ACTORS.guardian2, ACTORS.guardian3],
      threshold: 2,
    },
    vaultAddress: ACTORS.vault,
    planAddress: ACTORS.plan,
    owner: ACTORS.operator,
    createdAtBlock: 999_800n,
    active,
  };
}

function makeVault(currentStage: StageId, swept: boolean, paused = false): Vault {
  const balances = makeBalances(swept);
  return {
    address: ACTORS.vault,
    owner: ACTORS.operator,
    balances,
    payrollReserve: swept ? COMPANY.reserveUsdc + share(2000) : COMPANY.reserveUsdc,
    totalProtected: balances.reduce((sum, b) => sum + b.amount, 0n),
    paused,
    currentStage,
  };
}

interface ReceiptOpts {
  asset?: Receipt["asset"];
  amount?: bigint;
  from?: Receipt["from"];
  to?: Receipt["to"];
  stage?: StageId;
  txHash?: Receipt["txHash"];
  destinationExplorerUrl?: string;
}

function receipt(
  id: string,
  kind: ReceiptKind,
  blockNumber: bigint,
  memo: string,
  opts: ReceiptOpts = {},
): Receipt {
  const txHash = opts.txHash ?? TX(id);
  return {
    id,
    kind,
    blockNumber,
    txHash,
    memo,
    explorerUrl: txUrl(txHash),
    asset: opts.asset,
    amount: opts.amount,
    from: opts.from,
    to: opts.to,
    stage: opts.stage,
    destinationExplorerUrl: opts.destinationExplorerUrl,
  };
}

const PAY = COMPANY.perPeriodUsdc;

/** A couple of routine payroll receipts, ending at `lastRun`. */
function payrollReceipts(lastRun: bigint): Receipt[] {
  return [
    receipt("pay-b", "PayrollPaid", lastRun, "Payroll paid — 5 people, 40,000 USDC", {
      asset: "USDC",
      amount: PAY,
      from: ACTORS.vault,
      stage: 0,
    }),
    receipt("pay-a", "PayrollPaid", lastRun - COMPANY.payrollPeriodBlocks, "Payroll paid — 5 people, 40,000 USDC", {
      asset: "USDC",
      amount: PAY,
      from: ACTORS.vault,
      stage: 0,
    }),
  ];
}

// ── the six beats ─────────────────────────────────────────────────────────────

// 1. Healthy — owner live, heartbeat calm, payroll ticking.
const healthy: Scenario = {
  id: "healthy",
  title: "Healthy",
  caption: "The founder is live. The heartbeat is calm and payroll is ticking.",
  snapshot: {
    vault: makeVault(0, false),
    plan: makePlan(true, [false, false]),
    heartbeat: makeHeartbeat(1_000_000n, 999_950n, "healthy"),
    stages: [
      stage(0, "Active", "active", { summary: "Owner is live. Heartbeat healthy." }),
      stage(1, "Notice", "inactive", { challengeWindowBlocks: 100n }),
      stage(2, "Handover", "inactive", { challengeWindowBlocks: 100n }),
      stage(3, "Sweep", "inactive", { challengeWindowBlocks: 50n }),
    ],
    successors: makeSuccessors([false, false]),
    payroll: makePayroll(999_940n, false),
    receipts: payrollReceipts(999_940n),
    balances: makeBalances(false),
  },
};

// 2. Silence begins — the heartbeat window has lapsed; Notice is callable, nothing moved.
const silenceBegins: Scenario = {
  id: "silence-begins",
  title: "Silence begins",
  caption: "The window lapsed. A Notice can now be called — but nothing has moved.",
  snapshot: {
    vault: makeVault(0, false),
    plan: makePlan(true, [false, false]),
    heartbeat: makeHeartbeat(1_000_205n, 999_950n, "overdue"),
    stages: [
      stage(0, "Active", "active", { summary: "Heartbeat window lapsed. One heartbeat still cancels instantly." }),
      stage(1, "Notice", "pending", {
        opensAtBlock: 1_000_150n,
        challengeWindowBlocks: 100n,
        summary: "Callable now: emits a public ContinuityNotice. Nothing moves.",
      }),
      stage(2, "Handover", "inactive", { challengeWindowBlocks: 100n }),
      stage(3, "Sweep", "inactive", { challengeWindowBlocks: 50n }),
    ],
    successors: makeSuccessors([false, false]),
    payroll: makePayroll(1_000_120n, false),
    receipts: payrollReceipts(1_000_120n),
    balances: makeBalances(false),
  },
};

// 3. Stage 1 — Notice served, challenge window A open.
const stage1Notice: Scenario = {
  id: "stage1-notice",
  title: "Stage 1 — Notice",
  caption: "A public notice is served. Challenge window A is open. Nothing moves.",
  snapshot: {
    vault: makeVault(1, false),
    plan: makePlan(true, [false, false]),
    heartbeat: makeHeartbeat(1_000_210n, 999_950n, "silent"),
    stages: [
      stage(0, "Active", "inactive", { summary: "Owner silent." }),
      stage(1, "Notice", "active", {
        opensAtBlock: 1_000_150n,
        enteredAtBlock: 1_000_206n,
        challengeWindowBlocks: 100n,
        executeAtBlock: 1_000_306n,
        summary: "Public notice served. One heartbeat cancels everything and resets.",
      }),
      stage(2, "Handover", "inactive", {
        opensAtBlock: 1_000_306n,
        challengeWindowBlocks: 100n,
        summary: "Opens when window A lapses: capped handover to the COO.",
      }),
      stage(3, "Sweep", "inactive", { challengeWindowBlocks: 50n }),
    ],
    successors: makeSuccessors([false, false]),
    payroll: makePayroll(1_000_120n, false),
    receipts: [
      receipt("notice-1", "ContinuityNotice", 1_000_206n, "ContinuityNotice emitted — challenge window A open (100 blocks).", {
        stage: 1,
      }),
      ...payrollReceipts(1_000_120n),
    ],
    balances: makeBalances(false),
  },
};

// 4. Stage 2 — Capped handover. Successor #1 pays a vendor within caps; payroll still runs.
const stage2Handover: Scenario = {
  id: "stage2-handover",
  title: "Stage 2 — Handover",
  caption: "The COO gets a capped role and pays a vendor — while payroll never misses.",
  snapshot: {
    vault: makeVault(2, false),
    plan: makePlan(true, [true, false]),
    heartbeat: makeHeartbeat(1_000_320n, 999_950n, "silent"),
    stages: [
      stage(0, "Active", "inactive", { summary: "Owner silent." }),
      stage(1, "Notice", "executed", { enteredAtBlock: 1_000_206n, summary: "Notice served." }),
      stage(2, "Handover", "active", {
        opensAtBlock: 1_000_306n,
        enteredAtBlock: 1_000_307n,
        challengeWindowBlocks: 100n,
        executeAtBlock: 1_000_407n,
        summary: "COO holds a capped role (≤25k/tx, ≤50k/day, allowlisted payees). One heartbeat still rewinds it.",
      }),
      stage(3, "Sweep", "inactive", {
        opensAtBlock: 1_000_407n,
        challengeWindowBlocks: 50n,
        summary: "Opens when window B lapses: the policy sweep.",
      }),
    ],
    successors: makeSuccessors([true, false]),
    payroll: makePayroll(1_000_240n, false),
    receipts: [
      receipt("spend-1", "SuccessorSpend", 1_000_315n, "COO paid allowlisted vendor 18,000 USDC (within 25k/tx cap).", {
        asset: "USDC",
        amount: 18_000_000n,
        from: ACTORS.vault,
        to: ACTORS.vendor,
        stage: 2,
      }),
      receipt("handover-1", "HandoverActivated", 1_000_307n, "Handover activated — COO gains a capped operational role.", {
        stage: 2,
        to: ACTORS.successor1,
      }),
      receipt("pay-hand", "PayrollPaid", 1_000_240n, "Payroll paid — 5 people, 40,000 USDC (from reserve, mid-succession).", {
        asset: "USDC",
        amount: PAY,
        from: ACTORS.vault,
        stage: 2,
      }),
      receipt("notice-1", "ContinuityNotice", 1_000_206n, "ContinuityNotice emitted — challenge window A.", { stage: 1 }),
    ],
    balances: makeBalances(false),
  },
};

// 5. Stage 3 — Policy sweep with per-leg receipts.
const stage3Sweep: Scenario = {
  id: "stage3-sweep",
  title: "Stage 3 — Sweep",
  caption: "The policy settles as one flow: splits, an EURC swap, a Base Sepolia leg, a USYC park.",
  snapshot: {
    vault: makeVault(3, true),
    plan: makePlan(true, [true, false]),
    heartbeat: makeHeartbeat(1_000_460n, 999_950n, "silent"),
    stages: [
      stage(0, "Active", "inactive", { summary: "Owner silent." }),
      stage(1, "Notice", "executed", { enteredAtBlock: 1_000_206n, summary: "Notice served." }),
      stage(2, "Handover", "executed", { enteredAtBlock: 1_000_307n, summary: "Handover complete." }),
      stage(3, "Sweep", "executed", {
        opensAtBlock: 1_000_407n,
        enteredAtBlock: 1_000_408n,
        challengeWindowBlocks: 50n,
        executeAtBlock: 1_000_458n,
        summary: "Policy sweep executed. Reserve funded 7 periods; residual parked in USYC.",
      }),
    ],
    successors: makeSuccessors([true, false]),
    payroll: makePayroll(1_000_360n, true),
    receipts: [
      receipt("park-1", "YieldPark", 1_000_458n, `Residual parked in USYC — ${fmt(share(500))} USDC.`, {
        asset: "USYC",
        amount: share(500),
        to: ACTORS.vault,
        stage: 3,
      }),
      receipt("cctp-mint-1", "CrossChainMint", 1_000_452n, `CCTP mint on Base Sepolia — ${fmt(share(1000))} USDC to CFO.`, {
        asset: "USDC",
        amount: share(1000),
        to: ACTORS.successor2,
        stage: 3,
        destinationExplorerUrl: "https://sepolia.basescan.org/tx/0xcctp",
      }),
      receipt("cctp-burn-1", "CrossChainBurn", 1_000_450n, `CCTP burn on Arc — ${fmt(share(1000))} USDC → Base Sepolia (domain 6).`, {
        asset: "USDC",
        amount: share(1000),
        from: ACTORS.vault,
        stage: 3,
      }),
      receipt("swap-1", "Swap", 1_000_446n, `App Kit Swap — ${fmt(share(1500))} USDC → EURC operating buffer.`, {
        asset: "EURC",
        amount: share(1500),
        to: ACTORS.successor1,
        stage: 3,
      }),
      receipt("split-reserve", "Split", 1_000_442n, `Payroll reserve topped up — ${fmt(share(2000))} USDC.`, {
        asset: "USDC",
        amount: share(2000),
        to: ACTORS.vault,
        stage: 3,
      }),
      receipt("split-s2", "Split", 1_000_440n, `Split to CFO — ${fmt(share(2000))} USDC (20%).`, {
        asset: "USDC",
        amount: share(2000),
        to: ACTORS.successor2,
        stage: 3,
      }),
      receipt("split-s1", "Split", 1_000_438n, `Split to COO — ${fmt(share(3000))} USDC (30%).`, {
        asset: "USDC",
        amount: share(3000),
        to: ACTORS.successor1,
        stage: 3,
      }),
      receipt("pay-sweep", "PayrollPaid", 1_000_360n, "Payroll paid — 5 people, 40,000 USDC (never interrupted).", {
        asset: "USDC",
        amount: PAY,
        from: ACTORS.vault,
        stage: 2,
      }),
    ],
    balances: makeBalances(true),
  },
};

// 6. Owner returns — a heartbeat during stage 2 rewinds the whole staircase.
const ownerReturns: Scenario = {
  id: "owner-returns",
  title: "Owner returns",
  caption: "One heartbeat during handover — and the staircase rewinds. Sole control restored.",
  snapshot: {
    vault: makeVault(0, false),
    plan: makePlan(true, [false, false]),
    heartbeat: makeHeartbeat(1_000_330n, 1_000_330n, "healthy"),
    stages: [
      stage(0, "Active", "active", { summary: "Welcome back. Sole control restored." }),
      stage(1, "Notice", "cancelled", { enteredAtBlock: 1_000_206n, summary: "Rewound by owner heartbeat." }),
      stage(2, "Handover", "cancelled", { enteredAtBlock: 1_000_307n, summary: "Rewound — COO's capped role revoked." }),
      stage(3, "Sweep", "inactive", { challengeWindowBlocks: 50n }),
    ],
    successors: makeSuccessors([false, false]),
    payroll: makePayroll(1_000_240n, false),
    receipts: [
      receipt("cancel-1", "StageCancelled", 1_000_330n, "Owner heartbeat — succession rewound at stage 2. Sole control restored.", {
        stage: 0,
        from: ACTORS.operator,
      }),
      receipt("pay-hand", "PayrollPaid", 1_000_240n, "Payroll paid — 5 people, 40,000 USDC (never interrupted).", {
        asset: "USDC",
        amount: PAY,
        from: ACTORS.vault,
        stage: 2,
      }),
      receipt("handover-1", "HandoverActivated", 1_000_307n, "Handover activated — COO gained a capped role.", {
        stage: 2,
        to: ACTORS.successor1,
      }),
      receipt("notice-1", "ContinuityNotice", 1_000_206n, "ContinuityNotice emitted — challenge window A.", { stage: 1 }),
    ],
    balances: makeBalances(false),
  },
};

/** Human-readable USDC (6-dec) for receipt memos. */
function fmt(amount: bigint): string {
  return (Number(amount) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const scenarios: Record<ScenarioId, Scenario> = {
  healthy,
  "silence-begins": silenceBegins,
  "stage1-notice": stage1Notice,
  "stage2-handover": stage2Handover,
  "stage3-sweep": stage3Sweep,
  "owner-returns": ownerReturns,
};

/** Ordered list for the dev panel and camera walk-through. */
export const scenarioOrder: ScenarioId[] = [
  "healthy",
  "silence-begins",
  "stage1-notice",
  "stage2-handover",
  "stage3-sweep",
  "owner-returns",
];

export function getScenario(id: ScenarioId): Scenario {
  return scenarios[id];
}
