# Ephor — Blockers & Decisions

Scope discipline is a security control. Blockers, scope proposals, and deviations are recorded here rather than acted on silently.

## Open blockers

### BLOCKER-1 — Deployment credentials required for on-chain addresses
**Status:** OPEN — needs Ben.
The acceptance criterion "3 contracts deployed + verified on Arc testnet; addresses in README" cannot be met without:
- `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET` (Circle Console, Agora account) — for developer-controlled demo wallets.
- A faucet-funded `DEPLOYER_PRIVATE_KEY` (throwaway, testnet only) — from https://faucet.circle.com.
- `USDC_ADDRESS` (the 6-dec USDC on Arc — brief lists `0x36…00`; confirm the full address).
- `ARC_VERIFIER_URL` + `ARC_ETHERSCAN_API_KEY` if Arc exposes an Etherscan-compatible verifier (for `--verify`).

Everything non-deploy is complete and testable offline. The moment the env vars are set:
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify
```
writes `contracts/deployments/arc-testnet.json`; paste the addresses into the README table. `script/SeedDemo.s.sol` then configures + funds the demo company.

## Decisions & deviations (recorded, within the brief's intent)

- **Reserve protection (added).** `successorPay` and `ownerWithdraw` cannot spend the earmarked payroll reserve (`ExceedsDistributable`); only `runPayroll` and the terminal sweep touch it. This strengthens INV-6 (payroll continuity) against a hostile successor and accidental owner drain. An owner may intentionally un-earmark via `releaseReserve`. Beyond the literal brief, but squarely within its "payroll never misses" intent.
- **EVM version = `shanghai`.** Conservative default for a new chain (PUSH0 yes; no Cancun-only opcodes). Re-verify Arc's EVM version before deploy; bump to `cancun` only if confirmed. (See DX_FEEDBACK.md.)
- **Stage-3 legs deferred to Phase 3.** Per the dated plan, the Phase-1 sweep performs exact percentage splits + `Split` receipts. The App Kit **Swap**, **CCTP v2** cross-chain, and **USYC** park legs land in Phase 3; the `Allocation` model + `PolicyLegs` types already carry the metadata (`convertTo`, `crossChainDomain`, `yieldPark`).
- **No new dependencies.** Everything is within the locked stack. `better-sqlite3` (locked) builds cleanly on Node 24 (Windows); no substitution needed.

## Provider interface stability
`packages/shared/src/provider.ts` (`EphorProvider`) and `scenarios.ts` are **frozen** as of Phase 0. Any change is a stop-and-ask (it would break the parallel design session).
