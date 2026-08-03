# Ephor — Progress Log

Date-stamped, newest first. Format: ✅ [what] — [files].

---

## 2026-08-03 — Hardening pass: source-verified, INV-6 fix, live activity feed

- ✅ **All three contracts source-verified on arcscan** (Blockscout v11.2.3) — `SuccessionPlan`, `ContinuityVault`, `Guardian2of3` now expose verified Solidity + ABI on the explorer. Closes the last open acceptance criterion ("deployed **and** verified"); no Etherscan key needed. Recipe: `forge verify-contract <addr> <path>:<name> --verifier blockscout --verifier-url https://testnet.arcscan.app/api/ …`. — `docs/DX_FEEDBACK.md`
- ✅ **Second adversarial review (contracts + web/scripts).** Fixed **H-A** — `runPayroll` was all-or-nothing, so one non-receiving payee (token blocklist / reverting wallet) could permanently brick the whole team's payroll in the founder-gone state, defeating INV-6 exactly where it's supposed to hold; payroll now shares the sweep's escrow-on-failure path (`_trySendOrEscrow`). Fixed **L-A** (duplicate-successor guard). The web review audited the deployer key **server-only / never in the client bundle**, `.env` untracked, zero committed secrets. → **83 tests green** (+2). — `contracts/src/ContinuityVault.sol`, `contracts/test/EphorExtras.t.sol`, `docs/REVIEW.md`, `docs/SECURITY.md`
- ✅ **Live activity feed** — the dashboard decodes on-chain events (Heartbeat / StageAdvanced / PayrollPaid / SuccessorSpend / Split / settlement / guardian) via one `getLogs` over the recent window into the receipts panel; verified end-to-end (drove a live heartbeat → the feed lit up, state flipped healthy). Plus two web hardenings from the review: an `act()` re-entry guard (shared-key nonce race) and a strict `$bigint:` parse. — `apps/web/lib/live.ts`, `apps/web/components/Dashboard.tsx`, `apps/web/lib/serial.ts`, `packages/shared/src/types.ts`
- 📋 **Stage-3 legs assessed (fact-checked on-chain):** EURC (1.8 KB) + CCTP TokenMessenger (2.2 KB) are real contracts on Arc; USYC token/teller/entitlements are identical 183-byte minimal proxies of uncertain functionality. A live multi-leg executor is a scoped follow-up (verify the swap router + liquidity, CCTP attestation relay, and USYC entitlements first); the legs stay modeled in the data layer + shown in the mock walkthrough.

## 2026-08-03 — Demo dashboard (mock + live) — apps/web

- ✅ **Next.js dashboard** rendering the vault two ways from one component tree: **mock** (the six `@ephor/shared` scenarios, deterministic walkthrough) and **live** (server-side reads of the deployed Arc contracts via a single Multicall3 `eth_call`, polling every 3s). Heartbeat countdown, the staircase, payroll-never-misses, successor caps, treasury, activity feed. — `apps/web/`
- ✅ **Interactive live controls** — owner-signed heartbeat / advance / payroll from the browser via `/api/action` (key read server-side from the root `.env`, never sent to the client). Verified end-to-end: browser click → Arc tx → live state flips (heartbeat → healthy). — `apps/web/app/api/`
- ✅ Typechecks clean; renders with no console errors. UI handoff gate lifted by Ben (fresh design, no external mockup). — `apps/web/README.md`

## 2026-08-03 — Live succession proven end-to-end on Arc

- ✅ **Full staircase driven live on the deployed vault** (rewind path), proving the invariants on-chain: INV-3 early `advanceStage` reverts (WindowNotLapsed) → INV-2 Active→Notice→Handover as each block window lapses → INV-6 `runPayroll` pays 1 USDC mid-succession (reserve 6→5) → INV-5 successor pays vendor 1.5 USDC (per-tx cap 2) and an over-cap 2.5 USDC spend reverts (PerTxCapExceeded) → INV-1 owner `heartbeat` rewinds Handover→Active in one call. Non-destructive; vault left healthy (reserve 5, distributable 2.5). One-command reusable driver for the recorded demo. — `scripts/run-demo-arc.sh`

## 2026-08-02 — Deployed to Arc testnet (3 contracts live + wired)

