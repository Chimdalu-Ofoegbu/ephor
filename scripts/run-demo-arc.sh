#!/usr/bin/env bash
#
# Live succession demo driver for Ephor on Arc testnet — the "rewind" path.
# Proves the named invariants on-chain, end to end:
#   INV-3 no early exit   : advanceStage reverts before the window lapses
#   INV-2 monotonicity    : Active -> Notice -> Handover, one step at a time
#   INV-6 payroll cont.   : runPayroll pays during succession
#   INV-5 cap safety      : a capped successor spend succeeds; an over-cap spend reverts
#   INV-1 owner supremacy : a single heartbeat rewinds the whole staircase to Active
#
# Non-destructive: no terminal sweep; the owner ends back in control. Blocks are ~0.5s,
# so the full run takes ~3 minutes. Run in the background.
#
#   bash scripts/run-demo-arc.sh
#
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC="$ARC_RPC_URL"
PLAN=0x01FcB61253f8E0dE8f0455dDe6CBd36882ad3bf8
VAULT=0x9215fD038685e23c08f83b52137f95662DC33021
USDC=0x3600000000000000000000000000000000000000
OWNER_PK="$DEPLOYER_PRIVATE_KEY"
S1_PK="$SUCCESSOR1_PRIVATE_KEY"
OWNER=$(cast wallet address --private-key "$OWNER_PK")
VENDOR=$(cast wallet address --private-key "$VENDOR_PRIVATE_KEY")

st()  { cast call $PLAN 'stage()(uint8)' --rpc-url $RPC; }
bn()  { cast block-number --rpc-url $RPC; }
bal() { cast call $USDC 'balanceOf(address)(uint256)' "$1" --rpc-url $RPC; }
res() { cast call $VAULT 'payrollReserve()(uint256)' --rpc-url $RPC; }
nab() { cast call $PLAN 'nextAdvanceBlock()(uint256)' --rpc-url $RPC | awk '{print $1}'; }
send() { if cast send "$@" --rpc-url $RPC >/dev/null 2>&1; then echo "    tx: ok"; else echo "    tx: FAILED"; fi; }
wait_until() { local t="${1%% *}" b; while :; do b="$(bn)"; b="${b%% *}"; if [ "$b" -ge "$t" ]; then echo "    reached block $b (>= $t)"; break; fi; echo "    waiting: block $b / $t"; sleep 5; done; }

echo "=== EPHOR LIVE SUCCESSION DEMO (rewind path) ==="
echo "[0] stage=$(st) (0=Active)  block=$(bn)"

echo "[1] HEARTBEAT (founder: 'I'm here')"
send $PLAN 'heartbeat()' --private-key "$OWNER_PK"
echo "    stage=$(st)  deadlineBlock=$(cast call $PLAN 'deadlineBlock()(uint64)' --rpc-url $RPC)  nextAdvance=$(nab)"

echo "[2] INV-3 (no early exit): advanceStage now must REVERT"
if cast call $PLAN 'advanceStage()' --rpc-url $RPC >/dev/null 2>&1; then echo "    UNEXPECTED: did not revert"; else echo "    OK: reverted (WindowNotLapsed)"; fi

echo "[3] founder goes silent — waiting out the heartbeat window"
wait_until "$(nab)"
echo "    advanceStage -> Notice"; send $PLAN 'advanceStage()' --private-key "$OWNER_PK"
echo "    stage=$(st) (1=Notice)"

echo "[4] Notice challenge window — waiting"
wait_until "$(nab)"
echo "    advanceStage -> Handover"; send $PLAN 'advanceStage()' --private-key "$OWNER_PK"
echo "    stage=$(st) (2=Handover)"

echo "[5] INV-6 (payroll never misses): runPayroll during succession"
R0=$(res); P0=$(bal $OWNER)
send $VAULT 'runPayroll()' --private-key "$OWNER_PK"
echo "    payrollReserve: $R0 -> $(res)   payee USDC: $P0 -> $(bal $OWNER)"

echo "[6] INV-5 (cap safety): successor pays vendor 1.5 USDC (per-tx cap 2)"
V0=$(bal $VENDOR)
send $VAULT 'successorPay(address,uint256)' $VENDOR 1500000 --private-key "$S1_PK"
echo "    vendor USDC: $V0 -> $(bal $VENDOR)"
echo "    over-cap check: successor pays 2.5 USDC (> cap) must REVERT"
if cast call $VAULT 'successorPay(address,uint256)' $VENDOR 2500000 --from $(cast wallet address --private-key "$S1_PK") --rpc-url $RPC >/dev/null 2>&1; then echo "    UNEXPECTED: did not revert"; else echo "    OK: reverted (PerTxCapExceeded)"; fi

echo "[7] INV-1 (owner supremacy): founder returns -> HEARTBEAT rewinds everything"
send $PLAN 'heartbeat()' --private-key "$OWNER_PK"
echo "    stage=$(st) (0=Active) — the whole staircase rewound in one call"

echo "=== DEMO COMPLETE ==="
echo "final: stage=$(st)  reserve=$(res)  distributable=$(cast call $VAULT 'distributable()(uint256)' --rpc-url $RPC)  vendorBal=$(bal $VENDOR)"