/**
 * Server-side live snapshot: reads the deployed Ephor contracts on Arc via viem and
 * assembles an EphorSnapshot (the same shape the mock scenarios use). Imported only by
 * the /api/snapshot route — never bundled to the client.
 *
 * All reads are batched into ONE Multicall3 eth_call (Arc has Multicall3 at the canonical
 * address), so a poll is just 2 RPC requests — well under the public RPC's rate limit.
 */
import { createPublicClient, http, parseAbi, parseEventLogs, type Address } from "viem";
import { DEPLOYMENT, txUrl } from "./config";
import { ARC_ADDRESSES } from "@ephor/shared/addresses";
import type {
  EphorSnapshot,
  HeartbeatState,
  HeartbeatStatus,
  PayrollRecipient,
  PayrollStream,
  Receipt,
  StageId,
  StageName,
  StageStatus,
  StageWindow,
  Successor,
  TokenBalance,
  Vault,
} from "@ephor/shared/types";

const client = createPublicClient({ transport: http(DEPLOYMENT.rpcUrl) });
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
const SECONDS_PER_BLOCK = 0.5;

const PLAN_ABI = parseAbi([
  "function owner() view returns (address)",
  "function stage() view returns (uint8)",
  "function lastHeartbeatBlock() view returns (uint64)",
  "function windowBlocks() view returns (uint64)",
  "function challengeBlocks(uint256) view returns (uint64)",
  "function stageEnteredBlock() view returns (uint64)",
  "function swept() view returns (bool)",
  "function frozen() view returns (bool)",
  "function deadlineBlock() view returns (uint64)",
  "function nextAdvanceBlock() view returns (uint256)",
]);

const VAULT_ABI = parseAbi([
  "function payrollReserve() view returns (uint256)",
  "function nextPayrollBlock() view returns (uint64)",
  "function payrollPeriodBlocks() view returns (uint64)",
  "function successors(uint256) view returns (address, uint256, uint256, uint16)",
  "function payroll(uint256) view returns (address, uint256)",
]);

const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// Events emitted across the three contracts. Decoded from one getLogs into the activity feed.
// Enum params (Stage) are uint8 on the wire, so their canonical signatures use uint8.
const EVENT_ABI = parseAbi([
  "event Heartbeat(address indexed owner, uint64 atBlock, uint64 deadlineBlock)",
  "event StageAdvanced(uint8 indexed from, uint8 indexed to, uint64 atBlock)",
  "event SuccessionCancelled(uint8 indexed fromStage, uint64 atBlock)",
  "event Frozen(uint64 atBlock)",
  "event Unfrozen(uint64 atBlock)",
  "event PayrollPaid(address indexed payee, uint256 amount, uint64 atBlock)",
  "event SuccessorSpend(address indexed successor, address indexed payee, uint256 amount)",
  "event Split(address indexed recipient, uint256 amount, bool reserveTopUp)",
  "event ContinuitySettlementExecuted(uint256 distributable, uint64 atBlock)",
  "event SettlementEscrowed(address indexed recipient, uint256 amount)",
  "event GuardianVote(address indexed guardian, bool freeze, uint256 indexed round, uint8 votes)",
]);

const plan = DEPLOYMENT.plan as Address;
const vaultAddr = DEPLOYMENT.vault as Address;
const guardianAddr = DEPLOYMENT.guardian as Address;

// Arc caps eth_getLogs at a 10k-block range (~85 min at ~0.5s/block). A live-driven demo generates
// its events in real time, so the most recent window is exactly what the feed should show.
const BLOCK_LOOKBACK = 9000n;
const MAX_RECEIPTS = 40;

