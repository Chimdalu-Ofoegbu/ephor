// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "./helpers/EphorBase.sol";
import {ContinuityVault} from "../src/ContinuityVault.sol";
import {SuccessionPlan} from "../src/SuccessionPlan.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {Stage} from "../src/interfaces/IEphor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Treasury: INV-4 (split conservation), INV-5 (cap safety), INV-6 (payroll continuity).
contract ContinuityVaultTest is EphorBase {
    // ── config integrity ──

    function test_LockConfig_RevertsOnBadSplits() public {
        MockERC20 t = new MockERC20("USD Coin", "USDC", 6);
        ContinuityVault v = new ContinuityVault(owner, t, PERIOD, DAILY_WINDOW);
        vm.startPrank(owner);
        ContinuityVault.Allocation[] memory allocs = new ContinuityVault.Allocation[](1);
        allocs[0] = ContinuityVault.Allocation(s1, 9000); // only 90% — no successors → total 9000
        v.setAllocations(allocs);
        vm.expectRevert(abi.encodeWithSelector(ContinuityVault.InvalidSplits.selector, uint256(9000)));
        v.lockConfig();
        vm.stopPrank();
    }

    function test_Config_RevertsAfterLock() public {
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.ConfigIsLocked.selector);
        vault.setAllocations(new ContinuityVault.Allocation[](0));
    }

    // ── INV-6: payroll continuity ──

    function test_PayrollNotDue_Reverts() public {
        vm.expectRevert(ContinuityVault.PayrollNotDue.selector);
        vault.runPayroll();
    }

    function test_Payroll_HealthyStage() public {
        vm.roll(block.number + PERIOD);
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[0]), u(10_000));
        assertEq(usdc.balanceOf(team[4]), u(6_000));
        assertEq(vault.payrollReserve(), RESERVE - u(40_000));
    }

    function test_PayrollContinuity_Notice() public {
        _advanceToNotice();
        vault.runPayroll(); // block is already well past nextPayrollBlock
        assertEq(usdc.balanceOf(team[0]), u(10_000));
    }

    function test_PayrollContinuity_Handover() public {
        _advanceToHandover();
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[1]), u(9_000));
    }

    function test_PayrollContinuity_SweepEntered() public {
        _advanceToSweepEntered();
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[2]), u(8_000));
    }

    function test_PayrollContinuity_WhenFrozen() public {
        _advanceToHandover();
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        assertTrue(plan.frozen());
        // payroll is sacred — a guardian freeze does not starve the team
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[3]), u(7_000));
    }

    function test_Payroll_Permissionless() public {
        vm.roll(block.number + PERIOD);
        vm.prank(keeper);
        vault.runPayroll();
        assertEq(usdc.balanceOf(team[0]), u(10_000));
    }

    // ── INV-5: cap safety ──

    function test_SuccessorPay_WithinCaps() public {
        _advanceToHandover();
        vm.prank(s1);
        vault.successorPay(vendor, u(18_000));
        assertEq(usdc.balanceOf(vendor), u(18_000));
        assertEq(vault.spentInWindow(s1), u(18_000));
    }

    function test_SuccessorPay_PerTxCapReverts() public {
        _advanceToHandover();
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.PerTxCapExceeded.selector);
        vault.successorPay(vendor, u(26_000)); // > 25k per-tx cap
    }

    function test_SuccessorPay_DailyCapReverts() public {
        _advanceToHandover();
        vm.startPrank(s1);
        vault.successorPay(vendor, u(25_000));
        vault.successorPay(vendor, u(25_000)); // spent = 50k (== daily cap)
        vm.expectRevert(ContinuityVault.DailyCapExceeded.selector);
        vault.successorPay(vendor, u(1)); // 50k + 1 > 50k
        vm.stopPrank();
    }

    function test_SuccessorPay_DailyWindowResets() public {
        _advanceToHandover();
        vm.prank(s1);
        vault.successorPay(vendor, u(25_000));
        vm.roll(block.number + DAILY_WINDOW); // tumble the window
        vm.prank(s1);
        vault.successorPay(vendor, u(25_000)); // fresh window
        assertEq(usdc.balanceOf(vendor), u(50_000));
        assertEq(vault.spentInWindow(s1), u(25_000));
    }

    function test_SuccessorPay_NotSuccessorReverts() public {
        _advanceToHandover();
        vm.prank(vendor);
        vm.expectRevert(ContinuityVault.NotSuccessor.selector);
        vault.successorPay(vendor, u(1_000));
    }

    function test_SuccessorPay_PayeeNotAllowlistedReverts() public {
        _advanceToHandover();
        address stranger = makeAddr("stranger");
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.PayeeNotAllowlisted.selector);
        vault.successorPay(stranger, u(1_000));
    }

    function test_SuccessorPay_HandoverNotActiveReverts() public {
        _advanceToNotice(); // stage 1, not yet handover
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.HandoverNotActive.selector);
        vault.successorPay(vendor, u(1_000));
    }

    function test_SuccessorPay_FrozenReverts() public {
        _advanceToHandover();
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        vm.prank(s1);
        vm.expectRevert(ContinuityVault.IsFrozen.selector);
        vault.successorPay(vendor, u(1_000));
    }

    function testFuzz_CapSafety(uint256 amount) public {
        _advanceToHandover();
        amount = bound(amount, 1, u(100_000));
        vm.prank(s1);
        if (amount > u(25_000)) {
            vm.expectRevert(ContinuityVault.PerTxCapExceeded.selector);
            vault.successorPay(vendor, amount);
        } else {
            vault.successorPay(vendor, amount);
            assertLe(vault.spentInWindow(s1), u(50_000)); // never exceeds daily cap
            assertLe(amount, u(25_000)); // never exceeds per-tx cap
        }
    }

    // ── INV-4: split conservation ──

    function test_Sweep_SplitConservationExact() public {
        _executeSweep();
        // s1: 30% split (78k) + 15% buffer (39k) = 117k
        assertEq(usdc.balanceOf(s1), u(117_000));
        // s2: 20% split (52k) + 10% base leg (26k) = 78k
        assertEq(usdc.balanceOf(s2), u(78_000));
        // vault keeps reserve (240k) + 20% top-up (52k) + 5% USYC park (13k) = 305k
        assertEq(usdc.balanceOf(address(vault)), u(305_000));
        assertEq(vault.payrollReserve(), u(305_000));
        // all distributable consumed
        assertEq(vault.distributable(), 0);
    }

    function testFuzz_SplitConservation(uint96 extra) public {
        uint256 e = bound(uint256(extra), 0, 5_000_000e6);
        // add a random amount to the distributable pool
        usdc.mint(owner, e);
        vm.startPrank(owner);
        usdc.approve(address(vault), e);
        vault.depositFunds(e);
        vm.stopPrank();

        uint256 dBefore = vault.distributable();
        uint256 s1Before = usdc.balanceOf(s1);
        uint256 s2Before = usdc.balanceOf(s2);
        uint256 reserveBefore = vault.payrollReserve();

        _executeSweep();

        uint256 external_ = (usdc.balanceOf(s1) - s1Before) + (usdc.balanceOf(s2) - s2Before);
        uint256 reserveDelta = vault.payrollReserve() - reserveBefore;
        // conservation: every distributable unit is either paid out or re-earmarked, exactly.
        assertEq(external_ + reserveDelta, dBefore, "split conservation");
        assertEq(vault.distributable(), 0, "nothing left distributable");
        assertEq(usdc.balanceOf(address(vault)), vault.payrollReserve(), "solvency: balance == reserve");
    }

    function test_Sweep_OnlyPlan() public {
        vm.prank(owner);
        vm.expectRevert(ContinuityVault.NotPlan.selector);
        vault.executeContinuitySettlement();
    }

    // ── owner supremacy over funds ──

    function test_OwnerWithdraw() public {
        vm.prank(owner);
        vault.ownerWithdraw(IERC20(address(usdc)), owner, u(1_000));
        assertEq(usdc.balanceOf(owner), u(1_000));
    }

    function test_OwnerWithdraw_OnlyOwner() public {
        vm.prank(s1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, s1));
        vault.ownerWithdraw(IERC20(address(usdc)), s1, u(1_000));
    }

    function test_Deposit_IncreasesBalance() public {
        usdc.mint(owner, u(1_000));
        vm.startPrank(owner);
        usdc.approve(address(vault), u(1_000));
        vault.depositFunds(u(1_000));
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(vault)), TREASURY + u(1_000));
    }
}
