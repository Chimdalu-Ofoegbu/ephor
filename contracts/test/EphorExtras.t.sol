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
}
