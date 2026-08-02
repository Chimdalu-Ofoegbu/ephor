/**
 * Generate throwaway EOA wallets for the Ephor demo actors.
 *
 * Ephor uses plain EOAs for the demo actors (founder, successors, guardians,
 * vendor) rather than Circle developer-controlled wallets — the contracts only
 * ever see addresses, so provenance is irrelevant, and plain keys are simpler and
 * more robust for a live camera run. This prints a ready-to-paste `.env` block:
 * one private key per actor, plus the three guardian ADDRESSES the deploy script
 * needs for the Guardian2of3 constructor.
 *
 *   pnpm wallets:gen        (or: pnpm --filter @ephor/scripts gen-actors)
 *
 * Everything runs locally in YOUR terminal — the keys are generated on your
 * machine and never leave it. TESTNET ONLY: never paste a mainnet key anywhere.
 * After pasting, fund each address (except the vendor) with a little USDC from
 * https://faucet.circle.com — USDC is the gas token on Arc, so every sender needs
 * a small balance to transact.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

interface Actor {
  /** .env variable name for the private key. */
  key: string;
  /** Human-readable role. */
  label: string;
  /** Whether this address needs funding to send transactions. */
  needsGas: boolean;
}

const ACTORS: Actor[] = [
  { key: "OPERATOR_PRIVATE_KEY", label: "Founder / operator (heartbeat, cancel, withdraw)", needsGas: true },
  { key: "SUCCESSOR1_PRIVATE_KEY", label: "Successor 1 — COO (capped spend)", needsGas: true },
  { key: "SUCCESSOR2_PRIVATE_KEY", label: "Successor 2 — CFO (capped spend)", needsGas: true },
  { key: "GUARDIAN1_PRIVATE_KEY", label: "Guardian 1 (2-of-3 freeze vote)", needsGas: true },
  { key: "GUARDIAN2_PRIVATE_KEY", label: "Guardian 2 (2-of-3 freeze vote)", needsGas: true },
  { key: "GUARDIAN3_PRIVATE_KEY", label: "Guardian 3 (2-of-3 freeze vote)", needsGas: true },
  { key: "VENDOR_PRIVATE_KEY", label: "Allowlisted vendor (payee only — no gas needed)", needsGas: false },
];

function main(): void {
  const rows = ACTORS.map((a) => {
    const pk = generatePrivateKey();
    return { ...a, pk, address: privateKeyToAccount(pk).address };
  });

  const rule = "-".repeat(80);
  const out: string[] = [];

  out.push("");
  out.push("  Ephor demo actors — throwaway EOAs (TESTNET ONLY, generated locally).");
  out.push("");
  out.push("  Role -> address:");
  for (const r of rows) out.push(`    ${r.address}  ${r.label}`);
  out.push("");
  out.push(rule);
  out.push("  Copy everything below into your .env  (the .env file is gitignored):");
  out.push(rule);
  out.push("");
  for (const r of rows) {
    out.push(`# ${r.label}`);
    out.push(`${r.key}=${r.pk}`);
  }
  out.push("");
  out.push("# Guardian ADDRESSES for the deploy script (Guardian2of3 constructor):");
  rows
    .filter((r) => r.key.startsWith("GUARDIAN"))
    .forEach((r, i) => out.push(`GUARDIAN_${i + 1}=${r.address}`));
  out.push("");
  out.push(rule);
  out.push("  Next: fund each address that needs gas from https://faucet.circle.com");
  out.push("  (USDC is the gas token on Arc — every sender needs a small USDC balance).");
  out.push(rule);
  out.push("");

  console.log(out.join("\n"));
}

main();
