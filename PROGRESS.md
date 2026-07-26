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

### Open blockers / next
- ⛔ **Deploy + verify (addresses)** blocked pending Circle Console credentials (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`) + a faucet-funded deployer key — env vars only. Everything non-deploy proceeds.
- 🚧 **Phase 1 (next):** implement `SuccessionPlan` (stage machine) → `ContinuityVault` (funds, caps, payroll) → `Guardian2of3`, then the Foundry unit + fuzz + invariant suite for all six named invariants (≥ 35 tests, ≥ 90% coverage, gas snapshots).
- 📋 UI HANDOFF GATE not yet reached — no `apps/web` touch until Ben confirms the design handoff.
