import { Dashboard } from "@/components/Dashboard";
import { DEPLOYMENT } from "@/lib/config";

export default function Page() {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";
  return <Dashboard initialMode={mode} deployment={DEPLOYMENT} />;
}
