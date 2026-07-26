# EPHOR — Build Brief 1 of 2 · CLAUDE CODE (Contracts + Backend)
### Business continuity as programmable settlement · Arc "Programmable Money" Hackathon · DeFi track
**Target tool:** Claude Code · **Setup:** create the project repo, save this file as `PROMPT_BUILD.md` at the root, set env vars per §6, then tell Claude Code: *"Read PROMPT_BUILD.md and execute it."*
**Companion brief:** `PROMPT_DESIGN.md` (a separate Claude session builds the entire interface). This session builds **contracts, services, and the data-provider layer — NOT the UI** — and MUST halt at the **UI HANDOFF GATE** (Phase 2) to ask Ben for the design session's handoff before touching `apps/web`.
**Merge-ready chassis note:** Ephor shares its skeleton (policy vault + keeper + staged settlement + provider interface) with the companion project ZYGOS. Keep module boundaries clean — a later merge mounts this continuity module on Zygos's vault in a day.

---

## Operating Identity (assume fully, before anything else)

You are a **principal engineer who has shipped audited custody and dead-man-switch systems**: you know that continuity mechanisms are attack surfaces wearing a safety costume — a poorly built inactivity trigger is a hostile-takeover kit — so you design every trigger with the paranoia of someone who has read the post-mortems: forced-silence attacks (jam the owner's ability to check in, inherit the vault), grief-cancellation loops, timestamp games, and stage-skipping. Your prime directive: **the owner's live key always wins**; succession is a staircase with challenge windows, never a trapdoor. You also know the honest framing: this is *operational continuity*, not estate law — the product keeps a business paying its people, it does not probate a will.

**Veteran operating principles — apply wherever this brief is silent:** 1. Boring correctness beats clever novelty. 2. Invariants are the spec — stage monotonicity and owner-supremacy are written before the code. 3. Triggers are measured in block counts, never wall-clock trust. 4. If it isn't evented, it didn't happen. 5. Money moves by pull, never by loop. 6. Scope discipline is a security control — proposals to `BLOCKERS.md`. 7. The provider contract and the UI Handoff Gate are law. 8. Challenge a flawed spec via `BLOCKERS.md`, never silently.

Think carefully and step-by-step before starting each phase.

## Objective

Build the onchain and backend core of **Ephor**, deployed and verified on Arc testnet: a continuity vault for solo-founder and small-team businesses whose treasury lives onchain. The operator heartbeats periodically; if the heartbeat stops, a **staged, cancellable, multi-step settlement** executes — notify → challenge window → capped operational handover to a designated successor → policy-driven treasury actions (payroll reserve funded, allocations split, optional currency conversion, optional cross-chain leg) — every step evented and reversible until its window closes. Submission-complete by **Sun Aug 9 AoE (submit Aug 8)**. Demo money-shot: **the operator goes silent, and the company keeps paying people** — payroll never misses a beat while the succession staircase executes on screen.

**The name (canonical, use everywhere):** Ephor — Sparta's five elected overseers: real but *bounded* power, term-limited by design, strong enough to check even the kings, charged above all with keeping the state running. Bounded authority + continuity + owner-supremacy is this product in one ancient office. Brand line, verbatim: *"The state never stops."* In product copy the designated people remain **"successors"** — Ephor is the protocol that governs them, not their title.
**Source pedigree (why this shape):** Noah — ETHGlobal New York 2025 top-10 finalist + prize (inactivity-triggered liquidation→stablecoin→beneficiary) and Testament — ETHDam 2025 winner (trigger-based inheritance distribution). Two independent 2025 juries rewarded trigger-conditioned settlement; nobody has built it for *businesses*, and no bank can offer it at all — **banks freeze accounts when the account-holder disappears; Ephor does the exact opposite.** That is the track's "why stablecoin-native changes what's possible" line, verbatim. Track bullets: conditional payments ✓ (the purest version in the field), onchain automation ✓, multi-step settlement ✓, App Kits ✓ (Swap/Send legs, Unified Balance).

## Hackathon Context (dates current as of Jul 20 — binding)

**CP1: registered by Ben on the platform Jul 20 (done — no submission doc needed).** **CP2 Sun Jul 26:** repo + progress + addresses. **Final Sun Aug 9 AoE; submit Aug 8.** Judges: Circle DevRel; async video judging; live deployment + one primitive deep + a unit-economics line on camera ("SaaS per vault + 5bps on protected balances").

## Division of Labor & Interface Contract

- **This session owns:** `contracts/`, `apps/keeper`, `packages/shared`, `scripts/`, `docs/`. **Never touch `apps/web` or `packages/ui`.**
- **Phase 0 obligation:** author `packages/shared/src/provider.ts` — `EphorProvider { getVault(); getPlan(); createPlan(); heartbeat(); getHeartbeatStatus(); cancelStage(); getStages(); getSuccessors(); getPayrollStream(); getReceipts(); getBalances(); }` + types + `scenarios.ts` (`healthy`, `silence-begins`, `stage1-notice`, `stage2-handover`, `stage3-sweep`, `owner-returns`). Design session builds on `MockEphorProvider`; this session ships `LiveEphorProvider` behind `NEXT_PUBLIC_DATA_MODE=mock|live`.
- **UI HANDOFF GATE (binding):** no UI, ever, not even debug pages. Only permitted `apps/web` touch = live-provider registration on Integration Day, AFTER asking Ben verbatim: *"Is the Claude Design handoff ready? Confirm (1) docs/INTEGRATION.md exists, (2) mock scenarios + dev panel work, (3) which file(s) are designated for live-provider registration."* Not ready → continue headless, re-ask next session.

## Product Spec (backend scope)

**Actors:** Operator (the founder; holds the live key) · Successors (1–3 designated wallets with per-stage caps) · Beneficiary policies (payroll reserve, allocations) · Keeper (advances stages when windows lapse; anyone can call — keeper is a convenience, not a trust point).

**The succession staircase (implement exactly):**
1. **Heartbeat:** operator calls `heartbeat()` (or any owner-key transaction counts) within `windowBlocks` (default ≈ 14 days of blocks; demo profile: minutes). Missed window → Stage 1 becomes callable.
2. **Stage 1 — Notice (challenge window A):** emits `ContinuityNotice`; nothing moves. Owner heartbeat at ANY stage cancels everything instantly and resets — **owner-supremacy is absolute until final sweep executes.**
3. **Stage 2 — Capped handover (challenge window B):** successor #1 gains an *operational role* with hard caps (per-tx, daily, allowlisted payees) — enough to keep payroll and vendors running, nothing more. Existing **payroll streams continue uninterrupted** (the vault's scheduled payroll executor keeps paying from reserve — this is the demo's heart).
4. **Stage 3 — Policy sweep (final):** the continuity policy executes as one multi-step settlement: fund payroll reserve for N periods → split remaining balance by percentages across successors/beneficiaries → optional **App Kit Swap** conversion legs (e.g., X% to EURC) → optional **CCTP v2** leg to a successor's preferred chain → residual parks in **USYC** (or labeled mock per the entitlement probe). Every leg evented with a `ContinuityReceipt`.
5. **Duress & recovery levers:** owner can pre-register a `guardianVeto` (Guardian2of3) able to freeze the staircase (kidnap/duress case); a lost-key path exists as documented production hardening (social recovery), NOT built.

**OUT:** estate-law claims (wills, probate — the word "inheritance" never leads; "continuity" does), oracles of death, multi-vault orgs, mobile, mainnet, UI, social recovery build.

## Architecture

```
contracts/ (Foundry, Solidity 0.8.24+)
  ├─ ContinuityVault.sol   // funds; roles (owner, successor w/ caps); payroll reserve +
  │                        // scheduled payroll pulls; pausable via guardian veto
  ├─ SuccessionPlan.sol    // plan config {windowBlocks, stages, caps, splits, legs};
  │                        // heartbeat registry; stage state machine (monotonic, cancellable);
  │                        // stage3 multi-step executor w/ receipts
  └─ Guardian2of3.sol      // veto multisig + key-rotation authority
apps/keeper (TS: watches windows, calls advance/execute — idempotent; payroll tick driver;
             notification mock (email/webhook stub, honestly labeled); indexer → SQLite)
packages/shared (types, ABIs, provider interface, scenarios, viem clients)
scripts/ (deploy, seed demo company, fund wallets, scenario drivers, verify-receipts)
```

Design note: stage advancement is **permissionless once a window lapses** (anyone can call — liveness without trusting our keeper), but *cancellation requires only the owner key* — the asymmetry is the security model. All windows in **block counts** (Arc timestamps repeat; ~0.5s blocks make windows precise).

## Security Bar (institution-grade — the veteran's floor)

**Contracts:** CEI; `nonReentrant` on every value-moving function; SafeERC20; pull-over-push (successors/beneficiaries claim; payroll recipients pull or keeper-push with bounded batch ≤ 10 + pull fallback); custom errors; events on every transition; no proxies; 6-dec accounting; caps enforced in the vault, not the UI.
**Named invariants (write first):** (1) **owner-supremacy** — a live owner heartbeat cancels any stage < 3-executed, always, in every fuzzed ordering; (2) **stage monotonicity** — stages advance 0→1→2→3, never skip, never regress except by cancel-to-0; (3) **no early execution** — no stage action before its window lapses, measured in blocks; (4) **split conservation** — Σ stage-3 allocations == 100% of swept balance, exactly, after fees; (5) **cap safety** — successor spend ≤ per-tx AND rolling-daily caps under fuzz; (6) **payroll continuity** — reserve-funded payroll pulls succeed regardless of stage state.
**Threat model must cover (with mitigations):** forced-silence/hostage attack (mitigation: guardian veto + long windows + any-owner-tx-counts-as-heartbeat), griefing by repeated stage-1 triggers (rate-limit notices), keeper censorship (permissionless advancement), successor collusion pre-stage-3 (caps + allowlists), replayed heartbeats (nonce/chain-id domain).
**Testing:** Foundry unit + fuzz (window boundaries, cancel-vs-advance races, cap math) + invariant suites for all six; ≥ 90% coverage; gas snapshots; Slither clean-or-triaged. Artifacts: `docs/THREAT_MODEL.md`, `docs/SECURITY.md`, `docs/METRICS.md`.

## Stack (locked)

pnpm monorepo · TypeScript · Foundry (Solidity 0.8.24+) · viem · `@circle-fin/developer-controlled-wallets` (demo actors) · Arc App Kit + viem adapter (Swap leg) · node-cron · better-sqlite3 · OpenZeppelin. CCTP leg: direct TokenMessengerV2 calls. Nothing else without `BLOCKERS.md`.

## Arc Facts (verified Jul 14–17, 2026 — re-verify each before its integration; Arc docs MCP: `https://docs.arc.io/mcp`)

Chain **5042002** · RPC `https://rpc.testnet.arc.network` · explorer `https://testnet.arcscan.app` · faucet `https://faucet.circle.com` (20/asset/2h/address) · USDC gas, **18-dec native / 6-dec ERC-20 at `0x36…00`**; EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` · USYC `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C`, Teller `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` (**day-1 probe — Entitlements `0xcc2052…6113` may gate minting; fallback: labeled MockYieldVault**) · TokenMessengerV2 `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` (Arc = domain 26; one Arc→Base Sepolia leg) · Memo `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` · min gas 20 gwei · NEVER test on anvil · burns revert · **block numbers over timestamps, everywhere**.

## Build Plan (dates binding)

**Phase 0 — Jul 20–21 (COMPRESSED — start immediately):** CP1 is already registered; skip the submission doc · verify Console key/Entity Secret · scaffold · hello-world deploy + verify · **USYC Teller probe** · App Kit Swap smoke test from Node · author provider interface + scenarios (unblocks design session). This is the lowest-spike-risk brief in the portfolio — its Phase 0 is deliberately light, so the two-day compression is safe.
**Phase 1 — Jul 21–26 (CP2 Jul 26):** ContinuityVault + SuccessionPlan + Guardian2of3 + full test suite (all six invariants) → deploy + verify · keeper v1 · full staircase happy path on testnet (compressed windows) incl. owner-returns cancellation · `docs/CP2_SUBMISSION.md`.
**Phase 2 — Jul 27–Aug 2:** payroll reserve + scheduled pulls running through all stages · stage-3 multi-leg executor (splits + Swap leg + CCTP leg + USYC park) · notification stub · `LiveEphorProvider` passing scenarios **headlessly** · Slither + threat model · **⛔ UI HANDOFF GATE — Integration Day:** ask Ben the gate question before touching `apps/web`; on go-ahead, designated registration file(s) only; run all six scenarios live; record in `PROGRESS.md`.
**Phase 3 — Aug 3–8:** scenario drivers hardened (5× clean, esp. `owner-returns` mid-stage-2) · `docs/METRICS.md` · README (addresses, Mermaid staircase diagram, quickstart, "continuity not probate" positioning, threat-model summary, **DX feedback section**) · support video · **submit Aug 8**.

## Acceptance Criteria (binary)

- [ ] 3 contracts deployed + verified on Arc testnet; addresses + explorer links in README.
- [ ] `forge test` green: ≥ 35 tests incl. fuzz + the 6 named invariants; ≥ 90% coverage; gas snapshots; Slither triaged.
- [ ] Full staircase runs unattended on compressed windows: silence → notice → handover (capped successor pays a vendor within caps; over-cap attempt reverts onchain) → stage-3 multi-leg sweep with receipts, keeper-only.
- [ ] **Owner-returns beat proven:** a heartbeat during stage 2 cancels everything and restores sole control, shown live and in tests across fuzzed orderings.
- [ ] **Payroll never misses:** scheduled payroll executes on time in `healthy`, during silence, during every stage, and after handover — demonstrated across one full demo run.
- [ ] CCTP leg visible on both explorers; Swap leg receipted; USYC park (or labeled fallback per probe) executed in stage 3.
- [ ] Provider stable since Phase 0; Integration Day only after Ben's recorded go-ahead; zero stray diffs in `apps/web`.
- [ ] `docs/THREAT_MODEL.md` (incl. forced-silence + griefing analyses), `SECURITY.md`, `METRICS.md`, `DX_FEEDBACK.md` complete; `.env.example` complete; no secrets in git history.

## Scope · Constraints · Stop Conditions

- Work only in this repo; never in `apps/web`/`packages/ui` (gate above). Build exactly this scope; the word "inheritance" never leads — "continuity" does. Testnet only; NEVER mainnet keys or real value.
- Stop and ask Ben before: any new dependency; any git push/publish; USYC fallback execution (no approval needed but record it); changing the provider interface post-Phase 0; **anything frontend/UI (HARD STOP — request the design handoff first)**; any deviation from the dated plan.

## Progress & Session Strategy

After each step: ✅ [what] — [files]; maintain date-stamped `PROGRESS.md`. New session per phase; /compact at ~50% on: addresses, plan-config state, provider state, blockers.

---

> ⚠️ This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before pasting. Circle Console credentials exist (Agora account) — environment variables only; never embed credentials in code or prompts.
