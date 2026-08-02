# Ephor — Blockers & Decisions

Scope discipline is a security control. Blockers, scope proposals, and deviations are recorded here rather than acted on silently.

## Open blockers

### BLOCKER-1 — Deployer wallet must be funded for on-chain addresses
**Status:** OPEN — needs Ben (one faucet action).
The acceptance criterion "3 contracts deployed + verified on Arc testnet; addresses in README" now needs only:
- A faucet-funded `DEPLOYER_PRIVATE_KEY` (throwaway, testnet only) — from https://faucet.circle.com. USDC is the gas token on Arc, so the deployer needs a small USDC balance.
- (Optional) `ARC_VERIFIER_URL` + `ARC_ETHERSCAN_API_KEY` if Arc exposes an Etherscan-compatible verifier — only for `--verify`; deploy works without it.

Resolved inputs (no longer blockers):
- `USDC_ADDRESS` — **confirmed** `0x3600000000000000000000000000000000000000` (native gas token + 6-dec ERC-20 view; Arc docs, Aug 2 2026).
- Demo actor wallets — plain EOAs via `pnpm wallets:gen` (no Circle Console dependency). See the Decision below.

Everything non-deploy is complete and testable offline. The moment the deployer is funded:
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify
```
writes `contracts/deployments/arc-testnet.json`; paste the addresses into the README table. `script/SeedDemo.s.sol` then configures + funds the demo company.

## Decisions & deviations (recorded, within the brief's intent)

- **Circle developer-controlled wallets dropped for demo actors (Option A).** The Entity Secret registration is one-shot — the recovery file downloads only once, and after a failed write following a successful network registration the test entity is permanently locked with no self-serve reset (documented in DX_FEEDBACK.md). Demo actors are now plain throwaway EOAs via `pnpm wallets:gen`; the contracts only ever see addresses, so this is functionally equivalent and more robust for a live run. Circle's App Kit / CCTP / USDC-as-gas contributions to the submission are unaffected — they live in the stage-3 legs, not actor custody.
- **Reserve protection (added).** `successorPay` and `ownerWithdraw` cannot spend the earmarked payroll reserve (`ExceedsDistributable`); only `runPayroll` and the terminal sweep touch it. This strengthens INV-6 (payroll continuity) against a hostile successor and accidental owner drain. An owner may intentionally un-earmark via `releaseReserve`. Beyond the literal brief, but squarely within its "payroll never misses" intent.
- **EVM version = `shanghai`.** Conservative default for a new chain (PUSH0 yes; no Cancun-only opcodes). Re-verify Arc's EVM version before deploy; bump to `cancun` only if confirmed. (See DX_FEEDBACK.md.)
- **Stage-3 legs deferred to Phase 3.** Per the dated plan, the Phase-1 sweep performs exact percentage splits + `Split` receipts. The App Kit **Swap**, **CCTP v2** cross-chain, and **USYC** park legs land in Phase 3; the `Allocation` model + `PolicyLegs` types already carry the metadata (`convertTo`, `crossChainDomain`, `yieldPark`).
- **No new dependencies.** Everything is within the locked stack. `better-sqlite3` (locked) builds cleanly on Node 24 (Windows); no substitution needed.

## Provider interface stability
`packages/shared/src/provider.ts` (`EphorProvider`) and `scenarios.ts` are **frozen** as of Phase 0. Any change is a stop-and-ask (it would break the parallel design session).
