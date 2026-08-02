/**
 * One-command Circle Entity Secret setup for developer-controlled wallets.
 *
 * Generates a 32-byte Entity Secret and registers its ciphertext with Circle. The secret is
 * printed BEFORE any network call, so it can never be lost even if registration errors. The
 * recovery file is written to .circle-recovery/ (gitignored) after a successful register.
 *
 *   pnpm circle:entity      (or: pnpm --filter @ephor/scripts register-entity-secret)
 *
 * Prereq: CIRCLE_API_KEY set in the repo-root .env. Secrets live in .env only — never commit
 * them and never paste them into chat. This runs in YOUR terminal, so the printed secret is yours.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const envPath = resolve(repoRoot, ".env");
const loaded = config({ path: envPath });

function mask(v: string): string {
  return v.length <= 10 ? "***" : `${v.slice(0, 6)}…${v.slice(-4)} (len ${v.length})`;
}

function errorDetail(err: unknown): string {
  if (err && typeof err === "object") {
    const anyErr = err as { response?: { status?: number; data?: unknown }; message?: string };
    if (anyErr.response) {
      return `HTTP ${anyErr.response.status ?? "?"} — ${JSON.stringify(anyErr.response.data)}`;
    }
    if (anyErr.message) return anyErr.message;
  }
  return String(err);
}

async function main(): Promise<void> {
  console.log(`[i] .env: ${loaded.error ? `NOT found at ${envPath}` : `loaded from ${envPath}`}`);

  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  if (!apiKey) {
    console.error("[x] CIRCLE_API_KEY is empty/unset in .env.");
    console.error("    Create a Testnet API key at console.circle.com -> API Keys, then re-run.");
    process.exit(1);
  }
  console.log(`[i] CIRCLE_API_KEY: ${mask(apiKey)}`);

  const existing = process.env.CIRCLE_ENTITY_SECRET?.trim();
  if (existing) {
    console.log("[i] CIRCLE_ENTITY_SECRET is already set in .env — nothing to do.");
    console.log("    To register a fresh one: clear CIRCLE_ENTITY_SECRET in .env and re-run.");
    return;
  }

  // A 32-byte hex string IS the entity secret (Circle ships no generator helper).
  const entitySecret = randomBytes(32).toString("hex");

  // Print it FIRST — before any network call — so it is never lost.
  console.log("");
  console.log("  ┌─ Your new Entity Secret (save this — paste into .env) ─────────────");
  console.log("  │ CIRCLE_ENTITY_SECRET=" + entitySecret);
  console.log("  └───────────────────────────────────────────────────────────────────");
  console.log("");
  console.log("[>] Registering the ciphertext with Circle…");

  let recoveryFile = "";
  try {
    const res = await registerEntitySecretCiphertext({ apiKey, entitySecret });
    recoveryFile = res.data?.recoveryFile ?? "";
  } catch (err) {
    const detail = errorDetail(err);
    console.error("\n[x] Registration call failed: " + detail);
    if (/already|exist|registered/i.test(detail)) {
      console.error(
        "\n    An entity secret is ALREADY registered on this Circle account (likely from an\n" +
          "    earlier run). The secret above was NOT registered. Since a test-account secret\n" +
          "    can't be recovered without its recovery file, the cleanest fix is to reset the\n" +
          "    Entity Secret in the Console (Configurator) — or use a fresh Testnet API key —\n" +
          "    then clear CIRCLE_ENTITY_SECRET in .env and re-run. Tell me and I'll walk you through it.",
      );
    }
    process.exit(1);
  }

  const recoveryDir = resolve(repoRoot, ".circle-recovery");
  mkdirSync(recoveryDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const recoveryPath = resolve(recoveryDir, `recovery-${stamp}.dat`);
  writeFileSync(recoveryPath, recoveryFile);

  console.log("");
  console.log("[ok] Entity Secret registered with Circle.");
  console.log("  1) Paste the CIRCLE_ENTITY_SECRET line above into .env.");
  console.log(`  2) Recovery file written to ${recoveryPath} (gitignored).`);
  console.log("     Move it somewhere safe & private — it's the only way to reset the secret if lost.");
  console.log("");
}

main().catch((err: unknown) => {
  console.error("[x] Unexpected error: " + errorDetail(err));
  process.exit(1);
});
