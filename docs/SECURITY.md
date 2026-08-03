# Ephor — Security Posture

Institution-grade by construction. This is a continuity mechanism, so correctness beats cleverness everywhere.

## Contract security controls
- **CEI** — checks → effects → interactions in every state-changing function. E.g. `SuccessionPlan.advanceStage` sets `swept = true` before calling the vault; `ContinuityVault.runPayroll` decrements the reserve and advances `nextPayrollBlock` before transferring.
- **Reentrancy** — `nonReentrant` (OpenZeppelin `ReentrancyGuard`) on every value-moving function in `ContinuityVault`.
- **SafeERC20** — all token movement via `safeTransfer` / `safeTransferFrom`.
- **Pull-over-push** — both the stage-3 settlement **and** payroll escrow to a `claimable` ledger via the shared `_trySendOrEscrow`: a recipient that cannot receive (e.g. a token blocklist) is credited and can `claim()` later, so one bad recipient never bricks the batch. Payroll is a bounded batch (`MAX_PAYROLL_BATCH = 10`) drawn from a pull-safe reserve.
- **Custom errors** — no string reverts; every failure is a typed error.
- **Events on every transition** — nothing happens silently (notice, handover, spend, split, sweep, cancel, freeze).
- **6-dec accounting** — matches USDC/EURC/USYC base units.
- **Caps enforced in the vault**, never in the UI.
- **No proxies** — immutable, non-upgradeable contracts. What you audit is what runs.
- **Block-count windows** — never `block.timestamp` (Arc timestamps repeat).
- **Reserve protection** — the earmarked payroll reserve cannot be spent by a successor or accidentally withdrawn by the owner (`ExceedsDistributable`); only payroll pulls and the terminal sweep touch it.

## The six named invariants → code → tests

| Invariant | Enforced in | Proven by |
|---|---|---|
| **INV-1 owner-supremacy** | `SuccessionPlan.heartbeat/cancel` reset stage to `Active` unless swept | `test_HeartbeatCancelsFrom*`, `testFuzz_OwnerSupremacyAnyOrdering`, `invariant_OwnerSupremacy` |
| **INV-2 stage monotonicity** | `SuccessionPlan.advanceStage` (+1 only) | `test_FullSequenceMonotonic`, `invariant_StageMonotonicity`, `invariant_SweptImpliesSweepStage` |
| **INV-3 no early execution** | window checks in `advanceStage` (block counts) | `test_AdvanceFromActive_RevertsBeforeWindow`, `testFuzz_NoEarlyExecution` |
| **INV-4 split conservation** | `ContinuityVault.executeContinuitySettlement` + `lockConfig` (Σ bps == 10 000) | `test_Sweep_SplitConservationExact`, `testFuzz_SplitConservation`, `invariant_ConservationAfterSweep` |
| **INV-5 cap safety** | `ContinuityVault.successorPay` (per-tx + rolling daily + allowlist) | `test_SuccessorPay_*`, `testFuzz_CapSafety`, `invariant_CapSafety` |
| **INV-6 payroll continuity** | `ContinuityVault.runPayroll` (no stage/freeze gate; per-payee escrow-on-failure) + reserve protection | `test_PayrollContinuity_*`, `test_Payroll_NotBrickedByBlockedPayee`, `invariant_PayrollContinuity` |

Plus a **solvency** invariant: the vault balance always fully backs the earmarked reserve (`invariant_Solvency`).

## Test summary
- **83 tests**, all green: unit + fuzz + 7 stateful invariants (each 256 runs × 32 depth, 0 reverts, 0 violations) + an end-to-end staircase suite.
- **Coverage**: ≥ 98% lines (all three contracts ≥ 90% lines); every escrow branch (sweep + payroll, success + failure) is exercised.
- **Gas snapshots**: `contracts/.gas-snapshot`.

## Independent adversarial review
An adversarial contract review ([docs/REVIEW.md](REVIEW.md)) found **0 Critical, 1 High, 1 Medium, 4 Low, 3 Nit**, and verified all six invariants sound. Fixed same-day: **H-1** (guardian 2-of-3 was DoS-able by one bad guardian → now a true per-direction tally), **M-1** (push sweep could be bricked by one blocklisted recipient → now pull-over-push escrow), **L-1** (successor spend now Handover-only), **L-4** (succession can't arm before config is locked), and nits N-2/N-3. L-2/L-3/N-1 documented as accepted v1 trade-offs.

A **second post-deployment review (2026-08-03)** re-verified those fixes and swept the web/scripts surface. It fixed **H-A** — `runPayroll` was all-or-nothing, so one non-receiving payee could permanently brick the whole team's payroll in the founder-gone state (the exact INV-6 failure mode); payroll now shares the sweep's escrow-on-failure path — and **L-A** (duplicate-successor guard). The dashboard's private-key handling audited clean (server-only, never in the client bundle; no committed secrets). Details in REVIEW.md.

## Static analysis
- **Slither**: scheduled for Phase 3 (Jul 27–Aug 2). Findings will be triaged here (clean-or-explained). *(Not yet run at CP2.)*

## Known limitations (see THREAT_MODEL.md)
- Social recovery / lost-key rotation is documented but **not built**.
- Assumes standard 6-dec ERC-20s; no fee-on-transfer / rebasing support.
- Guardian key-rotation authority is described as production hardening, not implemented.
