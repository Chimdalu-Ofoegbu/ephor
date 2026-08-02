# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-26)

**Core value:** The owner's live key always wins — one heartbeat cancels the whole staircase; and payroll never misses a beat.
**Current focus:** Phase 1 — Foundation & Provider Contract

## Current Position

Phase: 2 of 4 (Continuity Core & Invariant Suite) — code complete, deploy needs a funded key
Plan: 4 of 5 in current phase (deploy + verify pending a faucet-funded deployer)
Status: In progress
Last activity: 2026-08-02 — demo actors switched to plain EOAs (Circle DCW dropped, Option A); USDC address confirmed `0x3600…0000` so deploy is unblocked except for funding `DEPLOYER_PRIVATE_KEY`; `pnpm wallets:gen` added

Progress: [██████░░░░] ~55%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Bootstrap: GSD `model_profile = inherit` (subagents run on the session model, per Ben)
- Bootstrap: Claude never credited as git contributor (settings + commit-msg/pre-push hooks; verified)
- Bootstrap: windows in block counts, not timestamps (Arc timestamps repeat)

### Pending Todos

None yet.

### Blockers/Concerns

- **Deploy needs a funded deployer key** — the USDC address is confirmed (`0x3600…0000`) and demo actors are plain EOAs (Circle developer-controlled wallets dropped — see BLOCKERS.md). Phase 2 deploy + verify (REQ-01) unblocks the moment Ben funds `DEPLOYER_PRIVATE_KEY` from the faucet. Everything else (contracts, tests, provider, keeper, docs) proceeds without it.
- **UI HANDOFF GATE** — no `apps/web` touch until Ben confirms the design handoff (Phase 3).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-26
Stopped at: Project spine authored; ready to scaffold the monorepo (Phase 1)
Resume file: None
