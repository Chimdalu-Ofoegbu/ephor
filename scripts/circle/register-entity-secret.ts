/**
 * One-command Circle Entity Secret setup for developer-controlled wallets.
 *
 * Generates a 32-byte Entity Secret and registers its ciphertext with Circle, writing
 * the recovery file to .circle-recovery/ (gitignored). Run it once, then paste the
 * printed secret into .env as CIRCLE_ENTITY_SECRET.
 *
 *   pnpm --filter @ephor/scripts register-entity-secret     (or: pnpm circle:entity)
 *
 * Prereq: CIRCLE_API_KEY set in the repo-root .env. Secrets live in .env only — never
 * commit them and never paste them into chat. This runs in YOUR terminal, so the printed
 * secret stays with you.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
config({ path: resolve(repoRoot, ".env") });

async function main(): Promise<void> {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    console.error("[x] CIRCLE_API_KEY is not set in .env.");
    console.error("    Create a Testnet API key at console.circle.com -> API Keys, then re-run.");
    process.exit(1);
  }

  const existing = process.env.CIRCLE_ENTITY_SECRET?.trim();
  if (existing) {
    console.log("[i] CIRCLE_ENTITY_SECRET is already set in .env.");
    console.log("    If you already registered it with Circle, you're done — nothing to do.");
    console.log("    To register a fresh one: clear CIRCLE_ENTITY_SECRET in .env and re-run.");
    return;
  }

  // Circle has no generator helper; a 32-byte hex string IS the entity secret.
  const entitySecret = randomBytes(32).toString("hex");

  const recoveryDir = resolve(repoRoot, ".circle-recovery");
  mkdirSync(recoveryDir, { recursive: true });

  console.log("[>] Registering a new Entity Secret with Circle...");
  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  });

  console.log("");
  console.log("[ok] Entity Secret generated and registered with Circle.");
  console.log("");
  console.log("  1) Paste this line into .env (replacing the empty CIRCLE_ENTITY_SECRET=):");
  console.log("");
  console.log("     CIRCLE_ENTITY_SECRET=" + entitySecret);
  console.log("");
  console.log("  2) A recovery file was written to .circle-recovery/ (gitignored).");
  console.log("     Move it somewhere safe & private — it is the ONLY way to reset the");
  console.log("     secret if it is ever lost.");
  console.log("");
}

main().catch((err: unknown) => {
  console.error("[x] Registration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
