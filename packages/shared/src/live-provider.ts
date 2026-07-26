/**
 * LiveEphorProvider — reads deployed Ephor contracts on Arc via viem.
 *
 * Selected when `DATA_MODE=live` / `NEXT_PUBLIC_DATA_MODE=live`. The interface and
 * construction shape are frozen in Phase 0 so the design session can wire the
 * mock↔live swap now; the on-chain reads are filled in Phase 3 once the contracts
 * are deployed and ABIs are generated. Until then, methods throw a clear message
 * so a misconfigured `live` mode fails loudly instead of silently returning junk.
 */
import type { PublicClient } from "viem";
import type { CancelResult, CreatePlanInput, EphorProvider } from "./provider";
import type {
  Address,
  DataMode,
  HeartbeatStatus,
  PayrollStream,
  Plan,
  Receipt,
  StageWindow,
  Successor,
  TokenBalance,
  Vault,
} from "./types";

/** Deployed contract addresses, produced by the deploy script. */
export interface LiveDeployment {
  vault: Address;
  plan: Address;
  guardian: Address;
  usdc: Address;
}

export interface LiveProviderConfig {
  publicClient: PublicClient;
  deployment: LiveDeployment;
}

class NotWiredError extends Error {
  constructor(method: string) {
    super(
      `LiveEphorProvider.${method}() is not wired yet — contracts land in Phase 2, ` +
        `live reads in Phase 3. Use DATA_MODE=mock until then.`,
    );
    this.name = "NotWiredError";
  }
}

export class LiveEphorProvider implements EphorProvider {
  readonly mode: DataMode = "live";

  constructor(readonly config: LiveProviderConfig) {}

  /** Convenience: expose the underlying client for the wiring phase. */
  get client(): PublicClient {
    return this.config.publicClient;
  }

  async getVault(): Promise<Vault> {
    throw new NotWiredError("getVault");
  }
  async getPlan(): Promise<Plan | null> {
    throw new NotWiredError("getPlan");
  }
  async createPlan(_input: CreatePlanInput): Promise<Plan> {
    throw new NotWiredError("createPlan");
  }
  async heartbeat(): Promise<HeartbeatStatus> {
    throw new NotWiredError("heartbeat");
  }
  async getHeartbeatStatus(): Promise<HeartbeatStatus> {
    throw new NotWiredError("getHeartbeatStatus");
  }
  async cancelStage(): Promise<CancelResult> {
    throw new NotWiredError("cancelStage");
  }
  async getStages(): Promise<StageWindow[]> {
    throw new NotWiredError("getStages");
  }
  async getSuccessors(): Promise<Successor[]> {
    throw new NotWiredError("getSuccessors");
  }
  async getPayrollStream(): Promise<PayrollStream> {
    throw new NotWiredError("getPayrollStream");
  }
  async getReceipts(): Promise<Receipt[]> {
    throw new NotWiredError("getReceipts");
  }
  async getBalances(): Promise<TokenBalance[]> {
    throw new NotWiredError("getBalances");
  }
}

/** Resolve the active data mode from env (web uses NEXT_PUBLIC_, keeper uses DATA_MODE). */
export function resolveDataMode(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): DataMode {
  const value = env["NEXT_PUBLIC_DATA_MODE"] ?? env["DATA_MODE"] ?? "mock";
  return value === "live" ? "live" : "mock";
}
