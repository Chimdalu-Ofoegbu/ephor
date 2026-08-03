# Ephor Continuity Vault — Adversarial Security Review

**Scope:** `contracts/src/SuccessionPlan.sol`, `contracts/src/ContinuityVault.sol`, `contracts/src/Guardian2of3.sol`, `contracts/src/interfaces/IEphor.sol`
**Judged against:** INV-1..6 (`.planning/REQUIREMENTS.md`), `docs/THREAT_MODEL.md` (T1–T10), `docs/SECURITY.md`.
**Method:** manual source review + cross-reference to the existing test suite (read-only; no source/tests modified, nothing deployed).
**Reviewer stance:** FORCE — assume the continuity trigger is a hostile-takeover kit until proven otherwise.

## Severity summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 4 |
| Nit | 3 |

**No Critical findings.** The core invariants I tried hardest to break all hold under adversarial ordering: owner-supremacy (INV-1), stage monotonicity/no-skip (INV-2), no-early-exec block windows (INV-3), split conservation incl. dust routing (INV-4), per-window cap + reserve protection (INV-5), and payroll continuity/solvency (INV-6). See "Invariants I could NOT break" at the bottom for the specific attacks that failed.

The one finding that breaks a *documented* security guarantee is **H-1** (a single guardian can defeat the 2-of-3 freeze), which contradicts THREAT_MODEL T10's "tolerates one compromised guardian."

---

## Resolutions (applied 2026-07-26, same day)

| Finding | Status | Fix |
|---|---|---|
| **H-1** guardian DoS | ✅ Fixed | `Guardian2of3.vote` tallies votes **per direction**; any two concordant guardians win regardless of a dissenter/first-mover. Tests: `test_DissentDoesNotBlockMajority`, `test_CompromisedGuardianCannotBlockFreeze`. |
| **M-1** sweep brick | ✅ Fixed | Terminal settlement is now **pull-over-push**: `_deliver` escrows to a `claimable` ledger on transfer failure (blocklist/revert) and recipients `claim()`. Test: `test_Sweep_NotBrickedByBlockedRecipient`. |
| **L-1** spend in Sweep | ✅ Fixed | `successorPay` gates on `stage == Handover` exactly. Test: `test_SuccessorPay_ClosedInSweepStage`. |
| **L-4** sweep dead-end | ✅ Fixed | `advanceStage` requires `vault.configLocked()` before arming (Active→Notice). Test: `test_Advance_RevertsIfConfigNotLocked`. |
| **N-2** dup heartbeat/cancel | ✅ Fixed | both call shared `_heartbeat()`. |
| **N-3** `_enter` reconstructs `from` | ✅ Fixed | `_enter(to, from)` takes the captured predecessor. |
| **L-2** tumbling daily cap | 📋 Accepted | Tumbling-window burst is by-design for v1; per-tx cap is the hard bound. |
| **L-3** global allowlist | 📋 Accepted | v1 treats successors as a shared operator set; per-successor allowlist is a Phase-3 hardening. |
| **N-1** boundary `>` vs `>=` | 📋 Accepted | Internally consistent with `nextAdvanceBlock`; 1-block nominal difference only. |

Post-fix: **81 tests green** (incl. the end-to-end staircase suite), 98.8% line coverage; all six invariants hold (conservation/solvency updated for the escrow ledger).

---

## Second review (2026-08-03) — post-deployment sweep

A fresh adversarial pass after the live deployment, now covering the web/scripts surface too. The prior H-1/M-1/L-1/L-4 fixes were re-verified **present and complete**. One new High and one new Low were found and fixed; the web key-handling audited clean; the rest documented.

