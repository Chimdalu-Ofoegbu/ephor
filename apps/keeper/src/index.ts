import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import cron from "node-cron";
import { makePublicClient, makeWalletClient } from "@ephor/shared";
import { loadConfig } from "./config";
import { EphorKeeper, type Deployment } from "./keeper";

function loadDeployment(path: string): Deployment | null {
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) return null;
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8")) as Partial<Deployment>;
    if (raw.continuityVault && raw.successionPlan) {
      return { continuityVault: raw.continuityVault, successionPlan: raw.successionPlan };
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log(`[keeper] mode=${cfg.mode} rpc=${cfg.rpcUrl} poll≈${cfg.pollBlocks} blocks`);

  const deployment = loadDeployment(cfg.deploymentsPath);
  if (cfg.mode === "mock" || !deployment || !cfg.deployerKey) {
    console.log("[keeper] DRY MODE — no live deployment/key, or DATA_MODE=mock.");
    console.log("[keeper] Each tick it WOULD: read the plan/vault, advanceStage() when a window lapses,");
    console.log("[keeper] and runPayroll() when a period is due and the reserve covers it — all idempotent.");
    console.log("[keeper] Set DATA_MODE=live + DEPLOYER_PRIVATE_KEY + a deployment JSON to run for real.");
    return;
  }

  const pub = makePublicClient(cfg.rpcUrl);
  const wallet = makeWalletClient(cfg.deployerKey, cfg.rpcUrl);
  const keeper = new EphorKeeper(pub, wallet, deployment);

  await keeper.tick();
  const everySeconds = Math.min(59, Math.max(2, Math.round(cfg.pollBlocks * 0.5)));
  cron.schedule(`*/${everySeconds} * * * * *`, () => {
    void keeper.tick();
  });
  console.log(`[keeper] scheduled — ticking every ${everySeconds}s.`);
}

void main();
