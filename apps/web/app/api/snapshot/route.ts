import { buildLiveSnapshot } from "@/lib/live";
import { stringify } from "@/lib/serial";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await buildLiveSnapshot();
    return new Response(stringify(snapshot), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }
}
