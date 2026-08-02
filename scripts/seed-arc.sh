#!/usr/bin/env bash
#
# Seed the deployed Ephor vault on Arc testnet with a small demo config, via `cast send`.
#
# Why not `forge script`? Arc's USDC (0x3600…) delegates to an implementation that
# staticcalls a native blocklist precompile at 0x1800…0001. forge's local/forked EVM
# can't execute that precompile, so any script touching transferFrom/approve reverts in
# simulation ("StackUnderflow") before broadcasting. `cast send` runs on the real node,
# where the precompile exists — same path the keeper uses via viem.
#
# Amounts are testnet-scaled (~10 USDC total). One-shot: aborts if config is already locked.
# Requires: DEPLOYER_PRIVATE_KEY, SUCCESSOR1/2_PRIVATE_KEY, VENDOR_PRIVATE_KEY in .env,
# a funded deployer, and VAULT_ADDRESS (defaults to the current deployment).
#
#   bash scripts/seed-arc.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC="${ARC_RPC_URL:?set ARC_RPC_URL}"
PK="${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
VAULT="${VAULT_ADDRESS:-0x9215fD038685e23c08f83b52137f95662DC33021}"
USDC="${USDC_ADDRESS:-0x3600000000000000000000000000000000000000}"

DEPLOYER=$(cast wallet address --private-key "$PK")
S1=$(cast wallet address --private-key "${SUCCESSOR1_PRIVATE_KEY:?}")
S2=$(cast wallet address --private-key "${SUCCESSOR2_PRIVATE_KEY:?}")
VENDOR=$(cast wallet address --private-key "${VENDOR_PRIVATE_KEY:?}")

# Amounts / caps (6-dec USDC). Override via env for production scale.
PAY=${SEED_PAYROLL_PER_PERIOD:-1000000}   # 1 USDC / period
RES=${SEED_RESERVE:-6000000}              # 6 USDC earmarked (6 periods)
DIST=${SEED_DISTRIBUTABLE:-4000000}       # 4 USDC distributable
S1TX=${SEED_S1_PERTX:-2000000}; S1DY=${SEED_S1_DAILY:-3000000}
S2TX=${SEED_S2_PERTX:-1000000}; S2DY=${SEED_S2_DAILY:-1500000}

if [ "$(cast call "$VAULT" 'configLocked()(bool)' --rpc-url "$RPC")" = "true" ]; then
  echo "Vault $VAULT already seeded (configLocked=true). Nothing to do."
  exit 0
fi

s() { echo "-> $1"; shift; cast send "$@" --private-key "$PK" --rpc-url "$RPC" >/dev/null; }

s "configurePayroll" "$VAULT" "configurePayroll((address,uint256)[],uint64)" "[($DEPLOYER,$PAY)]" 0
s "addSuccessor1"    "$VAULT" "addSuccessor(address,uint256,uint256,uint16,address[])" "$S1" "$S1TX" "$S1DY" 3000 "[$VENDOR,$DEPLOYER]"
s "addSuccessor2"    "$VAULT" "addSuccessor(address,uint256,uint256,uint16,address[])" "$S2" "$S2TX" "$S2DY" 2000 "[$VENDOR]"
s "setAllocations"   "$VAULT" "setAllocations((address,uint16)[])" "[($VAULT,3000),($VAULT,2000)]"
s "lockConfig"       "$VAULT" "lockConfig()"
s "approve"          "$USDC"  "approve(address,uint256)" "$VAULT" $((RES + DIST))
s "fundReserve"      "$VAULT" "fundPayrollReserve(uint256)" "$RES"
s "depositFunds"     "$VAULT" "depositFunds(uint256)" "$DIST"

echo "Seeded $VAULT — reserve=$RES distributable=$DIST (6-dec USDC)."
