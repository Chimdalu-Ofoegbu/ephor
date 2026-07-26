import "dotenv/config";
import { resolveDataMode, type DataMode } from "@ephor/shared";

export interface KeeperConfig {
  mode: DataMode;
  rpcUrl: string;
  pollBlocks: number;
  deployerKey?: `0x${string}`;
  deploymentsPath: string;
  dbPath: string;
}

export function loadConfig(): KeeperConfig {
  const key = process.env["DEPLOYER_PRIVATE_KEY"];
  const validKey = key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : undefined;
  return {
    mode: resolveDataMode(),
    rpcUrl: process.env["ARC_RPC_URL"] ?? "https://rpc.testnet.arc.network",
    pollBlocks: Number(process.env["KEEPER_POLL_BLOCKS"] ?? 5),
    deployerKey: validKey,
    deploymentsPath: process.env["DEPLOYMENTS_PATH"] ?? "../../contracts/deployments/arc-testnet.json",
    dbPath: process.env["KEEPER_DB_PATH"] ?? "./data/ephor.sqlite",
  };
}