| Finding | Severity | Status | Fix / disposition |
|---|---|---|---|
| **H-A** payroll brick | High | ✅ Fixed | `runPayroll` was all-or-nothing push, so one non-receiving payee (token blocklist / reverting wallet) bricked the **entire** batch, permanently, in the founder-gone state — defeating INV-6 exactly where it matters most. M-1's escrow was applied to the sweep but never to payroll. Both now share `_trySendOrEscrow`: a failing payee is escrowed to `claimable` and the healthy payees are still paid. Test: `test_Payroll_NotBrickedByBlockedPayee`. |
| **L-A** duplicate successor | Low | ✅ Fixed | `addSuccessor` had no duplicate guard — a wallet added twice received a doubled settlement split while caps tracked only the last entry. Now reverts `AlreadySuccessor`. Test: `test_AddSuccessor_RevertsOnDuplicate`. |
| **web-M** nonce race | Medium | ✅ Fixed | Dashboard `act()` could fire two writes from the shared deployer key on a fast double-click → nonce collision / dropped action. Added a synchronous `inFlight` re-entry guard. (Operational note: don't point the keeper at the same key that drives the UI.) |
| **web-L** `$bigint:` parse | Low | ✅ Fixed | `serial.parse` now coerces only a strictly-formed `^\$bigint:-?\d+$` tag, so a legitimate string with that prefix survives and a malformed suffix can't throw inside `JSON.parse`. |
| **L-B** successor runway | Low | 📋 Accepted | Capped successor spend lasts the whole Handover (permissionless advance isn't automatic). Still cap- and reserve-bounded; owner heartbeat or a guardian freeze ends it. A max-Handover-duration is a future hardening. |
| **L-C** guardian round liveness | Low | 📋 Accepted | A 1-1 vote split with the third guardian absent can strand a round; a `plan.guardian` mismatch makes `vote()` inert. Neither breaks the one-compromise tolerance; both are operational (alert if `plan.guardian != guardian`). |
| **key-exposure audit** | — | ✅ Clean | `DEPLOYER_PRIVATE_KEY` is server-only (route handlers + `next.config.mjs` server-side load); no `NEXT_PUBLIC_*` or client import path reaches it; `.env` is untracked; zero committed secrets across all tracked files. |

Post-fix: **83 tests green** (added the two above), all six invariants still hold; the three deployed contracts are source-verified on arcscan (Blockscout).

INFO (owner-misconfig hardening, not fixed): a successor wallet equal to the vault address self-transfers its split (stranding it); `successors`/`allocations` are unbounded (gas-limit risk at absurd sizes). Both are config-time footguns under sole owner control — candidates for zero/self checks and a length cap in a later pass.

---

## HIGH

### H-1 — A single guardian can veto/DoS the 2-of-3 freeze by voting first in the opposite direction (breaks T10 one-compromised-guardian tolerance)

**File:** `contracts/src/Guardian2of3.sol:65-89` (direction lock at lines 69-74, `ConflictingVote` at 72).

**Root cause.** A round's action *direction* is fixed by whoever casts the **first** vote (`desiredFreezeInRound[r] = freeze`, line 71). Any subsequent guardian voting the other direction is **reverted** (`ConflictingVote`, line 72) instead of being tallied. The round only advances (`round = r + 1`) when two *same-direction* votes accumulate (line 82). There is no per-direction tally, no override, and no timeout.

**Failing scenario (inputs → wrong outcome).** Duress event (T1): the owner is jammed and the staircase is advancing. Honest guardians `g2,g3` want to `freeze`. Compromised guardian `g1` (the single compromise the model claims to tolerate) wants to prevent it.

1. `g1` front-runs the round: `vote(false)` → `roundInitialized[r]=true`, `desiredFreezeInRound[r]=false`, `voteCount[r]=1`.
2. `g2` calls `vote(true)` → `desiredFreezeInRound[r] (false) != true` → **revert `ConflictingVote`**. `g3` likewise reverts.
3. The 2-of-3 majority now **cannot enact freeze in round `r`**. Their only on-chain move is to *agree* with `g1` (`vote(false)`), which reaches threshold and executes `plan.unfreeze()` — a no-op if not frozen — advancing to `r+1`.
4. In `r+1`, `g1` front-runs `vote(false)` again. Loop repeats indefinitely.

Result: as long as `g1` wins the ordering of each round's first vote, **the freeze never fires** — the primary T1 mitigation is neutralized by one guardian. Even absent malice this is a correctness bug: the contract does **not** implement "2-of-3 decides"; it implements "first voter picks direction, then needs one more to agree." The existing test `test_ConflictingVote_Reverts` (Guardian2of3.t.sol:44-50) enshrines this as intended, so the DoS is unexamined.

**Impact.** Defeats the documented "tolerates one compromised guardian" property (T10) for the freeze action, in exactly the scenario (T1 forced-silence) the guardian exists for. Liveness/veto-defeat, not direct theft — but it removes the only brake while the owner is silenced. Severity is bounded below Critical only because the staircase still enforces its long block windows and the owner can still cancel if they regain their key.

**Suggested fix.** Tally votes per direction and execute whichever reaches threshold; do not let the first voter lock direction and do not revert on disagreement:

```solidity
// per (round => direction => count) plus per-guardian single-vote-per-round
mapping(uint256 => mapping(bool => uint8)) public dirVotes;

function vote(bool freeze) external onlyGuardian {
    uint256 r = round;
    if (confirmedInRound[r][msg.sender]) revert AlreadyConfirmed();
    confirmedInRound[r][msg.sender] = true;
    uint8 votes = dirVotes[r][freeze] + 1;
    dirVotes[r][freeze] = votes;
    emit GuardianVote(msg.sender, freeze, r, votes);
    if (votes >= THRESHOLD) {
        round = r + 1;
        emit GuardianActionExecuted(freeze, r);
        freeze ? plan.freeze() : plan.unfreeze();
    }
}
```

This guarantees any two concordant guardians win regardless of a third's opposing (or first-mover) vote, restoring true 2-of-3 semantics.

---

## MEDIUM

### M-1 — Push-based terminal settlement can be permanently bricked by a single non-receiving recipient, locking the entire distributable treasury (contradicts "pull-over-push" claim)

**File:** `contracts/src/ContinuityVault.sol:271-299` (pushes at 278 and 296); reached from `SuccessionPlan.advanceStage` sweep branch `SuccessionPlan.sol:134-136`.

**Root cause.** `executeContinuitySettlement` **pushes** funds to every successor wallet and every allocation recipient in a single atomic loop. `SECURITY.md:9` claims "Pull-over-push — successors and beneficiaries pull/receive," but the code is push-based for both. If any one `safeTransfer` reverts, the whole settlement reverts. Crucially, `SuccessionPlan.advanceStage` sets `swept = true` (line 134) *before* calling the vault, so a revert rolls `swept` back to `false` — the sweep can be retried, but if the offending recipient **permanently** cannot receive, the terminal settlement can **never** complete.

**Failing scenario (inputs → wrong outcome).** Over the multi-year dead-man horizon, one beneficiary address (`successor.wallet` or `allocation.recipient`) becomes unable to receive USDC/EURC — e.g. added to the token issuer's **blocklist**, or is a contract that reverts on the token's transfer hook. At sweep time, `payrollAsset.safeTransfer(recipient, amount)` reverts → `executeContinuitySettlement` reverts → `advanceStage` reverts, `swept` un-sets. Config is immutable (`configLocked`), the recipient set cannot be changed, and (the sweep is only reached because) the owner is gone and cannot `heartbeat`/`ownerWithdraw`. **The entire distributable balance is permanently locked.** (The earmarked reserve still pays payroll, so INV-6 survives, but INV-4's beneficiaries never get paid.)

**Impact.** Total loss of the distributable treasury under a realistic, non-attacker-controlled trigger (USDC blocklist is a live risk for a 6-dec settlement asset). Not an exploit an attacker can force onto a third party (a blocklisted attacker only harms themselves), which is why this is Medium and not High — but impact-if-triggered is catastrophic and irreversible.

**Suggested fix.** Make beneficiary payouts pull-based (credit `owed[recipient] += amount`, let recipients `claim()`), or wrap each leg in a try/catch that credits a claimable balance on failure so one bad recipient cannot block the others. At minimum, align the docs with reality or document the blocklist assumption in THREAT_MODEL "Token weirdness."

---

## LOW

### L-1 — `successorPay` remains callable in Stage.Sweep (pre-settlement), extending capped-spend runway beyond the documented "Stage 2"

**File:** `contracts/src/ContinuityVault.sol:230` (`uint8(plan.stage()) < uint8(Stage.Handover)`).

The gate is `stage >= Handover`, which is satisfied by **both** Handover (2) **and** Sweep (3). THREAT_MODEL/SECURITY describe the successor as a "Stage 2" capped role, but a hostile successor keeps spending (up to per-tx + daily caps) throughout the entire `challengeBlocks[2]` Sweep challenge window, potentially draining several `dailyCap` windows of *distributable* funds before the split executes. It is still cap-bounded, reserve-protected (line 248), and cancellable by owner heartbeat, so payroll (INV-6) and the reserve are safe — but the runway is larger than the "Stage 2" framing implies. Consider gating on `stage == Handover` (exact) if successor spend is meant to stop once the sweep window opens.

### L-2 — Rolling daily cap is a *tumbling* window; ~2× `dailyCap` is spendable across a boundary

**File:** `contracts/src/ContinuityVault.sol:238-244`.

The window resets at fixed offsets from first spend (`block.number >= windowStartBlock + dailyWindowBlocks`). A successor can spend the full `dailyCap` in the last block of window N and again in the first block of window N+1 — ~2× `dailyCap` in two consecutive blocks. INV-5 as *coded* holds (≤ `dailyCap` within any one window), but the docs' word "rolling" implies a sliding window, which would forbid this burst. Documented as "tumbling," so this is by-design; flagged so production can weigh a sliding window or a burst guard. No per-tx or reserve invariant is violated.

### L-3 — Allowlist is global across all successors, not per-successor

**File:** `contracts/src/ContinuityVault.sol:154-156` (writes shared `allowlistedPayee`), consumed at `227-232`.

`addSuccessor`'s `allowlist` entries are written into a single shared `allowlistedPayee` mapping. Any successor may therefore pay any payee that *any other* successor allowlisted. If successors are meant to have disjoint payee sets, a hostile successor can route capped spend to a co-successor's vendor. Bounded by caps and reserve protection, so no invariant breaks — but it is broader authority than "an allowlisted payee" suggests. Consider keying the allowlist by successor.

### L-4 — Sweep dead-ends if `lockConfig()` was never called (or plan/vault links mismatched); no pre-advance readiness check

**File:** `contracts/src/ContinuityVault.sol:260` (`if (!configLocked) revert ConfigNotLocked`) vs `SuccessionPlan.advanceStage:116-137` (no `configLocked` awareness).

The staircase can advance all the way into Stage.Sweep and attempt settlement even when the vault config was never locked; `executeContinuitySettlement` then reverts `ConfigNotLocked`, `swept` rolls back, and (owner being gone) the sweep is permanently stuck — the whole distributable balance is frozen. Same failure mode if `plan.vault`/`vault.plan` are cross-linked incorrectly (settlement `msg.sender != address(plan)` check at line 259). These are operational/deployment preconditions with an irreversible failure mode; document `lockConfig` as mandatory and/or expose `configLocked` so advancement past Handover can require readiness.

---

## NIT

### N-1 — Active→Notice window boundary is inclusive-`>` while challenge windows are inclusive-`>=` (1-block semantic asymmetry)

**File:** `contracts/src/SuccessionPlan.sol:123` (`block.number <= last + windowBlocks`) vs `126,129,133` (`block.number < entered + challengeBlocks[i]`).

Active→Notice advances at `last+window+1` (effective wait `window+1` blocks); each challenge advances at `entered+c` (effective wait exactly `c`). INV-3 holds for both and `nextAdvanceBlock()`/`isOverdue()`/`deadlineBlock()` are internally consistent with the `>` choice, so no bug — but the two windows interpret their nominal parameter differently by one block. Pick one convention for spec clarity.

### N-2 — `heartbeat()` and `cancel()` are byte-identical; `SweepExecuted`/settlement paths duplicate CEI intent

**File:** `contracts/src/SuccessionPlan.sol:86-96` and `99-109`.

The two functions have identical bodies. Fine functionally (both are owner-only, both reset), but the duplication is a maintenance hazard — a future fix to one can miss the other. Consider `cancel()` calling an internal `_heartbeat()`.

### N-3 — Stale round storage retained; `_enter` reconstructs `from` from `to-1`

**File:** `Guardian2of3.sol:81-89` (old-round maps not cleared — harmless, new votes live in `r+1`); `SuccessionPlan.sol:144` (`StageAdvanced(Stage(uint8(to)-1), to)` reconstructs the predecessor rather than using the captured `from`).

Both are cosmetic. The `_enter` reconstruction is correct only because advancement is strictly sequential; passing the captured `from` would be more robust against future refactors. No current impact.

---

## Invariants I tried hard to break and could NOT (explicit negatives)

- **INV-1 owner-supremacy — SOUND.** `heartbeat()/cancel()` revert only on `swept` and otherwise reset any stage to Active (SuccessionPlan.sol:86-109). Within a block, a heartbeat ordered before `advanceStage` forces the sweep to revert `WindowNotLapsed` (fresh `lastHeartbeatBlock`, line 123); ordered after the sweep it reverts `AlreadySwept`. `frozen` does **not** gate heartbeat, so the owner wins even while frozen. No stage `< swept` where heartbeat fails to cancel; no pre-sweep-heartbeat ordering that lets the sweep through.
- **INV-2 monotonicity / T7 — SOUND.** `advanceStage` moves exactly one step; the Sweep two-step (`_enter(Sweep)` then settle) cannot be short-circuited; only regression is heartbeat→Active.
- **INV-3 no early exec / T6 — SOUND.** Every gate is a `block.number` comparison against a stored block; no `block.timestamp`. Widened to `uint256` in the hot path (lines 123-133) so no overflow. `nextAdvanceBlock()` matches the gates for all four stages.
- **INV-4 conservation / T9 — SOUND.** `lockConfig` enforces Σ bps == 10 000 (ContinuityVault.sol:171-182). The last item (`idx == itemCount`) receives `dist - distributed`, absorbing all floor-division dust; I verified no intermediate `distributed > dist` (sum of floors ≤ `dist`), so no underflow, and reserve top-ups (`recipient == address(this)`) keep tokens in-vault while re-earmarking — post-sweep `balance == payrollReserve` exactly (solvency preserved).
- **INV-5 cap safety / T4 — SOUND within a window.** per-tx (line 235), tumbling daily (238-244), allowlist (232), successor-only (229), reserve floor (248) all enforced; effects precede the transfer (250-251); `nonReentrant`. Reserve can never be reached by a successor. (See L-2 for the cross-boundary burst nuance.)
- **INV-6 payroll continuity / T10 — SOUND.** `runPayroll` has **no** stage or `frozen` gate (ContinuityVault.sol:201-223); CEI decrements `payrollReserve` and advances `nextPayrollBlock` before transfers. A due, reserve-funded batch cannot be starved by a successor (M reserve guard) or by the owner (`ownerWithdraw` reserve floor, line 307). Freeze stops `successorPay` and `advanceStage` but not payroll — matching T10.
- **Reentrancy / CEI — SOUND.** Every value-moving vault function is `nonReentrant`; `SuccessionPlan.advanceStage` sets `swept=true` before the external settlement call, and every plan mutator checks `swept`, so re-entry into the plan or any vault function during settlement reverts. SafeERC20 throughout.
- **Guardian replay — SOUND.** Votes are `round`-scoped; `round` advances before the external freeze/unfreeze (CEI); a guardian cannot double-vote in a round. (The direction-lock weakness is H-1, a separate issue from replay.)
- **Access control — SOUND.** `setVault`/`setPlan` one-shot; config mutators `onlyOwner notLocked`; `executeContinuitySettlement` `onlyPlan`; `freeze/unfreeze` guardian-gated; `heartbeat/cancel` owner-only. No missing modifiers found.

---

_Reviewed: 2026-07-26 · Reviewer: adversarial contract review (read-only) · No source or tests modified._
