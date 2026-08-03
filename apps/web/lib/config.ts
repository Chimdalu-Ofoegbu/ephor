/** Deployed Ephor addresses on Arc testnet (from contracts/deployments/arc-testnet.json). */
export const DEPLOYMENT = {
  chainId: 5042002,
  network: "Arc testnet",
  rpcUrl: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  plan: "0x01FcB61253f8E0dE8f0455dDe6CBd36882ad3bf8",
  vault: "0x9215fD038685e23c08f83b52137f95662DC33021",
  guardian: "0x52e003799cCB3B0BFc8Bcd227112F1Ffe9bc506d",
  usdc: "0x3600000000000000000000000000000000000000",
} as const;

export type Deployment = typeof DEPLOYMENT;

export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const addressUrl = (a: string) => `${DEPLOYMENT.explorer}/address/${a}`;
export const txUrl = (h: string) => `${DEPLOYMENT.explorer}/tx/${h}`;
