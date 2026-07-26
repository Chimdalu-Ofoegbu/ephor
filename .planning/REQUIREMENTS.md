# Requirements: Ephor

Traceable requirements for the onchain + backend core. Each maps to phases in ROADMAP.md and is verified by success criteria. (Interface + experience requirements live with the separate Claude Design session.)

## Functional

- **REQ-01** — Three contracts (`ContinuityVault`, `SuccessionPlan`, `Guardian2of3`) deployed + verified on Arc testnet; addresses + explorer links in README. *(Phase 2)*
- **REQ-02** — `forge test` green: ≥ 35 tests incl. fuzz + the 6 named invariants; ≥ 90% coverage; gas snapshots; Slither clean-or-triaged. *(Phase 2, 4)*
- **REQ-03** — Full staircase runs unattended on compressed windows: silence → notice → capped handover (over-cap attempt reverts onchain) → stage-3 multi-leg sweep with receipts, keeper-only. *(Phase 3)*
- **REQ-04** — Owner-returns beat: a heartbeat during stage 2 cancels everything and restores sole control, proven live and across fuzzed orderings. *(Phase 2)*
- **REQ-05** — Payroll never misses: scheduled payroll executes on time in `healthy`, during silence, during every stage, and after handover. *(Phase 2, 3)*
- **REQ-06** — CCTP v2 leg visible on both explorers; App Kit Swap leg receipted; USYC park (or labeled MockYieldVault fallback per entitlement probe) executed in stage 3. *(Phase 3)*
- **REQ-07** — `EphorProvider` interface + six scenarios stable since Phase 0 (unblocks design); `LiveEphorProvider` passes scenarios headlessly; Integration Day only after Ben's recorded go-ahead; zero stray diffs in `apps/web`. *(Phase 1, 3)*
- **REQ-08** — `docs/THREAT_MODEL.md` (forced-silence + griefing), `SECURITY.md`, `METRICS.md`, `DX_FEEDBACK.md` complete; `.env.example` complete; no secrets in git history. *(Phase 3, 4)*

## Named Invariants (security spec — written before the code, verified under fuzz)

- **INV-1 owner-supremacy** — a live owner heartbeat cancels any stage < 3-executed, always, in every fuzzed ordering.
- **INV-2 stage monotonicity** — stages advance 0→1→2→3, never skip, never regress except by cancel-to-0.
- **INV-3 no early execution** — no stage action before its window lapses, measured in blocks.
- **INV-4 split conservation** — Σ stage-3 allocations == 100% of swept balance, exactly, after fees.
- **INV-5 cap safety** — successor spend ≤ per-tx AND rolling-daily caps under fuzz.
- **INV-6 payroll continuity** — reserve-funded payroll pulls succeed regardless of stage state.

## Non-Functional / Constraints

- Institution-grade contract security: CEI, `nonReentrant`, SafeERC20, pull-over-push, custom errors, events on every transition, no proxies, 6-dec accounting, caps in the vault.
- Windows measured in block counts (Arc timestamps repeat).
- Testnet only; credentials via env vars; never touch `apps/web`/`packages/ui`.

## Out of Scope

- Estate law (wills/probate), death oracles, multi-vault orgs, mobile, mainnet, social-recovery build, and all UI (separate session).
