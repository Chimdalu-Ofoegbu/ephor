/**
 * Arc testnet facts and known contract addresses.
 *
 * Verified Jul 14–17 2026 per the build brief. RE-VERIFY via the Arc docs MCP
 * (https://docs.arc.io/mcp) before each integration — testnets move.
 *
 * Token/asset addresses that vary by deployment (USDC, USYC entitlements) are
 * read from env at runtime; the stable protocol addresses are pinned here.
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
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address,
  usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C" as Address,
  usycTeller: "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A" as Address,
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
