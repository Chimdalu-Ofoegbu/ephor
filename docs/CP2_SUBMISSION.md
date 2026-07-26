# Ephor — CP2 Submission (Sun Jul 26)

**Ephor is business continuity as programmable settlement on Arc.** The founder heartbeats; if the pulse stops, a staged, cancellable succession staircase executes onchain — notice → capped handover → policy sweep — **while payroll never misses a beat.** One heartbeat from the returning owner rewinds everything. Banks freeze accounts when someone disappears; Ephor does the opposite. *The state never stops.*

CP2 asks for **repo + progress + addresses.**

## Repo
Public: **https://github.com/Chimdalu-Ofoegbu/ephor** (this session builds the contracts + backend; a parallel session builds the interface).

## Progress

**Done (Phase 0 — Foundation, and Phase 1 — Continuity Core):**
- ✅ pnpm + Foundry monorepo; OpenZeppelin v5.6.1; clean module boundaries for the later Zygos merge.
- ✅ **Frozen `EphorProvider` interface + six deterministic scenarios** (`packages/shared`) — typechecks; unblocks the design session's `MockEphorProvider` and the `mock↔live` swap.
- ✅ **Three contracts** — `ContinuityVault`, `SuccessionPlan`, `Guardian2of3` (Solidity 0.8.24; CEI, `nonReentrant`, SafeERC20, custom errors, events on every transition, 6-dec, block-count windows, caps in the vault).
- ✅ **73 Foundry tests** — unit + fuzz + **7 stateful invariants covering all six named invariants** (256×32 each, 0 reverts, 0 violations). **98.7% line coverage.** Gas snapshots committed.
- ✅ Deploy + SeedDemo scripts; keeper v1 skeleton (idempotent, permissionless advance + payroll driver; runs the six scenarios headlessly).
- ✅ Docs: THREAT_MODEL, SECURITY, METRICS, DX_FEEDBACK, BLOCKERS, `.env.example` (no secrets in git).

**The succession staircase (implemented):** heartbeat → Stage 1 Notice → Stage 2 capped Handover (payroll keeps paying) → Stage 3 Sweep (exact splits + receipts). Owner heartbeat at any stage < sweep-executed rewinds everything.

## Addresses

| Contract | Address | Explorer |
|---|---|---|
| ContinuityVault | **pending deploy** | — |
| SuccessionPlan | **pending deploy** | — |
| Guardian2of3 | **pending deploy** | — |

**Deployment is credential-blocked, not code-blocked** (see [BLOCKERS.md](../BLOCKERS.md#blocker-1)). The deploy + verify path is written and compiles; it needs Circle Console credentials + a faucet-funded deployer key (env vars only). Once provided:
```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify
```

## Verify the work now (no credentials needed)
```bash
pnpm install
pnpm --filter @ephor/shared typecheck   # provider + six scenarios
pnpm contracts:test                      # 73 tests: unit + fuzz + 6 invariants
pnpm contracts:coverage                  # ~98.7% lines
pnpm --filter @ephor/keeper scenario     # prints the six demo beats
```

## Named invariants — all proven
INV-1 owner-supremacy · INV-2 stage monotonicity · INV-3 no early execution · INV-4 split conservation · INV-5 cap safety · INV-6 payroll continuity. Map to code + tests in [SECURITY.md](SECURITY.md).

## The two money-shots (proven in tests; live at finals)
1. **The founder goes silent — payroll never misses.** `test_PayrollContinuity_*` + `invariant_PayrollContinuity`.
2. **The founder returns — one heartbeat rewinds the staircase.** `test_HeartbeatCancelsFrom*` + `testFuzz_OwnerSupremacyAnyOrdering` + `invariant_OwnerSupremacy`.

## What's next (per the dated plan)
- Phase 2–3 (Jul 27–Aug 2): live deploy + verify (unblock addresses), stage-3 multi-leg executor (Swap + CCTP + USYC), `LiveEphorProvider` headless, Slither, **UI HANDOFF GATE**.
- Phase 3 (Aug 3–8): scenario drivers 5× clean, README addresses + Mermaid, support video, submit Aug 8.

## Division of labor
This repo = `contracts/`, `apps/keeper`, `packages/shared`, `scripts/`, `docs/`. **`apps/web` / `packages/ui` are owned by a separate design session** and are intentionally absent until the recorded UI handoff. Zero stray diffs there.
