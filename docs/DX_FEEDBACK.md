# Ephor — Developer Experience Feedback (Arc + Circle)

Candid notes for Circle DevRel, captured while building. Marked **[actual]** (experienced in this build) vs **[anticipated]** (expected at integration; will be confirmed after deployment — see BLOCKERS.md).

## What worked well
- **[actual] USDC-as-gas is a genuinely clarifying mental model.** For a continuity product it is a feature, not a convenience: a successor keeps the company running without ever holding a separate gas token. It made the "capped successor keeps paying payroll" story trivial to reason about.
- **[actual] Block-count windows over timestamps.** Being told up front that Arc timestamps repeat and to use block height pushed us to a *better* design — provable, reorg-resistant succession windows. This should be louder in the docs; it changes how you architect any time-based mechanism.
- **[actual] Standard EVM + Foundry.** `solc 0.8.24` + OpenZeppelin v5 + forge compiled and tested with zero Arc-specific shims. The whole invariant suite runs locally against a mock ERC-20.

## Friction / requests
- **[actual] EVM version isn't obvious.** We defaulted to `evm_version = "shanghai"` to be safe (PUSH0, no Cancun-only opcodes). A single authoritative line in the docs — "Arc supports EVM version X as of date Y" — would remove a deploy-time unknown. If Cancun (transient storage, MCOPY) is supported, say so; it affects optimizer output.
- **[anticipated] USYC entitlements gating.** The brief flags that `Entitlements` may gate USYC minting via the Teller. A copy-pasteable "here's how to check whether your address is entitled, and what to do if not" snippet would save a day-1 probe. We built a labeled `MockYieldVault` fallback in anticipation.
- **[anticipated] CCTP v2 domain table.** We hard-coded Arc = domain 26 and Base Sepolia = 6 from the brief. A canonical, versioned domain table in the docs (with testnet TokenMessengerV2 addresses per chain) would remove copy errors.
- **[anticipated] App Kit Swap from a headless/Node context.** The Swap leg is described for the browser App Kit; a Node/viem recipe for the same swap (for keepers and scripts) would help backend integrations.
- **[actual] Faucet limits (20/asset/2h/address)** are fine for one demo but tight for seeding a multi-actor demo (operator + 2 successors + vendor + team). A one-shot "fund this set of addresses" faucet mode would speed demo setup.

## Suggestions
- Publish a minimal **Foundry `foundry.toml` for Arc** (rpc endpoint, verifier config, recommended `evm_version`) as a starter — we reverse-engineered ours.
- Document the **verifier endpoint** for `forge verify-contract` explicitly (Etherscan-compatible? custom?). This is currently the biggest unknown for our "deployed **and verified**" acceptance criterion.

*(This file will be updated with deploy-time and integration-time findings once credentials are available.)*
