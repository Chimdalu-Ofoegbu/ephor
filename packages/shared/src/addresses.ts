/**
 * Arc testnet facts and known contract addresses.
 *
 * Verified Jul 14–17 2026 per the build brief; USDC + USYC entitlements
 * re-confirmed against the Arc docs Aug 2 2026. RE-VERIFY before each integration —
 * testnets move. Deploy-time overrides still come from env (USDC_ADDRESS, etc.).
 */
import type { Address } from "viem";

export const ARC = {
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com",
  /** Native gas token is USDC. ERC-20 assets are 6-dec. */
  nativeDecimals: 18,
  erc20Decimals: 6,
  /** ~0.5s deterministic blocks — windows are measured in block counts. */
  secondsPerBlock: 0.5,
  minGasGwei: 20,
  /** Arc's CCTP v2 domain. */
  cctpDomain: 26,
} as const;

/** Stable protocol addresses on Arc testnet (per brief; re-verify before use). */
export const ARC_ADDRESSES = {
  /** USDC is the native gas token AND a 6-dec ERC-20 at this address (confirmed via Arc docs). */
  usdc: "0x3600000000000000000000000000000000000000" as Address,
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address,
  usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C" as Address,
  usycTeller: "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A" as Address,
  usycEntitlements: "0xcc205224862c7641930c87679e98999d23c26113" as Address,
  tokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Address,
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as Address,
} as const;

/** CCTP destination domains used in the demo. */
export const CCTP_DOMAINS = {
  arc: 26,
  baseSepolia: 6,
} as const;

/** Explorer URL helpers. */
export function txUrl(hash: string, base: string = ARC.explorerUrl): string {
  return `${base.replace(/\/$/, "")}/tx/${hash}`;
}

export function addressUrl(address: string, base: string = ARC.explorerUrl): string {
  return `${base.replace(/\/$/, "")}/address/${address}`;
}
