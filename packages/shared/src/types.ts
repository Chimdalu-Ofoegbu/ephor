/**
 * Ephor domain model — shared types.
 *
 * This is the vocabulary the whole product speaks: the succession staircase,
 * the heartbeat, capped successors, payroll continuity, and per-leg receipts.
 *
 * Conventions:
 *  - Token amounts are `bigint` in 6-decimal base units (USDC/EURC/USYC on Arc).
 *  - Windows and timers are measured in **block counts** (`bigint`), never wall-clock —
 *    Arc timestamps repeat, so blocks are the only trustworthy clock.
 *  - Addresses/hashes reuse viem's branded string types so this model drops straight
 *    into a viem/wagmi frontend with no adapters.
 *
 * FROZEN after Phase 0. Changing a type here is a stop-and-ask (it would break the
 * design session, which builds `MockEphorProvider` against exactly these shapes).
 */
import type { Address, Hex } from "viem";

export type { Address, Hex };

/** A block height on Arc. All windows are expressed relative to these. */
export type BlockNumber = bigint;

/** A token amount in base units. 6-dec assets on Arc → divide by 1e6 for display. */
export type TokenAmount = bigint;

/** Basis points (1/100th of a percent). 10_000 bps = 100%. */
export type Bps = number;

/** The three settlement assets in scope. */
export type AssetSymbol = "USDC" | "EURC" | "USYC";

