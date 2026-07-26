# Ephor

## What This Is

Ephor is a continuity vault for solo-founder and small-team businesses whose treasury lives onchain, deployed on Arc testnet. The operator (founder) heartbeats periodically; if the heartbeat stops, a **staged, cancellable, multi-step settlement** executes — notice → challenge window → capped operational handover to a designated successor → policy-driven treasury actions — every step evented and reversible until its window closes. Banks freeze accounts when the account-holder disappears; Ephor does the opposite: **the company keeps paying its people.** Brand line, verbatim: *"The state never stops."*

This session builds the **onchain + backend core** only — `contracts/`, `apps/keeper`, `packages/shared`, `scripts/`, `docs/`. It NEVER touches `apps/web` or `packages/ui` (a separate Claude Design session owns the interface) and halts at the **UI HANDOFF GATE** before any integration.

## Core Value

The owner's live key always wins: a single heartbeat at any stage before the final sweep cancels the entire succession staircase and restores sole control — succession is a staircase with challenge windows, never a trapdoor. Second only to that: **payroll never misses a beat**, at any stage.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

- [ ] REQ-01: Three contracts (ContinuityVault, SuccessionPlan, Guardian2of3) deployed + verified on Arc testnet; addresses + explorer links in README
- [ ] REQ-02: `forge test` green — ≥ 35 tests incl. fuzz + the 6 named invariants; ≥ 90% coverage; gas snapshots; Slither clean-or-triaged
- [ ] REQ-03: Full staircase runs unattended on compressed windows — silence → notice → capped handover (over-cap attempt reverts onchain) → stage-3 multi-leg sweep with receipts, keeper-only
- [ ] REQ-04: Owner-returns beat — a heartbeat during stage 2 cancels everything and restores sole control, proven live and across fuzzed orderings
- [ ] REQ-05: Payroll never misses — scheduled payroll executes on time in `healthy`, during silence, during every stage, and after handover
- [ ] REQ-06: CCTP v2 leg visible on both explorers; App Kit Swap leg receipted; USYC park (or labeled MockYieldVault fallback per entitlement probe) executed in stage 3
- [ ] REQ-07: `EphorProvider` interface + scenarios stable since Phase 0 (unblocks the design session); `LiveEphorProvider` passes scenarios headlessly; Integration Day only after Ben's recorded go-ahead; zero stray diffs in `apps/web`
- [ ] REQ-08: docs/THREAT_MODEL.md (forced-silence + griefing), SECURITY.md, METRICS.md, DX_FEEDBACK.md complete; `.env.example` complete; no secrets in git history

**Named invariants (the security spec — written before the code):**
- INV-1 **owner-supremacy** — a live owner heartbeat cancels any stage < 3-executed, always, in every fuzzed ordering
- INV-2 **stage monotonicity** — stages advance 0→1→2→3, never skip, never regress except by cancel-to-0
- INV-3 **no early execution** — no stage action before its window lapses, measured in blocks
- INV-4 **split conservation** — Σ stage-3 allocations == 100% of swept balance, exactly, after fees
- INV-5 **cap safety** — successor spend ≤ per-tx AND rolling-daily caps under fuzz
- INV-6 **payroll continuity** — reserve-funded payroll pulls succeed regardless of stage state

### Out of Scope

- Estate-law claims (wills, probate) — this is *operational continuity*, not probate; the word "inheritance" never leads, "continuity" does
- Oracles of death — triggers are inactivity + block counts, never death attestation
- Multi-vault orgs, mobile, mainnet — scope discipline; testnet only
- Social recovery / lost-key path — documented as production hardening, NOT built
- Any `apps/web` / `packages/ui` work — hard boundary; a separate Claude Design session owns it (UI HANDOFF GATE)

## Context

- Arc "Programmable Money" hackathon, DeFi track. CP1 registered Jul 20. **CP2 Sun Jul 26** wants repo + progress + addresses. Final Sun Aug 9 AoE (submit Aug 8). Judges: Circle DevRel; async video judging.
- **Merge-ready chassis**: Ephor shares its skeleton (policy vault + keeper + staged settlement + provider interface) with a companion project (ZYGOS). Keep module boundaries clean — a later merge mounts this continuity module on Zygos's vault.
- Source pedigree: trigger-conditioned settlement won ETHGlobal NY 2025 (Noah) + ETHDam 2025 (Testament); nobody has built it for businesses, and no bank can (banks freeze; Ephor continues).
- **Arc facts** (verified Jul 14–17 2026; re-verify before each integration; Arc docs MCP `https://docs.arc.io/mcp`): chain **5042002**, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`, faucet `https://faucet.circle.com` (20/asset/2h/addr). USDC-as-gas, **18-dec native / 6-dec ERC-20 at `0x36…00`**. EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`. USYC `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`, Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` (**day-1 probe** — Entitlements `0xcc2052…6113` may gate minting; fallback: labeled MockYieldVault). TokenMessengerV2 `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` (Arc = domain **26**; one Arc→Base Sepolia leg). Memo `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`. Min gas 20 gwei. **Block numbers over timestamps, everywhere.** NEVER test on anvil; burns revert.

## Constraints

- **Tech stack**: pnpm monorepo · TypeScript · Foundry (Solidity 0.8.24+) · viem · `@circle-fin/developer-controlled-wallets` · Arc App Kit + viem adapter (Swap) · node-cron · better-sqlite3 · OpenZeppelin. CCTP via direct TokenMessengerV2 calls. Nothing else without a `BLOCKERS.md` entry.
- **Security** (institution-grade): CEI; `nonReentrant` on every value-moving function; SafeERC20; pull-over-push (bounded batch ≤ 10 + pull fallback); custom errors; events on every transition; no proxies; 6-dec accounting; caps enforced in the vault, not the UI.
- **Testnet only**: NEVER mainnet keys or real value. Credentials via env vars only — never in code or git history. NEVER test Arc-specific behavior on anvil.
- **Timeline**: CP2 Jul 26 (repo + progress + addresses); submit Aug 8.
- **Boundary**: never touch `apps/web` or `packages/ui`; the UI HANDOFF GATE is law.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Windows measured in block counts, not timestamps | Arc timestamps repeat; ~0.5s blocks make windows precise & provable | — Pending |
| Stage advancement permissionless; cancellation owner-only | Liveness without trusting our keeper; the asymmetry IS the security model | — Pending |
| GSD model_profile = `inherit` | Run GSD subagents on the current session model, not a pinned tier (Ben's directive) | ✓ Good |
| Claude never credited as a git contributor | Ben's strict requirement; enforced via `includeCoAuthoredBy:false` + commit-msg/pre-push hooks | ✓ Good |
| Provider interface authored in Phase 0, then frozen | Unblocks the parallel design session; changing it post-Phase 0 requires stop-and-ask | — Pending |

---
*Last updated: 2026-07-26 after project bootstrap*