/** 6-dec base units → human dollars, pure-bigint (no float drift). */
function fmt6(x: bigint): string {
  const neg = x < 0n;
  const v = neg ? -x : x;
  const whole = (v / 1_000_000n).toString();
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const planCall = (functionName: string, args: unknown[] = []) => ({ address: plan, abi: PLAN_ABI, functionName, args });
const vaultCall = (functionName: string, args: unknown[] = []) => ({ address: vaultAddr, abi: VAULT_ABI, functionName, args });
const balCall = (address: Address) => ({ address, abi: ERC20_ABI, functionName: "balanceOf", args: [vaultAddr] });

function hbState(stage: number, swept: boolean, current: bigint, deadline: bigint, windowBlocks: bigint): HeartbeatState {
  if (swept || stage > 0) return "silent";
  if (current > deadline) return "overdue";
  return deadline - current <= windowBlocks / 5n ? "due-soon" : "healthy";
}

function buildStages(
  stage: number,
  current: bigint,
  windows: [bigint, bigint, bigint, bigint], // [heartbeat, c0, c1, c2]
  enteredBlk: bigint,
  swept: boolean,
  nextAdvance: bigint,
): StageWindow[] {
  const names: StageName[] = ["Active", "Notice", "Handover", "Sweep"];
  const summaries = [
    "Owner live. One heartbeat keeps it here.",
    "Continuity notice served — challenge window A.",
    "Capped handover — a successor gains a limited operational role.",
    "Terminal settlement — exact splits, receipts, optional legs.",
  ];
  return ([0, 1, 2, 3] as StageId[]).map((id) => {
    let status: StageStatus;
    if (swept && id === 3) status = "executed";
    else if (id < stage) status = "executed";
    else if (id === stage) status = "active";
    else if (id === stage + 1 && current >= nextAdvance) status = "pending";
    else status = "inactive";
    return {
      id,
      name: names[id],
      status,
      opensAtBlock: null,
      challengeWindowBlocks: id === 0 ? 0n : windows[id],
      executeAtBlock: null,
      enteredAtBlock: id === stage ? enteredBlk : null,
      summary: summaries[id],
    };
  });
}

/**
 * Decode the last ~BLOCK_LOOKBACK blocks of contract events into the activity feed. ONE getLogs
 * across all three contracts; parseEventLogs drops anything that isn't one of our events. Never
 * throws — a failed read degrades to an empty feed so the rest of the snapshot still renders.
 */
async function buildReceipts(currentBlock: bigint): Promise<Receipt[]> {
  const fromBlock = currentBlock > BLOCK_LOOKBACK ? currentBlock - BLOCK_LOOKBACK : 0n;
  const logs = await client
    .getLogs({ address: [plan, vaultAddr, guardianAddr], fromBlock, toBlock: currentBlock })
    .catch(() => null);
  if (!logs) return []; // a failed read degrades to an empty feed; the rest of the snapshot still renders
  // strict (default) keeps only well-formed logs of OUR events and drops everything else (config/funding noise)
  const decoded = parseEventLogs({ abi: EVENT_ABI, logs });

  // newest first, tie-broken by logIndex
  decoded.sort((a, b) => {
    const bn = (b.blockNumber ?? 0n) - (a.blockNumber ?? 0n);
    if (bn !== 0n) return bn > 0n ? 1 : -1;
    return (b.logIndex ?? 0) - (a.logIndex ?? 0);
  });

  const out: Receipt[] = [];
  for (const ev of decoded) {
    if (ev.blockNumber == null || ev.transactionHash == null) continue;
    const base = {
      id: `${ev.transactionHash}-${ev.logIndex}`,
      blockNumber: ev.blockNumber,
      txHash: ev.transactionHash,
      explorerUrl: txUrl(ev.transactionHash),
    };
    let r: Receipt | null = null;
    switch (ev.eventName) {
      case "Heartbeat":
        r = { ...base, kind: "Heartbeat", from: ev.args.owner, memo: "Owner heartbeat — window reset to Active" };
        break;
      case "StageAdvanced": {
        const to = Number(ev.args.to);
        if (to === 1) r = { ...base, kind: "ContinuityNotice", stage: 1, memo: "Continuity notice served — challenge window opened" };
        else if (to === 2) r = { ...base, kind: "HandoverActivated", stage: 2, memo: "Capped handover — a successor gains a limited role" };
        // to === 3 (Sweep) is surfaced by ContinuitySettlementExecuted, which carries the amount
        break;
      }
      case "SuccessionCancelled":
        r = { ...base, kind: "StageCancelled", memo: "Owner returned — staircase rewound to Active" };
        break;
      case "ContinuitySettlementExecuted":
        r = { ...base, kind: "SweepExecuted", stage: 3, asset: "USDC", amount: ev.args.distributable, memo: `Terminal settlement — $${fmt6(ev.args.distributable)} distributed` };
        break;
      case "PayrollPaid":
        r = { ...base, kind: "PayrollPaid", asset: "USDC", amount: ev.args.amount, to: ev.args.payee, memo: `Payroll — $${fmt6(ev.args.amount)} to ${shortAddr(ev.args.payee)}` };
        break;
      case "SuccessorSpend":
        r = { ...base, kind: "SuccessorSpend", asset: "USDC", amount: ev.args.amount, from: ev.args.successor, to: ev.args.payee, memo: `Successor spend — $${fmt6(ev.args.amount)} to ${shortAddr(ev.args.payee)}` };
        break;
      case "Split":
        r = {
          ...base,
          kind: "Split",
          asset: "USDC",
          amount: ev.args.amount,
          to: ev.args.recipient,
          memo: ev.args.reserveTopUp
            ? `Reserve top-up — $${fmt6(ev.args.amount)}`
            : `Split — $${fmt6(ev.args.amount)} to ${shortAddr(ev.args.recipient)}`,
        };
        break;
      case "SettlementEscrowed":
        r = { ...base, kind: "Split", asset: "USDC", amount: ev.args.amount, to: ev.args.recipient, memo: `Escrowed for claim — $${fmt6(ev.args.amount)} to ${shortAddr(ev.args.recipient)}` };
        break;
      case "Frozen":
        r = { ...base, kind: "GuardianVeto", memo: "Guardians froze the staircase" };
        break;
      case "Unfrozen":
        r = { ...base, kind: "Unfrozen", memo: "Guardian veto lifted — staircase resumes" };
        break;
      case "GuardianVote":
        r = { ...base, kind: "GuardianVeto", from: ev.args.guardian, memo: `Guardian vote — ${ev.args.freeze ? "freeze" : "unfreeze"} (${Number(ev.args.votes)}/3)` };
        break;
    }
    if (r) out.push(r);
    if (out.length >= MAX_RECEIPTS) break;
  }
  return out;
}

export async function buildLiveSnapshot(): Promise<EphorSnapshot> {
  const currentBlock = await client.getBlockNumber();

  const contracts = [
    planCall("owner"), // 0
    planCall("stage"), // 1
    planCall("lastHeartbeatBlock"), // 2
    planCall("windowBlocks"), // 3
    planCall("challengeBlocks", [0n]), // 4
    planCall("challengeBlocks", [1n]), // 5
    planCall("challengeBlocks", [2n]), // 6
    planCall("stageEnteredBlock"), // 7
    planCall("swept"), // 8
    planCall("frozen"), // 9
    planCall("deadlineBlock"), // 10
    planCall("nextAdvanceBlock"), // 11
    vaultCall("payrollReserve"), // 12
    vaultCall("nextPayrollBlock"), // 13
    vaultCall("payrollPeriodBlocks"), // 14
    vaultCall("successors", [0n]), // 15
    vaultCall("successors", [1n]), // 16
    vaultCall("successors", [2n]), // 17
    vaultCall("payroll", [0n]), // 18
    vaultCall("payroll", [1n]), // 19
    vaultCall("payroll", [2n]), // 20
    balCall(DEPLOYMENT.usdc as Address), // 21
    balCall(ARC_ADDRESSES.eurc), // 22
    balCall(ARC_ADDRESSES.usyc), // 23
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await client.multicall({ contracts: contracts as any, allowFailure: true, multicallAddress: MULTICALL3 })) as {
    status: "success" | "failure";
    result?: unknown;
  }[];
  const val = <T>(i: number, fb: T): T => (res[i]?.status === "success" ? (res[i].result as T) : fb);
  const ok = (i: number) => res[i]?.status === "success";

  const owner = val<Address>(0, "0x0000000000000000000000000000000000000000");
  const stage = Number(val<number>(1, 0)) as StageId;
  const lastHb = val<bigint>(2, 0n);
  const windowBlocks = val<bigint>(3, 1n);
  const challenge: [bigint, bigint, bigint] = [val<bigint>(4, 0n), val<bigint>(5, 0n), val<bigint>(6, 0n)];
  const enteredBlk = val<bigint>(7, 0n);
  const swept = val<boolean>(8, false);
  const frozen = val<boolean>(9, false);
  const deadline = val<bigint>(10, lastHb + windowBlocks);
  const nextAdvance = val<bigint>(11, 0n);

  const reserve = val<bigint>(12, 0n);
  const nextPayroll = val<bigint>(13, 0n);
  const periodBlocks = val<bigint>(14, 1n);

  const labels = ["Successor 1 — COO", "Successor 2 — CFO", "Successor 3"];
  const successors: Successor[] = [];
  [15, 16, 17].forEach((idx, k) => {
    if (!ok(idx)) return;
    const s = res[idx].result as readonly [Address, bigint, bigint, number];
    successors.push({
      index: k,
      wallet: s[0],
      label: labels[k] ?? `Successor ${k + 1}`,
      caps: { perTxCap: s[1], dailyCap: s[2], allowlistedPayees: [] },
      splitBps: Number(s[3]),
      active: stage >= 2,
    });
  });

  const recipients: PayrollRecipient[] = [];
  let totalPerPeriod = 0n;
  [18, 19, 20].forEach((idx, k) => {
    if (!ok(idx)) return;
    const p = res[idx].result as readonly [Address, bigint];
    recipients.push({ label: `Payee ${k + 1}`, wallet: p[0], amountPerPeriod: p[1] });
    totalPerPeriod += p[1];
  });

  const usdcBal = val<bigint>(21, 0n);
  const eurcBal = val<bigint>(22, 0n);
  const usycBal = val<bigint>(23, 0n);
  const balances: TokenBalance[] = [
    { asset: "USDC", address: DEPLOYMENT.usdc as Address, amount: usdcBal, decimals: 6 },
    { asset: "EURC", address: ARC_ADDRESSES.eurc, amount: eurcBal, decimals: 6 },
    { asset: "USYC", address: ARC_ADDRESSES.usyc, amount: usycBal, decimals: 6 },
  ];

  const blocksRemaining = deadline > currentBlock ? deadline - currentBlock : 0n;
  const heartbeat: HeartbeatStatus = {
    lastHeartbeatBlock: lastHb,
    windowBlocks,
    deadlineBlock: deadline,
    currentBlock,
    blocksRemaining,
    state: hbState(stage, swept, currentBlock, deadline, windowBlocks),
    secondsPerBlock: SECONDS_PER_BLOCK,
  };

  const vault: Vault = {
    address: vaultAddr,
    owner,
    balances,
    payrollReserve: reserve,
    totalProtected: usdcBal,
    paused: frozen,
    currentStage: stage,
  };

  const payroll: PayrollStream = {
    asset: "USDC",
    periodBlocks,
    nextRunBlock: nextPayroll,
    lastRunBlock: null,
    recipients,
    totalPerPeriod,
    reserveFundedPeriods: totalPerPeriod > 0n ? Number(reserve / totalPerPeriod) : 0,
    reserveBalance: reserve,
    runsDuringSuccession: true,
  };

  const receipts = await buildReceipts(currentBlock);

  return {
    vault,
    plan: null,
    heartbeat,
    stages: buildStages(stage, currentBlock, [windowBlocks, ...challenge], enteredBlk, swept, nextAdvance),
    successors,
    payroll,
    receipts,
    balances,
  };
}
