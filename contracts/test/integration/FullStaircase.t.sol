// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "../helpers/EphorBase.sol";
import {ContinuityVault} from "../../src/ContinuityVault.sol";
import {SuccessionPlan} from "../../src/SuccessionPlan.sol";
import {Stage} from "../../src/interfaces/IEphor.sol";

/**
 * @title  FullStaircase — end-to-end demo arc, unattended
 * @notice The two demo money-shots, proven deterministically at the contract level:
 *          1. the founder goes silent and the company keeps paying its people, through
 *             EVERY stage of the succession staircase; and
 *          2. the founder returns and one heartbeat rewinds the whole staircase.
 *         This is the scripted, CI-able version of what the keeper + scenario driver run
 *         live once contracts are deployed.
 */
contract FullStaircaseTest is EphorBase {
    function _stage() internal view returns (uint8) {
        return uint8(plan.stage());
    }

    /// Roll to the next payroll block (if needed) and run one period. Permissionless.
    function _payrollDueAndRun() internal {
        uint64 next = vault.nextPayrollBlock();
        if (block.number < next) vm.roll(next);
        vm.prank(keeper); // anyone can drive it
        vault.runPayroll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Money-shot #1: silence → notice → capped handover → sweep, payroll never misses
    // ─────────────────────────────────────────────────────────────────────────
    function test_FullStaircase_Unattended_PayrollNeverMisses() public {
        // ── Period 1 · HEALTHY ── owner live, payroll ticking
        _payrollDueAndRun();
        assertEq(usdc.balanceOf(team[0]), u(10_000), "payroll paid while healthy");

        // ── SILENCE → STAGE 1 (Notice) ── permissionless advance once the window lapses
        _advanceToNotice();
        assertEq(_stage(), uint8(Stage.Notice));

        // ── Period 2 · during NOTICE ── nothing has moved, but payroll still runs
        _payrollDueAndRun();
        assertEq(usdc.balanceOf(team[0]), u(20_000), "payroll paid during Notice");

        // ── STAGE 2 (Handover) ── successor gains a capped operational role
        vm.roll(block.number + C1);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Handover));

        // successor pays an allowlisted vendor within caps...
        vm.prank(s1);
        vault.successorPay(vendor, u(18_000));
        assertEq(usdc.balanceOf(vendor), u(18_000), "capped successor spend lands");

        // ...and an over-cap attempt reverts ONCHAIN (caps enforced in the vault)
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.PerTxCapExceeded.selector);
        vault.successorPay(vendor, u(26_000));

        // ── Period 3 · during HANDOVER ── payroll still runs
        _payrollDueAndRun();
        assertEq(usdc.balanceOf(team[0]), u(30_000), "payroll paid during Handover");

        // ── STAGE 3 (Sweep) entered ── final challenge window open, nothing settled yet
        vm.roll(block.number + C2);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Sweep));
        assertFalse(plan.swept());

        // ── Period 4 · during SWEEP window ── payroll STILL runs
        _payrollDueAndRun();
        assertEq(usdc.balanceOf(team[0]), u(40_000), "payroll paid during Sweep window");

        // ── TERMINAL SWEEP ── conservation-exact settlement
        uint256 distBefore = vault.distributable();
        uint256 s1Before = usdc.balanceOf(s1);
        uint256 s2Before = usdc.balanceOf(s2);
        uint256 reserveBefore = vault.payrollReserve();

        vm.roll(block.number + C3);
        plan.advanceStage();
        assertTrue(plan.swept(), "sweep executed");

        uint256 paidOut = (usdc.balanceOf(s1) - s1Before) + (usdc.balanceOf(s2) - s2Before);
        uint256 reserveDelta = vault.payrollReserve() - reserveBefore;
        // INV-4 end-to-end: every distributable unit is paid out or re-earmarked, exactly.
        assertEq(paidOut + reserveDelta, distBefore, "INV-4: split conservation end-to-end");
        assertEq(vault.distributable(), 0, "nothing left distributable");
        assertEq(
            usdc.balanceOf(address(vault)),
            vault.payrollReserve() + vault.totalClaimable(),
            "solvency: balance == reserve + claims"
        );
        assertGt(usdc.balanceOf(s1), s1Before, "successor #1 received its split");
        assertGt(usdc.balanceOf(s2), s2Before, "successor #2 received its split");

        // Payroll never missed a beat: 4 full periods across all four stages.
        assertEq(usdc.balanceOf(team[4]), u(6_000) * 4, "every team member paid every period");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Money-shot #2: a heartbeat during handover rewinds the whole staircase
    // ─────────────────────────────────────────────────────────────────────────
    function test_OwnerReturns_MidHandover_Rewinds() public {
        _advanceToHandover();
        assertEq(_stage(), uint8(Stage.Handover));

        // payroll + a capped successor spend happen during handover
        _payrollDueAndRun();
        uint256 teamAfterHandoverPay = usdc.balanceOf(team[0]);
        vm.prank(s1);
        vault.successorPay(vendor, u(10_000));

        // ── OWNER RETURNS ── one heartbeat rewinds everything
        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active), "staircase rewound to Active");
        assertEq(plan.stageEnteredBlock(), 0);
        assertFalse(plan.swept());

        // the successor's capped role is revoked instantly
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.HandoverNotActive.selector);
        vault.successorPay(vendor, u(1_000));

        // ...but payroll STILL runs after the rewind — it never depended on the stage
        _payrollDueAndRun();
        assertGt(usdc.balanceOf(team[0]), teamAfterHandoverPay, "payroll continues after rewind");

        // no settlement occurred: the treasury is intact and still distributable
        assertGt(vault.distributable(), 0, "funds were never swept");

        // and the owner can keep the company running indefinitely with heartbeats
        vm.roll(block.number + WINDOW - 1);
        vm.prank(owner);
        plan.heartbeat();
        assertFalse(plan.isOverdue());
    }

    // A heartbeat at the very last moment (Sweep entered, pre-settlement) still wins.
    function test_OwnerReturns_AtSweepEdge_Rewinds() public {
        _advanceToSweepEntered();
        assertEq(_stage(), uint8(Stage.Sweep));
        assertFalse(plan.swept());

        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active), "owner-supremacy holds until the final sweep executes");
        assertFalse(plan.swept());
    }
}
