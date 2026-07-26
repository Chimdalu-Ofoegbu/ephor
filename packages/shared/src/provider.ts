/**
 * EphorProvider — the single data seam between UI and chain.
 *
 * The design session builds `MockEphorProvider` (deterministic fixtures, six
 * scenarios, dev panel) against this exact interface. This backend session
 * ships `LiveEphorProvider` (reads deployed contracts via viem). Selection is
 * by `NEXT_PUBLIC_DATA_MODE` (web) / `DATA_MODE` (keeper) — swapping mock↔live
 * requires ZERO component changes.
 *
 * FROZEN after Phase 0. Adding/removing/retyping a method is a stop-and-ask.
 */
import type {
  Vault,
  Plan,
  SuccessionPlanConfig,
  HeartbeatStatus,
  StageWindow,
  StageId,
  Successor,
  PayrollStream,
  Receipt,
  TokenBalance,
  DataMode,
} from "./types";

/** Input accepted by `createPlan` — the continuity policy the owner signs. */
export type CreatePlanInput = SuccessionPlanConfig;

/** Result of the owner's master cancel ("I'm here"). */
export interface CancelResult {
  cancelled: boolean;
  /** Stage the vault returned to (always 0 on a successful owner cancel). */
  toStage: StageId;
}

export interface EphorProvider {
  /** "mock" or "live" — lets the UI badge the data source. */
  readonly mode: DataMode;

  /** Vault identity, balances, reserve, pause state, and current stage. */
  getVault(): Promise<Vault>;

  /** The active continuity plan, or null if none has been created yet. */
  getPlan(): Promise<Plan | null>;

  /** Create/sign a continuity plan from a validated config. */
  createPlan(input: CreatePlanInput): Promise<Plan>;

  /**
   * "I'm here." Records an owner heartbeat. This is owner-supremacy in action:
   * a heartbeat at ANY stage < 3-executed cancels the staircase and restores
   * sole control. Returns the refreshed heartbeat status.
   */
  heartbeat(): Promise<HeartbeatStatus>;

  /** Current heartbeat status (deadline, blocks remaining, health). */
  getHeartbeatStatus(): Promise<HeartbeatStatus>;

  /**
   * The owner's master cancel. Equivalent to `heartbeat()` for its rewind
   * effect, exposed separately so the UI can bind the ever-present CANCEL
   * button to an explicit, single action.
   */
  cancelStage(): Promise<CancelResult>;

  /** The four staircase steps (ids 0..3) with their windows and statuses. */
  getStages(): Promise<StageWindow[]>;

  /** Designated successors with their per-stage caps and split shares. */
  getSuccessors(): Promise<Successor[]>;

  /** The payroll stream — recipients, reserve, next run. Runs during succession. */
  getPayrollStream(): Promise<PayrollStream>;

  /** Every notice, advancement, payment, sweep leg, and cancellation. Newest first. */
  getReceipts(): Promise<Receipt[]>;

  /** Vault token balances (USDC/EURC/USYC). */
  getBalances(): Promise<TokenBalance[]>;
}