- ✅ **SuccessionPlan `0x01FcB61253f8E0dE8f0455dDe6CBd36882ad3bf8`, ContinuityVault `0x9215fD038685e23c08f83b52137f95662DC33021`, Guardian2of3 `0x52e003799cCB3B0BFc8Bcd227112F1Ffe9bc506d`** deployed from `0x7dbF…Ac2C` (chain 5042002) and verified on-chain — bytecode present; `owner` + `plan`↔`vault` + `guardian` wiring + `stage=Active` confirmed via `cast call`. Deploy cost ≈0.2 USDC. — `contracts/deployments/arc-testnet.json`
- ✅ Fixed the deploy blocker: an empty `[etherscan].url` caused forge's "relative URL without a base" on `--broadcast`; disabled that block (Arc verifier endpoint still TBD). — `contracts/foundry.toml`
- ✅ **Seeded the live vault** (demo company "Helios Robotics", testnet-scaled ~10 USDC): payroll (1 payee, 1 USDC/period), 2 capped successors (30% / 20%, per-tx + daily caps), 2 allocations (30% / 20%), config **locked** (splits = 100%), reserve 6 USDC + distributable 4 USDC funded. Verified on-chain. Sent via `cast send` — `forge script` can't simulate Arc's native USDC precompile (see DX_FEEDBACK). — `contracts/script/SeedDemo.s.sol`, `scripts/seed-arc.sh`
- 📋 Next: run the live staircase end-to-end (heartbeat → advance → payroll-never-misses → sweep / owner-rewind); wire keeper `DATA_MODE=live`; source-verify once Arc exposes a verifier.

## 2026-08-02 — Deploy prep: Circle DCW → EOAs; USDC address confirmed

- ✅ **Demo actors switched to plain EOAs (Option A).** Circle developer-controlled wallets dropped — the Entity Secret registration is one-shot and became unrecoverable after a failed recovery-file write (see DX_FEEDBACK.md). Contracts only ever see addresses, so this is functionally equivalent. New generator: `pnpm wallets:gen`. — `scripts/wallets/gen-actors.ts`, `scripts/package.json`, `.env.example`
- ✅ **USDC address confirmed real** — `0x3600000000000000000000000000000000000000` (native gas token + 6-dec ERC-20 view), verified against the Arc docs. Deploy is no longer blocked on the token address; only a faucet-funded deployer remains. Also pinned USYC Entitlements `0xcc20…6113`. — `.env.example`, `packages/shared/src/addresses.ts`
- ✅ Removed the Circle entity-secret helper + dependency; repurposed `@ephor/scripts` for EOA wallet generation. — `scripts/`

## 2026-07-26 — Bootstrap + Phase 0 (Foundation & Provider Contract)

**Environment & safety**
- ✅ Git initialized (`main`); author locked to the human maintainer; **AI co-authorship disabled at the source** (`includeCoAuthoredBy:false`) + `commit-msg` hook (strips trailers) + `pre-push` gate (blocks any Claude/Anthropic-credited commit). Empirically verified: a test commit with a planted trailer was stripped. — `.githooks/`, `.claude/settings.json`, `.gitattributes`
- ✅ GSD `model_profile = inherit` set + verified — `gsd-sdk init plan-phase 1` shows `researcher_model` / `planner_model` / `checker_model` all `inherit`. GSD subagents run on the session model, not a pinned tier. — `.planning/config.json`

**GSD planning spine**
- ✅ PROJECT.md, ROADMAP.md (4 phases mapped to brief phases 0–3), STATE.md, REQUIREMENTS.md (REQ-01..08 + the six named invariants). — `.planning/`
- ✅ Brief saved at repo root. — `PROMPT_BUILD.md`

**Monorepo scaffold**
- ✅ pnpm workspace + TypeScript base config; Foundry project (`solc 0.8.24`, shanghai EVM, fuzz/invariant profiles); OpenZeppelin v5.6.1 + forge-std installed as git submodules; toolchain smoke-tested (`forge test` green on a throwaway contract, since removed). — `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `contracts/foundry.toml`, `.gitmodules`
- ✅ `.env.example` complete (Arc + demo-actor EOA keys + CCTP + keeper vars); **no secrets in repo**. — `.env.example`

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

**Phase 3 kickoff — end-to-end proof (contract level)**
- ✅ End-to-end integration test (`contracts/test/integration/FullStaircase.t.sol`): the full unattended arc — payroll paid in **all four stages**, capped handover with an **on-chain over-cap revert**, and a **conservation-exact terminal sweep** — plus **owner-returns mid-handover** (capped role revoked instantly, payroll uninterrupted) and a sweep-edge rewind. This is the scripted, CI-able version of the two demo money-shots. → **81 tests green, 98.8% line coverage.**

### Open blockers / next
- ✅ **Deployed to Arc testnet** — SuccessionPlan `0x01Fc…3bf8`, ContinuityVault `0x9215…3021`, Guardian2of3 `0x52e0…506d`; live + wired (addresses in README/CP2). Source-verification pending Arc's verifier endpoint (bytecode confirmed on-chain).
- 📋 **Phase 2–3 (next):** stage-3 multi-leg executor (App Kit Swap + CCTP v2 + USYC park), `LiveEphorProvider` live reads, Slither, scenario drivers 5× clean.
- 📋 **UI HANDOFF GATE** not yet reached — no `apps/web` touch until Ben confirms the design handoff.
