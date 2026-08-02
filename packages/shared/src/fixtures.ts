/**
 * Deterministic demo fixtures for a fictional company, "Helios Robotics".
 *
 * These build the six scenarios in `scenarios.ts`. Everything is derived from a
 * single company config so the numbers stay consistent across beats. All values
 * are deterministic — no Date.now(), no randomness — so the camera runs identically
 * every take.
 */
import { ARC_ADDRESSES, CCTP_DOMAINS } from "./addresses";
import type {
  Address,
  Hex,
  Allocation,
  PayrollRecipient,
  PolicyLegs,
  Successor,
  TokenBalance,
} from "./types";

/** 6-dec base units from a human number. `U(1.5)` → 1_500_000n. */
export const U = (n: number): bigint => BigInt(Math.round(n * 1e6));

/** Pad a short hex seed into a valid, lowercase 20-byte address (mock only). */
export const A = (seed: string): Address =>
  ("0x" + seed.replace(/^0x/, "").toLowerCase().padEnd(40, "0").slice(0, 40)) as Address;

/** Pad a short hex seed into a valid, lowercase 32-byte tx hash (mock only). */
export const TX = (seed: string): Hex =>
  ("0x" + seed.replace(/^0x/, "").toLowerCase().padEnd(64, "0").slice(0, 64)) as Hex;

export const ACTORS = {
  operator: A("ada01"), // founder Ada — holds the live key
  successor1: A("b01a01"), // COO Bola
  successor2: A("c41d02"), // CFO Chidi
  vendor: A("feed01"), // allowlisted vendor (cloud infra)
  guardian1: A("6a1d01"),
  guardian2: A("6a1d02"),
  guardian3: A("6a1d03"),
  team: {
    eng1: A("7ea401"),
    eng2: A("7ea402"),
    ops1: A("7ea403"),
    design1: A("7ea404"),
    support1: A("7ea405"),
  },
  usdc: A("36"), // 0x3600…0000 — the real 6-dec USDC ERC-20 on Arc (confirmed)
  vault: A("ea17"),
  plan: A("b1a4"),
} as const;

export const COMPANY = {
  name: "Helios Robotics",
  /** Heartbeat window (demo profile: minutes of blocks; represents ≈14 days). */
  windowBlocks: 200n,
  /** Challenge windows for stages 1, 2, 3. */
  stageChallengeBlocks: [100n, 100n, 50n] as [bigint, bigint, bigint],
  payrollPeriodBlocks: 120n,
  reservePeriods: 6,
  treasuryUsdc: U(500_000),
  /** 6 periods × 40k. */
  reserveUsdc: U(240_000),
  perPeriodUsdc: U(40_000),
} as const;

export const PAYROLL_RECIPIENTS: PayrollRecipient[] = [
  { label: "Kwame — Eng", wallet: ACTORS.team.eng1, amountPerPeriod: U(10_000) },
  { label: "Lena — Eng", wallet: ACTORS.team.eng2, amountPerPeriod: U(9_000) },
  { label: "Amara — Ops", wallet: ACTORS.team.ops1, amountPerPeriod: U(8_000) },
  { label: "Ravi — Design", wallet: ACTORS.team.design1, amountPerPeriod: U(7_000) },
  { label: "Mei — Support", wallet: ACTORS.team.support1, amountPerPeriod: U(6_000) },
]; // Σ = 40,000 / period

const ALLOWLIST_PAYEES: Address[] = [ACTORS.vendor, ...PAYROLL_RECIPIENTS.map((r) => r.wallet)];

/**
 * Two successors. `active` marks whether each has been handed their capped
 * operational role (stage ≥ 2). Stage-3 split shares: s1 30%, s2 20%.
 */
export function makeSuccessors(active: [boolean, boolean]): Successor[] {
  return [
    {
      index: 0,
      wallet: ACTORS.successor1,
      label: "COO — Bola",
      caps: { perTxCap: U(25_000), dailyCap: U(50_000), allowlistedPayees: ALLOWLIST_PAYEES },
      splitBps: 3000,
      active: active[0],
    },
    {
      index: 1,
      wallet: ACTORS.successor2,
      label: "CFO — Chidi",
      caps: { perTxCap: U(15_000), dailyCap: U(30_000), allowlistedPayees: [ACTORS.vendor] },
      splitBps: 2000,
      active: active[1],
    },
  ];
}

/**
 * Stage-3 beneficiary allocations (successors above take 5000 bps; these take the
 * other 5000). Σ successor splitBps + Σ allocation bps === 10_000 → split conservation.
 */
export const ALLOCATIONS: Allocation[] = [
  { label: "Payroll reserve top-up", recipient: ACTORS.vault, bps: 2000 },
  { label: "EURC operating buffer", recipient: ACTORS.successor1, bps: 1500, convertTo: "EURC" },
  {
    label: "Base Sepolia treasury",
    recipient: ACTORS.successor2,
    bps: 1000,
    crossChainDomain: CCTP_DOMAINS.baseSepolia,
  },
  { label: "USYC residual park", recipient: ACTORS.vault, bps: 500 },
]; // 2000 + 1500 + 1000 + 500 = 5000

export const LEGS: PolicyLegs = {
  swap: { fromAsset: "USDC", toAsset: "EURC", bps: 1500 },
  crossChain: {
    asset: "USDC",
    destinationDomain: CCTP_DOMAINS.baseSepolia,
    recipient: ACTORS.successor2,
    bps: 1000,
  },
  yieldPark: { asset: "USDC", vault: "USYC", bps: 500 },
};

/** Distributable balance stage 3 splits over (treasury minus carved reserve). */
export const DISTRIBUTABLE = COMPANY.treasuryUsdc - COMPANY.reserveUsdc; // 260,000

/** Amount for a given bps of the distributable balance. */
export const share = (bps: number): bigint => (DISTRIBUTABLE * BigInt(bps)) / 10_000n;

/**
 * Vault token balances. Pre-sweep: full treasury in USDC. Post-sweep: payroll
 * reserve (+ top-up) remains as USDC, residual parked as USYC, EURC delivered out.
 */
export function makeBalances(swept: boolean): TokenBalance[] {
  const usdc = swept ? COMPANY.reserveUsdc + share(2000) : COMPANY.treasuryUsdc;
  return [
    { asset: "USDC", address: ACTORS.usdc, amount: usdc, decimals: 6 },
    { asset: "EURC", address: ARC_ADDRESSES.eurc, amount: 0n, decimals: 6 },
    { asset: "USYC", address: ARC_ADDRESSES.usyc, amount: swept ? share(500) : 0n, decimals: 6 },
  ];
}
