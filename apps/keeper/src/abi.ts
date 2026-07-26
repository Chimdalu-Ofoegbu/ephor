import { parseAbi } from "viem";

/** Human-readable ABIs for the calls the keeper makes (no JSON artifacts needed). */
export const planAbi = parseAbi([
  "function stage() view returns (uint8)",
  "function swept() view returns (bool)",
  "function frozen() view returns (bool)",
  "function isOverdue() view returns (bool)",
  "function nextAdvanceBlock() view returns (uint256)",
  "function deadlineBlock() view returns (uint64)",
  "function advanceStage()",
]);

export const vaultAbi = parseAbi([
  "function nextPayrollBlock() view returns (uint64)",
  "function payrollReserve() view returns (uint256)",
  "function payrollTotalPerPeriod() view returns (uint256)",
  "function runPayroll()",
]);