export interface TokenBalance {
  asset: AssetSymbol;
  /** The ERC-20 address on Arc (native-USDC gas token has its own address). */
  address: Address;
  /** Base units (6-dec). */
  amount: TokenAmount;
  decimals: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// The succession staircase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage of the staircase.
 *  0 — Active: owner is live, nothing pending.
 *  1 — Notice: challenge window A; a ContinuityNotice was emitted; nothing moves.
 *  2 — Handover: challenge window B; successor #1 holds a CAPPED operational role.
 *  3 — Sweep: final policy settlement executed (splits + legs).
 */
export type StageId = 0 | 1 | 2 | 3;

export type StageName = "Active" | "Notice" | "Handover" | "Sweep";

export type StageStatus =
  | "inactive" // not reached
  | "pending" // callable but not yet entered (window lapsed, waiting for advance())
  | "active" // entered; its challenge window is counting down
  | "executed" // stage action performed (only stage 3 "executes" terminally)
  | "cancelled"; // rewound by an owner heartbeat

/**
 * One step of the staircase. The design session renders four of these
 * (ids 0..3) as an actual staircase with countdowns.
 */
export interface StageWindow {
  id: StageId;
  name: StageName;
  status: StageStatus;
  /** Block at which this stage first became callable (null if not yet). */
  opensAtBlock: BlockNumber | null;
  /** Length of this stage's challenge window, in blocks. */
  challengeWindowBlocks: bigint;
  /** Block at/after which this stage's action may execute (null if not scheduled). */
  executeAtBlock: BlockNumber | null;
  /** Block at which the stage was entered (null if not entered). */
  enteredAtBlock: BlockNumber | null;
  /** Plain-language "what happens next" for the UI. */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────────────────────────────────────

export type HeartbeatState =
  | "healthy" // comfortably within window
  | "due-soon" // inside the last ~20% of the window
  | "overdue" // window lapsed; stage 1 is now callable
  | "silent"; // overdue and a stage is already in motion

export interface HeartbeatStatus {
  lastHeartbeatBlock: BlockNumber;
  /** Blocks the owner has between required check-ins. */
  windowBlocks: bigint;
  /** lastHeartbeatBlock + windowBlocks. */
  deadlineBlock: BlockNumber;
  currentBlock: BlockNumber;
  /** Blocks until the deadline; clamped to 0 once overdue. */
  blocksRemaining: bigint;
  state: HeartbeatState;
  /** ~seconds per block on Arc, for optional wall-clock hints in the UI. */
  secondsPerBlock: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Successors, caps, allocations, payroll
// ─────────────────────────────────────────────────────────────────────────────

/** Hard caps on a successor's stage-2 operational role. Enforced in the vault. */
export interface StageCaps {
  /** Max value moved in a single successor transaction. */
  perTxCap: TokenAmount;
  /** Rolling 24h-equivalent cap (measured in blocks, see periodBlocks). */
  dailyCap: TokenAmount;
  /** Only these payees can receive successor-initiated payments in stage 2. */
  allowlistedPayees: Address[];
}

export interface Successor {
  /** 0..2 (1–3 successors supported). */
  index: number;
  wallet: Address;
  /** Display label, e.g. "COO — Ada". */
  label: string;
  /** Stage-2 operational caps. */
  caps: StageCaps;
  /** Stage-3 allocation share in basis points. */
  splitBps: Bps;
  /** Whether this successor's operational role has activated (stage ≥ 2). */
  active: boolean;
}

export interface PayrollRecipient {
  label: string;
  wallet: Address;
  amountPerPeriod: TokenAmount;
}

/**
 * The payroll stream. Its defining promise: reserve-funded pulls succeed
 * regardless of stage. Payroll never misses a beat.
 */
export interface PayrollStream {
  asset: AssetSymbol;
  /** One payroll period, in blocks. */
  periodBlocks: bigint;
  nextRunBlock: BlockNumber;
  lastRunBlock: BlockNumber | null;
  recipients: PayrollRecipient[];
  totalPerPeriod: TokenAmount;
  /** How many periods the current reserve covers. */
  reserveFundedPeriods: number;
  reserveBalance: TokenAmount;
  /** Invariant marker: true, always. Payroll runs during succession. */
  runsDuringSuccession: true;
}

/** A stage-3 allocation, optionally with a conversion and/or cross-chain leg. */
export interface Allocation {
  label: string;
  recipient: Address;
  bps: Bps;
  /** App Kit Swap leg — convert this allocation to another asset before delivery. */
  convertTo?: AssetSymbol;
  /** CCTP v2 leg — deliver on another chain (destination CCTP domain). */
  crossChainDomain?: number;
}

export type YieldVaultKind = "USYC" | "MockYieldVault";

/** Optional stage-3 legs attached to the policy. */
export interface PolicyLegs {
  swap?: { fromAsset: AssetSymbol; toAsset: AssetSymbol; bps: Bps };
  crossChain?: {
    asset: AssetSymbol;
    destinationDomain: number;
    recipient: Address;
    bps: Bps;
  };
  yieldPark?: { asset: AssetSymbol; vault: YieldVaultKind; bps: Bps };
}

export interface GuardianConfig {
  guardians: [Address, Address, Address];
  threshold: 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan + Vault
// ─────────────────────────────────────────────────────────────────────────────

/** The continuity policy the owner signs. Config-only (no live state). */
export interface SuccessionPlanConfig {
  /** Blocks between required heartbeats (default ≈ 14 days; demo profile: minutes). */
  windowBlocks: bigint;
  /** Challenge windows for stages 1, 2, 3 (in blocks). */
  stageChallengeBlocks: [bigint, bigint, bigint];
  successors: Successor[];
  /** Stage-3 splits. Σ allocation bps + Σ successor splitBps === 10_000. */
  allocations: Allocation[];
  payroll: {
    asset: AssetSymbol;
    periodBlocks: bigint;
    reservePeriods: number;
    recipients: PayrollRecipient[];
  };
  legs: PolicyLegs;
  guardian?: GuardianConfig;
}

/** A live plan: config plus on-chain identity and state. */
export interface Plan extends SuccessionPlanConfig {
  vaultAddress: Address;
  planAddress: Address;
  owner: Address;
  createdAtBlock: BlockNumber;
  active: boolean;
}

export interface Vault {
  address: Address;
  owner: Address;
  balances: TokenBalance[];
  /** Carved-out payroll reserve (subset of balances, earmarked). */
  payrollReserve: TokenAmount;
  /** Total protected balance — basis for the "5bps on protected balances" metric. */
  totalProtected: TokenAmount;
  /** Guardian veto engaged → staircase frozen. */
  paused: boolean;
  currentStage: StageId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipts — every transition is evented
// ─────────────────────────────────────────────────────────────────────────────

export type ReceiptKind =
  | "ContinuityNotice" // stage 1 opened
  | "HandoverActivated" // stage 2 opened; successor gains capped role
  | "PayrollPaid" // a payroll period paid
  | "SuccessorSpend" // capped successor paid an allowlisted payee
  | "Split" // stage-3 allocation delivered
  | "Swap" // App Kit Swap conversion leg
  | "CrossChainBurn" // CCTP burn on Arc
  | "CrossChainMint" // CCTP mint on destination chain
  | "YieldPark" // residual parked in USYC (or MockYieldVault)
  | "StageCancelled" // owner returned; staircase rewound
  | "GuardianVeto"; // guardian froze the staircase

export interface Receipt {
  id: string;
  kind: ReceiptKind;
  blockNumber: BlockNumber;
  txHash: Hex;
  asset?: AssetSymbol;
  amount?: TokenAmount;
  from?: Address;
  to?: Address;
  stage?: StageId;
  /** Explorer link for the primary tx. */
  explorerUrl?: string;
  /** For CCTP legs: the destination-chain explorer link. */
  destinationExplorerUrl?: string;
  /** Plain-language, camera-legible summary. */
  memo: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A full snapshot — everything the UI needs for one render
// ─────────────────────────────────────────────────────────────────────────────

export interface EphorSnapshot {
  vault: Vault;
  plan: Plan | null;
  heartbeat: HeartbeatStatus;
  stages: StageWindow[];
  successors: Successor[];
  payroll: PayrollStream;
  receipts: Receipt[];
  balances: TokenBalance[];
}

/** The six demo beats. */
export type ScenarioId =
  | "healthy"
  | "silence-begins"
  | "stage1-notice"
  | "stage2-handover"
  | "stage3-sweep"
  | "owner-returns";

export interface Scenario {
  id: ScenarioId;
  title: string;
  /** One-line narration for the dev panel and the camera. */
  caption: string;
  snapshot: EphorSnapshot;
}

export type DataMode = "mock" | "live";
