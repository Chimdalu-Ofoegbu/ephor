import type { Address, PublicClient, WalletClient } from "viem";
import { arcTestnet } from "@ephor/shared";
import { planAbi, vaultAbi } from "./abi";
import { notify } from "./notify";

export interface Deployment {
  successionPlan: Address;
  continuityVault: Address;
}

const STAGE_NAMES = ["Active", "Notice", "Handover", "Sweep"] as const;

/**
 * The keeper advances stages once their windows lapse and drives payroll — both
 * idempotent and permissionless. It is a convenience, never a trust point: the
 * contracts enforce every rule, so a stray or missed tick can never break an invariant.
 */
export class EphorKeeper {
  constructor(
    private readonly pub: PublicClient,
    private readonly wallet: WalletClient,
    private readonly dep: Deployment,
  ) {}

  async tick(): Promise<void> {
    const block = await this.pub.getBlockNumber();
    await this.maybeAdvance(block);
    await this.maybePayroll(block);
  }

  private async maybeAdvance(block: bigint): Promise<void> {
    const address = this.dep.successionPlan;
    const [stage, swept, frozen, nextAdvance] = await Promise.all([
      this.pub.readContract({ address, abi: planAbi, functionName: "stage" }),
      this.pub.readContract({ address, abi: planAbi, functionName: "swept" }),
      this.pub.readContract({ address, abi: planAbi, functionName: "frozen" }),
      this.pub.readContract({ address, abi: planAbi, functionName: "nextAdvanceBlock" }),
    ]);
    if (swept || frozen) return;
    if (block < nextAdvance) return;

    const account = this.wallet.account;
    if (!account) return;
    try {
      const hash = await this.wallet.writeContract({
        address,
        abi: planAbi,
        functionName: "advanceStage",
        args: [],
        account,
        chain: arcTestnet,
      });
      notify("notice", `advanceStage from ${STAGE_NAMES[Number(stage)] ?? stage} @ block ${block} -> ${hash}`);
    } catch (err) {
      console.warn(`[keeper] advanceStage skipped: ${String((err as Error).message).split("\n")[0]}`);
    }
  }

  private async maybePayroll(block: bigint): Promise<void> {
    const address = this.dep.continuityVault;
    const [nextPay, reserve, total] = await Promise.all([
      this.pub.readContract({ address, abi: vaultAbi, functionName: "nextPayrollBlock" }),
      this.pub.readContract({ address, abi: vaultAbi, functionName: "payrollReserve" }),
      this.pub.readContract({ address, abi: vaultAbi, functionName: "payrollTotalPerPeriod" }),
    ]);
    if (block < nextPay || reserve < total) return;

    const account = this.wallet.account;
    if (!account) return;
    try {
      const hash = await this.wallet.writeContract({
        address,
        abi: vaultAbi,
        functionName: "runPayroll",
        args: [],
        account,
        chain: arcTestnet,
      });
      notify("payroll", `runPayroll @ block ${block} (${total} base units) -> ${hash}`);
    } catch (err) {
      console.warn(`[keeper] runPayroll skipped: ${String((err as Error).message).split("\n")[0]}`);
    }
  }
}
