# Ephor — Threat Model

Continuity mechanisms are attack surfaces wearing a safety costume: a poorly built inactivity trigger is a hostile-takeover kit. This document states the adversaries we design against and the concrete mitigations in code. **Prime directive: the owner's live key always wins; succession is a staircase with challenge windows, never a trapdoor.**

Windows are measured in **block counts** everywhere (`SuccessionPlan`), because Arc timestamps repeat and block height is the only trustworthy clock.

## Assets at risk
- The vault treasury (USDC/EURC/USYC balances in `ContinuityVault`).
- The **payroll reserve** (earmarked funds that must keep the team paid).
- Operational control (who may move funds, and how much).

## Actors & trust
- **Operator** — holds the live key; fully trusted for their own funds; supreme until the final sweep executes.
- **Successors (1–3)** — semi-trusted; gain only a *capped* operational role in Stage 2. Assume one may turn hostile.
- **Keeper** — untrusted convenience. Advancement is permissionless; the keeper can be replaced by anyone.
- **Guardians (2-of-3)** — trusted only to *freeze* the staircase (a brake), never to move funds.

---

## Threats & mitigations

### T1 — Forced-silence / hostage attack (jam the owner's check-ins to inherit the vault)
An adversary prevents the operator from heartbeating, hoping the staircase runs to Stage 3 and hands them the treasury.
**Mitigations**
- **Long heartbeat window** (`windowBlocks`, ≈14 days in production) plus **three challenge windows** — days of provable warning, not minutes.
- **Any owner-key transaction counts as a heartbeat** in operation (the keeper treats owner activity as liveness); on-chain, `heartbeat()`/`cancel()` reset instantly. *(The "any tx = heartbeat" reconciliation is a keeper/indexer policy; the on-chain canonical reset is `heartbeat()`.)*
- **Guardian veto** (`Guardian2of3.vote(true)` → `plan.freeze()`) halts advancement entirely during a suspected duress event. The guardians cannot move funds — only stop the machine.
- **Owner-supremacy (INV-1)**: a single heartbeat at any stage < sweep-executed rewinds everything.

### T2 — Griefing by repeated Stage-1 triggers (spam notices to harass the owner)
**Mitigations**
- Advancing `Active → Notice` requires the **full heartbeat window to have lapsed** (`block.number > lastHeartbeatBlock + windowBlocks`). A single owner heartbeat resets `lastHeartbeatBlock`, so an attacker cannot re-trigger a notice until the owner is genuinely overdue *again* — an inherent rate-limit of one notice per full window.
- Stage 1 moves no funds; the only cost of a spurious notice is one owner heartbeat to clear it.

### T3 — Keeper censorship (our keeper refuses to advance / is offline)
**Mitigation**: `advanceStage()` is **permissionless** — any address can call it once a window lapses. Liveness never depends on our keeper (`test_AdvanceIsPermissionless`).

### T4 — Successor collusion before Stage 3 (a hostile successor drains the vault during handover)
**Mitigations (INV-5, enforced in the vault, not the UI)**
- `successorPay` requires `plan.stage() >= Handover`, an **allowlisted payee**, `amount <= perTxCap`, and rolling `dailyCap`.
- **Reserve protection**: a successor can spend *operating funds only* — never the earmarked payroll reserve (`ExceedsDistributable`), so a hostile successor cannot starve payroll.
- Owner-supremacy still applies: the owner returning cancels the handover and revokes the role.

### T5 — Replayed / forged heartbeats
**Mitigation**: `heartbeat()` and `cancel()` are `onlyOwner` (`msg.sender == owner`). There is no signature-relay path to replay — liveness is an on-chain transaction from the owner key, domain-separated by chain id at the transaction layer.

### T6 — Timestamp manipulation / reorg games on windows
**Mitigation**: every window is a **block count**, never `block.timestamp`. Validators cannot repeat or fast-forward block height the way Arc timestamps can repeat.

### T7 — Stage skipping / regression
**Mitigation (INV-2)**: the state machine advances exactly one step per call and never skips; the only regression is `heartbeat()`-driven cancel-to-`Active`. Proven under fuzzed orderings (`invariant_StageMonotonicity`).

### T8 — Reentrancy on value moves
**Mitigation**: `nonReentrant` on every value-moving function; strict CEI (effects — e.g. `swept = true`, `payrollReserve -= …`, `spentInWindow = …` — precede token transfers); `SafeERC20` throughout.

### T9 — Split miscalculation / value leak in the final sweep
**Mitigation (INV-4)**: `lockConfig()` requires Σ successor `splitBps` + Σ allocation `bps == 10_000`; the sweep distributes exactly the distributable balance, routing dust to the last recipient so conservation is exact. Verified by `testFuzz_SplitConservation` and `invariant_ConservationAfterSweep`.

### T10 — Guardian abuse (rogue guardians grief the owner)
**Mitigations**: guardians can **only** freeze/unfreeze — never move funds or advance stages. Freezing does **not** stop payroll (the team keeps getting paid) and does **not** stop the owner's heartbeat/withdrawals. Votes are round-scoped so a stale confirmation can't be replayed. A 2-of-3 threshold tolerates one compromised guardian.

---

## Residual risks / out of scope (documented, not built)
- **Lost-key / social recovery** — production hardening; the guardian could hold key-rotation authority. Intentionally **not built** here (it is the riskiest surface and out of scope). Until built, a truly lost owner key means the staircase is the only recovery path.
- **Malicious owner** — the owner is trusted for their own funds by definition; Ephor is continuity, not custody-against-the-owner. (The reserve is nonetheless protected from *accidental* owner withdrawal.)
- **Token weirdness** — assumes standard 6-dec ERC-20s (USDC/EURC/USYC). Fee-on-transfer / rebasing tokens are out of scope. A recipient that *cannot receive* (issuer blocklist, reverting contract) is handled: the stage-3 settlement escrows their share to a `claimable` ledger (pull-over-push) rather than reverting the whole sweep.

## Test coverage of this model
Every threat above maps to at least one test in `contracts/test/` (unit, fuzz, or the invariant suite in `test/invariant/`). See [SECURITY.md](SECURITY.md) for the invariant-to-code map.
