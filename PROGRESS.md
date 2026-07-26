# Ephor — Progress Log

Date-stamped, newest first. Format: ✅ [what] — [files].

---

## 2026-07-26 — Bootstrap + Phase 0 (Foundation & Provider Contract)

**Environment & safety**
- ✅ Git initialized (`main`); author locked to the human maintainer; **AI co-authorship disabled at the source** (`includeCoAuthoredBy:false`) + `commit-msg` hook (strips trailers) + `pre-push` gate (blocks any Claude/Anthropic-credited commit). Empirically verified: a test commit with a planted trailer was stripped. — `.githooks/`, `.claude/settings.json`, `.gitattributes`
- ✅ GSD `model_profile = inherit` set + verified — `gsd-sdk init plan-phase 1` shows `researcher_model` / `planner_model` / `checker_model` all `inherit`. GSD subagents run on the session model, not a pinned tier. — `.planning/config.json`

**GSD planning spine**
- ✅ PROJECT.md, ROADMAP.md (4 phases mapped to brief phases 0–3), STATE.md, REQUIREMENTS.md (REQ-01..08 + the six named invariants). — `.planning/`
- ✅ Brief saved at repo root. — `PROMPT_BUILD.md`

**Monorepo scaffold**
- ✅ pnpm workspace + TypeScript base config; Foundry project (`solc 0.8.24`, shanghai EVM, fuzz/invariant profiles); OpenZeppelin v5.6.1 + forge-std installed as git submodules; toolchain smoke-tested (`forge test` green on a throwaway contract, since removed). — `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `contracts/foundry.toml`, `.gitmodules`
- ✅ `.env.example` complete (Arc + Circle + CCTP + keeper vars); **no secrets in repo**. — `.env.example`

**Phase 0 deliverable — the frozen provider contract (unblocks the design session)**
- ✅ `EphorProvider` interface (11 methods per brief) + `CreatePlanInput` / `CancelResult`. — `packages/shared/src/provider.ts`
- ✅ Domain model — vault, plan, staircase stages, heartbeat, successors + caps, payroll stream, allocations + legs, receipts, snapshot. Amounts in 6-dec `bigint`; windows in **block counts**. — `packages/shared/src/types.ts`
- ✅ **Six scenarios** as deterministic snapshots — `healthy`, `silence-begins`, `stage1-notice`, `stage2-handover`, `stage3-sweep`, `owner-returns` — with a full receipt trail (notice → handover → capped successor spend → payroll-mid-succession → splits/swap/CCTP/USYC → owner-returns rewind). — `packages/shared/src/scenarios.ts`, `fixtures.ts`
- ✅ Arc chain facts + viem clients + `LiveEphorProvider` behind `DATA_MODE` (structured stub; live reads wired in Phase 3). — `packages/shared/src/{addresses,chain,live-provider,index}.ts`
- ✅ `pnpm --filter @ephor/shared typecheck` **passes**. `better-sqlite3` compiles on Node 24.

**README + positioning**
- ✅ README with "continuity not probate" framing, Mermaid staircase, named invariants, status table, quickstart. — `README.md`

**Phase 1 — Continuity Core & Invariant Suite (CP2 core)**
- ✅ `SuccessionPlan` — monotonic, cancellable, block-count stage machine; heartbeat registry; owner-supremacy; guardian-freezable; permissionless advance. — `contracts/src/SuccessionPlan.sol`
- ✅ `ContinuityVault` — funds, capped successor spend (per-tx + rolling daily + allowlist), payroll reserve + bounded pulls, exact-conservation stage-3 split executor, **reserve protected** from successor/owner drains, owner supremacy over own funds. — `contracts/src/ContinuityVault.sol`
- ✅ `Guardian2of3` — round-scoped 2-of-3 veto (freeze/unfreeze) as the duress brake. — `contracts/src/Guardian2of3.sol`
- ✅ **73 Foundry tests** (unit + fuzz + **7 invariants for all six named invariants**; 256×32, 0 reverts/violations); **98.7% line coverage**; gas snapshot committed. — `contracts/test/`, `.gas-snapshot`
- ✅ Deploy + SeedDemo forge scripts (compile; ready for credentials). — `contracts/script/`
- ✅ Keeper v1 skeleton — idempotent permissionless advance + payroll driver; runs the six scenarios headlessly (`pnpm --filter @ephor/keeper scenario`). — `apps/keeper/src/`
- ✅ Docs — THREAT_MODEL (forced-silence + griefing + 10 threats), SECURITY (invariant→code map), METRICS (SaaS + 5bps), DX_FEEDBACK, BLOCKERS, CP2_SUBMISSION. — `docs/`, `BLOCKERS.md`

**Adversarial review + same-day fixes**
- ✅ Ran an independent adversarial contract review (GSD reviewer, session model) → `docs/REVIEW.md`: 0 Critical, 1 High, 1 Medium, 4 Low; all six invariants verified sound.
- ✅ Fixed **H-1** (guardian 2-of-3 was DoS-able by one compromised guardian → true per-direction tally), **M-1** (push sweep could be bricked by one blocklisted recipient → pull-over-push escrow + `claim()`), **L-1** (successor spend Handover-only), **L-4** (can't arm succession before config locked), nits N-2/N-3. → **78 tests green, 98.8% line coverage**; conservation/solvency invariants updated for the escrow ledger.

### Open blockers / next
- ⛔ **Deploy + verify (addresses)** blocked pending Circle Console credentials (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`) + a faucet-funded deployer key + confirmed `USDC_ADDRESS`/verifier — env vars only. Deploy script is written and compiles; see BLOCKERS.md. Everything else is complete and tested offline.
- 📋 **Phase 2–3 (next):** stage-3 multi-leg executor (App Kit Swap + CCTP v2 + USYC park), `LiveEphorProvider` live reads, Slither, scenario drivers 5× clean.
- 📋 **UI HANDOFF GATE** not yet reached — no `apps/web` touch until Ben confirms the design handoff.
