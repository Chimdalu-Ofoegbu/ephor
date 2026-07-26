import { scenarioOrder, getScenario } from "@ephor/shared";

/**
 * Scenario driver (skeleton). Today it prints the six deterministic beats from the
 * shared fixtures. In Phase 3 it drives a live deployment through the same beats on
 * compressed windows (fund → miss heartbeat → advance → capped spend → sweep; and the
 * owner-returns rewind), so the demo runs unattended.
 */
function main(): void {
  console.log("Ephor scenarios (deterministic fixtures):\n");
  for (const id of scenarioOrder) {
    const s = getScenario(id);
    const hb = s.snapshot.heartbeat;
    console.log(`• ${s.title.padEnd(18)} stage=${s.snapshot.vault.currentStage}  ${s.caption}`);
    console.log(
      `  heartbeat=${hb.state} block=${hb.currentBlock} deadline=${hb.deadlineBlock} receipts=${s.snapshot.receipts.length}`,
    );
  }
  console.log("\n(Phase 3 wires this to a live Arc deployment.)");
}

main();
