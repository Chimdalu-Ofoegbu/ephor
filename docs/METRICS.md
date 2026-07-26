# Ephor — Metrics

## Unit economics (the on-camera line)
**"SaaS per vault + 5 bps on protected balances."**

- **SaaS per vault** — a flat monthly fee per continuity vault under management (the operator pays for always-on continuity infrastructure: keeper, monitoring, notifications).
- **5 bps on protected balances** — 0.05% annually on the treasury Ephor protects. `ContinuityVault.totalProtected` (sum of vault balances) is the metered base; at $1M protected that is $500/yr, trivial against the downside it insures (a company dying in a week because keys went silent).

Why this is defensible: **no bank can offer this** — banks *freeze* accounts when the holder disappears. Ephor is the only continuity product that keeps a business paying its people, so the protected-balance fee prices a capability with no substitute.

## Contract size (well under the 24 KB limit)
| Contract | Runtime (bytes) |
|---|---|
| ContinuityVault | ~9,100 |
| SuccessionPlan | ~4,400 |
| Guardian2of3 | ~2,300 |

## Test & coverage
- 73 tests (unit + fuzz + 7 invariants), all green.
- Line coverage 98.7% / function coverage 97.2%.
- Gas snapshots committed at `contracts/.gas-snapshot` (regenerate with `pnpm contracts:snapshot`).

## Gas — representative operations
See `contracts/.gas-snapshot` for the full table. The staircase operations (heartbeat, advance, successorPay, runPayroll, sweep) are all single-digit-to-low-hundreds-of-thousands gas — cheap on Arc with USDC-as-gas.

## Demo timings (compressed windows)
Demo profile uses block-count windows of minutes (heartbeat ≈ 200 blocks ≈ 100 s at 0.5 s/block; challenge windows 100/100/50). Production profile uses ≈ 14 days of blocks for the heartbeat window.

*(Live testnet gas/latency numbers land here after deployment — see BLOCKERS.md for the credential dependency.)*
