# Roadmap: Ephor

## Overview

Ephor deploys the onchain + backend core of a business-continuity vault to Arc testnet. The journey: scaffold the monorepo and freeze the provider contract that unblocks the parallel design session (Phase 1 / brief Phase 0) → implement the three continuity contracts with the six named invariants and prove them under fuzz, deploy + verify, stand up keeper v1, and ship the CP2 submission (Phase 2 / brief Phase 1) → run payroll through every stage, build the stage-3 multi-leg settlement executor, ship the live provider headlessly, and pass the UI HANDOFF GATE (Phase 3 / brief Phase 2) → harden the scenario drivers, complete the docs and metrics, and submit (Phase 4 / brief Phase 3).

> **GSD phase N ↔ brief phase N-1.** The brief numbers phases 0–3; GSD uses integer phases 1–4. Each phase header notes its brief mapping and date band.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): planned milestone work
- Decimal phases (2.1): urgent insertions (marked INSERTED)

- [ ] **Phase 1: Foundation & Provider Contract** - Scaffold the monorepo, freeze `EphorProvider` + scenarios (unblocks design), Foundry builds, deploy/probe scripts ready
- [ ] **Phase 2: Continuity Core & Invariant Suite (CP2)** - Three contracts + the six named invariants under fuzz, deploy + verify on Arc, keeper v1, CP2 submission
- [ ] **Phase 3: Settlement, Live Provider & Security** - Payroll through every stage, stage-3 multi-leg executor (splits + Swap + CCTP + USYC), `LiveEphorProvider` headless, Slither + threat model, UI HANDOFF GATE
- [ ] **Phase 4: Harden & Submit** - Scenario drivers 5× clean, METRICS + README + threat-model summary + DX feedback, support video, submit

## Phase Details

### Phase 1: Foundation & Provider Contract
**Brief mapping**: Phase 0 (Jul 20–21, compressed)
**Goal**: A scaffolded pnpm + Foundry monorepo where `packages/shared` exports a frozen `EphorProvider` interface, typed models, and the six named scenarios — enough for the parallel design session to build on `MockEphorProvider` — plus a Foundry project that compiles and a documented Arc environment (RPC, addresses, USYC Teller probe plan).
**Depends on**: Nothing (first phase)
**Requirements**: REQ-07
**Success Criteria** (what must be TRUE):
  1. `packages/shared/src/provider.ts` exports `EphorProvider` with all required methods and `scenarios.ts` exports the six scenarios (`healthy`, `silence-begins`, `stage1-notice`, `stage2-handover`, `stage3-sweep`, `owner-returns`); both typecheck
  2. `pnpm install` and `pnpm -r typecheck` succeed; `forge build` compiles the contracts package
  3. `.env.example` documents every Arc/Circle variable; deploy + probe scripts exist (scaffolded) with no secrets in the repo
  4. `DATA_MODE=mock|live` seam is defined; `LiveEphorProvider` is stubbed behind it
**Plans**: TBD

Plans:
- [ ] 01-01: Monorepo scaffold (pnpm workspace, tsconfig, Foundry, OZ + forge-std, foundry.toml remappings)
- [ ] 01-02: `packages/shared` — provider interface, types, ABIs placeholder, viem clients, scenarios
- [ ] 01-03: Env + scripts skeleton (.env.example, deploy, seed, verify-receipts) + Arc/USYC probe doc

### Phase 2: Continuity Core & Invariant Suite (CP2)
**Brief mapping**: Phase 1 (Jul 21–26, CP2 Jul 26)
**Goal**: The three contracts implement the full succession staircase with owner-supremacy and payroll continuity, proven by a Foundry unit + fuzz + invariant suite covering all six named invariants, then deployed and verified on Arc testnet with a keeper v1 that advances windows and drives payroll. CP2 submission doc written.
**Depends on**: Phase 1
**Requirements**: REQ-01, REQ-02, REQ-04, REQ-05
**Success Criteria** (what must be TRUE):
  1. `ContinuityVault`, `SuccessionPlan`, `Guardian2of3` compile with CEI + `nonReentrant` + SafeERC20 + custom errors + events on every transition; caps enforced in the vault
  2. `forge test` green — ≥ 35 tests incl. fuzz + invariant suites for all six named invariants; ≥ 90% coverage; gas snapshots committed
  3. A live owner heartbeat during stage 2 cancels the staircase and restores sole control (proven in tests across fuzzed orderings)
  4. Reserve-funded payroll pulls succeed in `healthy`, during silence, and in every stage (proven in tests)
  5. Three contracts deployed + verified on Arc testnet; addresses + explorer links recorded; `docs/CP2_SUBMISSION.md` written
