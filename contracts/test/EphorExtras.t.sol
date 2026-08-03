// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "./helpers/EphorBase.sol";
import {ContinuityVault} from "../src/ContinuityVault.sol";
import {SuccessionPlan} from "../src/SuccessionPlan.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {Stage} from "../src/interfaces/IEphor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Reserve-protection guarantees, releaseReserve, views, and remaining revert branches.
contract EphorExtrasTest is EphorBase {
    // ── reserve is untouchable except by payroll / sweep ──

    function test_SuccessorPay_CannotDrainReserve() public {
        _advanceToHandover();
        // shrink distributable to 10k by withdrawing operating funds
        vm.prank(owner);
        vault.ownerWithdraw(IERC20(address(usdc)), owner, u(250_000));
        assertEq(vault.distributable(), u(10_000));
        // 20k is within the per-tx cap, but would dip into the payroll reserve
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.ExceedsDistributable.selector);
        vault.successorPay(vendor, u(20_000));
    }

    function test_OwnerWithdraw_CannotTouchReserve() public {
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.ExceedsDistributable.selector);
        vault.ownerWithdraw(IERC20(address(usdc)), owner, u(300_000)); // > 260k distributable
    }

    function test_ReleaseReserve_ThenWithdraw() public {
        vm.startPrank(owner);
        vault.releaseReserve(u(40_000));
        assertEq(vault.payrollReserve(), RESERVE - u(40_000));
        vault.ownerWithdraw(IERC20(address(usdc)), owner, u(300_000)); // now distributable = 300k
        vm.stopPrank();
        assertEq(usdc.balanceOf(owner), u(300_000));
    }

    function test_ReleaseReserve_RevertsIfTooMuch() public {
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.ReserveInsufficient.selector);
        vault.releaseReserve(RESERVE + 1);
    }

    function test_Payroll_SurvivesMaxSuccessorSpend() public {
        // INV-6 end-to-end: even after a successor spends its full daily cap, payroll still pays.
        _advanceToHandover();
        vm.prank(s1);
        vault.successorPay(vendor, u(25_000));
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[0]), u(10_000));
    }

    // ── views ──

    function test_Views() public view {
        assertEq(vault.distributable(), DISTRIBUTABLE);
        assertEq(vault.successorCount(), 2);
        assertEq(vault.payrollCount(), 5);
        assertEq(vault.allocationCount(), 4);
        assertEq(vault.payrollTotalPerPeriod(), u(40_000));
        assertEq(plan.deadlineBlock(), uint64(block.number) + WINDOW);
        assertFalse(plan.isOverdue());
        assertEq(plan.nextAdvanceBlock(), block.number + WINDOW + 1);
    }

    function test_NextAdvanceBlock_InNotice() public {
        _advanceToNotice();
        assertEq(plan.nextAdvanceBlock(), plan.stageEnteredBlock() + C1);
    }

    // ── remaining revert branches ──

    function test_Advance_RevertsIfVaultNotSet() public {
        uint64[3] memory ch = [C1, C2, C3];
        SuccessionPlan p = new SuccessionPlan(owner, WINDOW, ch);
        vm.roll(block.number + WINDOW + 1);
        vm.expectRevert(SuccessionPlan.VaultNotSet.selector);
        p.advanceStage();
    }

    function test_Sweep_RevertsIfConfigNotLocked() public {
        MockERC20 t = new MockERC20("USD Coin", "USDC", 6);
        uint64[3] memory ch = [C1, C2, C3];
        SuccessionPlan p = new SuccessionPlan(owner, WINDOW, ch);
        ContinuityVault v = new ContinuityVault(owner, t, PERIOD, DAILY_WINDOW);
        vm.prank(owner);
        v.setPlan(address(p));
        vm.prank(address(p));
        vm.expectRevert(ContinuityVault.ConfigNotLocked.selector);
        v.executeContinuitySettlement();
    }

    function test_Cancel_RevertsAfterSwept() public {
        _executeSweep();
        vm.prank(owner);
        vm.expectRevert(SuccessionPlan.AlreadySwept.selector);
        plan.cancel();
    }

    function test_ConfigurePayroll_TooLargeReverts() public {
        MockERC20 t = new MockERC20("USD Coin", "USDC", 6);
        ContinuityVault v = new ContinuityVault(owner, t, PERIOD, DAILY_WINDOW);
        ContinuityVault.Payee[] memory payees = new ContinuityVault.Payee[](11);
        for (uint256 i = 0; i < 11; ++i) {
            payees[i] = ContinuityVault.Payee(address(uint160(i + 1)), u(1));
        }
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.PayrollBatchTooLarge.selector);
        v.configurePayroll(payees, 0);
    }

    function test_SetPlan_RevertsWhenAlreadySet() public {
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.PlanAlreadySet.selector);
        vault.setPlan(address(plan));
    }

    // ── M-1: pull-over-push escrow (one bad recipient can't brick the sweep) ──

    function test_Sweep_NotBrickedByBlockedRecipient() public {
        usdc.setBlocked(s2, true); // a split recipient becomes unable to receive (USDC-style blocklist)
        _executeSweep(); // must NOT revert

        // s1 paid directly (30% + 15% = 117k); s2's 78k is escrowed, not lost, not bricking the sweep
        assertEq(usdc.balanceOf(s1), u(117_000));
        assertEq(usdc.balanceOf(s2), 0);
        assertEq(vault.claimable(s2), u(78_000));
        assertEq(vault.totalClaimable(), u(78_000));

        // once unblocked, s2 pulls its escrowed funds
        usdc.setBlocked(s2, false);
        vm.prank(s2);
        vault.claim();
        assertEq(usdc.balanceOf(s2), u(78_000));
        assertEq(vault.claimable(s2), 0);
        assertEq(vault.totalClaimable(), 0);
    }

    function test_Claim_RevertsWhenNothingOwed() public {
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.NothingToClaim.selector);
        vault.claim();
    }

    // ── H-A / INV-6: one unreceivable payee can't brick payroll for the whole team ──
    // The M-1 escrow pattern, now applied to runPayroll. This is the exact founder-gone failure
    // mode INV-6 exists to prevent: with no owner left to fix a config, a single blocklisted payee
    // must not be able to freeze everyone else's wages forever.

    function test_Payroll_NotBrickedByBlockedPayee() public {
        usdc.setBlocked(team[2], true); // one payee (8k) becomes unable to receive — USDC-style blocklist
        vm.roll(block.number + PERIOD); // payroll becomes due

        vault.runPayroll(); // must NOT revert — pay the four healthy payees, escrow the blocked one

        // the four receivable payees are paid in full...
        assertEq(usdc.balanceOf(team[0]), u(10_000));
        assertEq(usdc.balanceOf(team[1]), u(9_000));
        assertEq(usdc.balanceOf(team[3]), u(7_000));
        assertEq(usdc.balanceOf(team[4]), u(6_000));
        // ...the blocked payee's wage is escrowed, not lost, and did not brick the batch
        assertEq(usdc.balanceOf(team[2]), 0);
        assertEq(vault.claimable(team[2]), u(8_000));
        assertEq(vault.totalClaimable(), u(8_000));
        // exactly one full period left the reserve, regardless of the escrow
        assertEq(vault.payrollReserve(), RESERVE - u(40_000));

        // once unblocked, the payee pulls the escrowed wage
        usdc.setBlocked(team[2], false);
        vm.prank(team[2]);
        vault.claim();
        assertEq(usdc.balanceOf(team[2]), u(8_000));
        assertEq(vault.claimable(team[2]), 0);
        assertEq(vault.totalClaimable(), 0);
    }

    // ── L-A: a wallet can't be added as a successor twice (would double its settlement split) ──

    function test_AddSuccessor_RevertsOnDuplicate() public {
        ContinuityVault v = new ContinuityVault(owner, usdc, PERIOD, DAILY_WINDOW);
        address[] memory allow = new address[](0);
        vm.startPrank(owner);
        v.addSuccessor(s1, u(25_000), u(50_000), 3000, allow);
        vm.expectRevert(ContinuityVault.AlreadySuccessor.selector);
        v.addSuccessor(s1, u(10_000), u(20_000), 1000, allow);
        vm.stopPrank();
    }

    // ── L-1: the capped successor role closes once the sweep window opens ──

    function test_SuccessorPay_ClosedInSweepStage() public {
        _advanceToSweepEntered(); // stage == Sweep, not yet settled
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.HandoverNotActive.selector);
        vault.successorPay(vendor, u(1_000));
    }

    // ── L-4: succession can't be armed before the vault policy is finalized ──

    function test_Advance_RevertsIfConfigNotLocked() public {
        MockERC20 t = new MockERC20("USD Coin", "USDC", 6);
        uint64[3] memory ch = [C1, C2, C3];
        SuccessionPlan p = new SuccessionPlan(owner, WINDOW, ch);
        ContinuityVault v = new ContinuityVault(owner, t, PERIOD, DAILY_WINDOW);
        vm.startPrank(owner);
        p.setVault(address(v));
        v.setPlan(address(p));
        vm.stopPrank();
        vm.roll(block.number + WINDOW + 1);
        vm.expectRevert(SuccessionPlan.VaultNotReady.selector);
        p.advanceStage();
    }
}
