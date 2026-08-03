import { createWalletClient, defineChain, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENT } from "@/lib/config";

export const dynamic = "force-dynamic";

const arc = defineChain({
  id: DEPLOYMENT.chainId,
  name: "Arc testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [DEPLOYMENT.rpcUrl] } },
});

const PLAN_W = parseAbi(["function heartbeat()", "function advanceStage()"]);
const VAULT_W = parseAbi(["function runPayroll()"]);

export async function POST(req: Request) {
  let action = "";
  try {
    action = (await req.json())?.action ?? "";
  } catch {
    /* empty body */
  }

  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) return new Response("No signer configured (DEPLOYER_PRIVATE_KEY missing).", { status: 400 });
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  // advanceStage is permissionless; heartbeat/payroll the owner. One key drives all three here.
  const wallet = createWalletClient({ account, chain: arc, transport: http(DEPLOYMENT.rpcUrl) });
  const plan = DEPLOYMENT.plan as Address;
  const vault = DEPLOYMENT.vault as Address;

  try {
    let hash: Hex;
    if (action === "heartbeat") hash = await wallet.writeContract({ address: plan, abi: PLAN_W, functionName: "heartbeat" });
    else if (action === "advance") hash = await wallet.writeContract({ address: plan, abi: PLAN_W, functionName: "advanceStage" });
    else if (action === "payroll") hash = await wallet.writeContract({ address: vault, abi: VAULT_W, functionName: "runPayroll" });
    else return new Response("Unknown action.", { status: 400 });
    return Response.json({ ok: true, action, hash });
  } catch (e) {
    // Surface the revert reason (e.g. WindowNotLapsed) so the UI can explain it.
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg.split("\n")[0].slice(0, 200), { status: 500 });
  }
}
