/**
 * viem chain definition + client factories for Arc testnet.
 *
 * Shared by the keeper (backend) and available to the design session's
 * LiveEphorProvider. No secrets here — the deployer key is injected by callers.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC } from "./addresses";

/** Arc testnet as a viem chain. USDC is the native gas token. */
export const arcTestnet = defineChain({
  id: ARC.chainId,
  name: ARC.name,
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: {
    default: { http: [ARC.rpcUrl] },
    public: { http: [ARC.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: ARC.explorerUrl },
  },
  testnet: true,
});

export function makePublicClient(rpcUrl: string = ARC.rpcUrl): PublicClient {
  return createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
}

/**
 * Wallet client from a raw private key. TESTNET ONLY — never pass a key that
 * controls real value. The key comes from env (`DEPLOYER_PRIVATE_KEY`), never code.
 */
export function makeWalletClient(
  privateKey: `0x${string}`,
  rpcUrl: string = ARC.rpcUrl,
): WalletClient<Transport, typeof arcTestnet> {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });
}
