# @ephor/web — Ephor demo dashboard

A Next.js dashboard for the Ephor continuity vault. One component tree, two data modes
(a `DATA_MODE` flip — zero component changes):

- **Mock** — renders the six frozen `@ephor/shared` scenarios (`healthy → silence → notice
  → handover → sweep → rewind`). Deterministic and offline — the narrated walkthrough.
- **Live** — reads the deployed Arc contracts through a single **Multicall3** `eth_call`
  (`/api/snapshot`, polled every 3s), and drives **owner-signed** heartbeat / advance /
  payroll from the browser (`/api/action`, signed server-side).

## Run

```bash
pnpm --filter @ephor/web dev     # http://localhost:3000  (mock by default)
```

Toggle **Live · Arc** in the header to read the live deployment (addresses in `lib/config.ts`,
Arc testnet chain 5042002). To boot straight into live mode: `NEXT_PUBLIC_DATA_MODE=live`.

## Live actions & secrets

The heartbeat / advance / payroll buttons in live mode call `/api/action`, which signs with
`DEPLOYER_PRIVATE_KEY` read **server-side** from the repo-root `.env` (loaded by
`next.config.mjs`). The key never reaches the client — only `NEXT_PUBLIC_*` values are ever
sent to the browser. Testnet only.

## Files

- `components/` — `Dashboard` (orchestrator), `Staircase`, `Cards` (heartbeat hero, payroll,
  successors, treasury, activity).
- `lib/live.ts` — server-side snapshot builder (viem + Multicall3).
- `lib/serial.ts` — bigint-safe JSON transport across the API boundary.
- `app/api/snapshot` · `app/api/action` — live read / owner-signed write routes.
