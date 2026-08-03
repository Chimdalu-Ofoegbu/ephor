/**
 * Server-side live snapshot: reads the deployed Ephor contracts on Arc via viem and
 * assembles an EphorSnapshot (the same shape the mock scenarios use). Imported only by
 * the /api/snapshot route — never bundled to the client.
 *
 * All reads are batched into ONE Multicall3 eth_call (Arc has Multicall3 at the canonical
 * address), so a poll is just 2 RPC requests — well under the public RPC's rate limit.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { DEPLOYMENT } from "./config";
import { ARC_ADDRESSES } from "@ephor/shared/addresses";
import type {
  EphorSnapshot,
  HeartbeatState,
  HeartbeatStatus,
  PayrollRecipient,
  PayrollStream,
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

const plan = DEPLOYMENT.plan as Address;
const vaultAddr = DEPLOYMENT.vault as Address;

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

  return {
    vault,
    plan: null,
    heartbeat,
    stages: buildStages(stage, currentBlock, [windowBlocks, ...challenge], enteredBlk, swept, nextAdvance),
    successors,
    payroll,
    receipts: [],
    balances,
  };
}