**Plans**: TBD

Plans:
- [ ] 02-01: `SuccessionPlan` — plan config, heartbeat registry, monotonic cancellable stage machine (blocks)
- [ ] 02-02: `ContinuityVault` — funds, roles + caps, payroll reserve + scheduled pulls, guardian-pausable
- [ ] 02-03: `Guardian2of3` — veto multisig + key-rotation authority
- [ ] 02-04: Foundry unit + fuzz + invariant suite (all six invariants) + gas snapshots
- [ ] 02-05: Deploy + verify to Arc; keeper v1 (advance/execute idempotent + payroll tick); CP2_SUBMISSION.md

### Phase 3: Settlement, Live Provider & Security
**Brief mapping**: Phase 2 (Jul 27–Aug 2)
**Goal**: Payroll runs through all stages and after handover; the stage-3 executor performs the multi-leg settlement (splits → optional Swap → optional CCTP → USYC park) with a `ContinuityReceipt` per leg; `LiveEphorProvider` passes all six scenarios headlessly; Slither + threat model complete; the UI HANDOFF GATE is passed only on Ben's recorded go-ahead.
**Depends on**: Phase 2
**Requirements**: REQ-03, REQ-06, REQ-07, REQ-08
**Success Criteria** (what must be TRUE):
  1. Stage-3 executor runs the full multi-leg settlement with per-leg receipts; split conservation holds exactly after fees
  2. CCTP leg is visible on both explorers; Swap leg receipted; USYC park (or labeled fallback per probe) executed
  3. `LiveEphorProvider` passes all six scenarios headlessly against deployed contracts
  4. `docs/THREAT_MODEL.md` (forced-silence + griefing) + `SECURITY.md` complete; Slither clean-or-triaged
  5. UI HANDOFF GATE: Ben's go-ahead recorded in `PROGRESS.md` before any `apps/web` touch; only designated registration file(s) changed
**Plans**: TBD

Plans:
- [ ] 03-01: Payroll scheduled pulls through all stages + after handover (keeper driver)
- [ ] 03-02: Stage-3 multi-leg executor (splits + Swap + CCTP + USYC park) with receipts
- [ ] 03-03: `LiveEphorProvider` + notification stub; all six scenarios pass headlessly
- [ ] 03-04: Slither + `THREAT_MODEL.md` + `SECURITY.md`; UI HANDOFF GATE (Integration Day)

### Phase 4: Harden & Submit
**Brief mapping**: Phase 3 (Aug 3–8)
**Goal**: Scenario drivers hardened to run 5× clean (especially `owner-returns` mid-stage-2), metrics and README complete with the continuity-not-probate positioning and a Mermaid staircase diagram, DX feedback captured, support video recorded, and the project submitted.
**Depends on**: Phase 3
**Requirements**: REQ-02, REQ-08
**Success Criteria** (what must be TRUE):
  1. Scenario drivers run 5× clean end-to-end, including `owner-returns` mid-stage-2
  2. `docs/METRICS.md` + `docs/DX_FEEDBACK.md` complete; README has addresses, Mermaid staircase, quickstart, threat-model summary
  3. Support video recorded; submission complete
**Plans**: TBD

Plans:
- [ ] 04-01: Scenario drivers hardened (5× clean) + `METRICS.md`
- [ ] 04-02: README (addresses, Mermaid staircase, quickstart, positioning, threat-model summary) + `DX_FEEDBACK.md`
- [ ] 04-03: Support video + final submission checklist

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Provider Contract | 3/3 | Complete | 2026-07-26 |
| 2. Continuity Core & Invariant Suite | 4/5 | In progress (deploy credential-blocked) | - |
| 3. Settlement, Live Provider & Security | 0/4 | Not started | - |
| 4. Harden & Submit | 0/3 | Not started | - |
