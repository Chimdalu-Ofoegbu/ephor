/**
 * @ephor/shared — the frozen contract between UI and chain.
 *
 * Import surface for the design session:
 *   import { EphorProvider, scenarios, scenarioOrder, type Vault } from "@ephor/shared";
 *
 * Everything here is stable after Phase 0. See provider.ts for the interface the
 * MockEphorProvider (design session) and LiveEphorProvider (this session) implement.
 */
export * from "./types";
export * from "./provider";
export * from "./addresses";
export * from "./chain";
export * from "./scenarios";
export * from "./live-provider";

/** Demo fixtures (actors, company, builders) — namespaced to keep the top-level clean. */
export * as fixtures from "./fixtures";
