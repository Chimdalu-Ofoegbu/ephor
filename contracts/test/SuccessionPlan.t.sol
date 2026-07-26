// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "./helpers/EphorBase.sol";
import {SuccessionPlan} from "../src/SuccessionPlan.sol";
import {Stage} from "../src/interfaces/IEphor.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Stage machine: INV-1 (owner-supremacy), INV-2 (monotonicity), INV-3 (no early execution).
contract SuccessionPlanTest is EphorBase {
    function _stage() internal view returns (uint8) {
        return uint8(plan.stage());
    }

    // ── construction / linking ──

    function test_InitialState() public view {
        assertEq(_stage(), uint8(Stage.Active));
        assertEq(plan.owner(), owner);
        assertEq(plan.windowBlocks(), WINDOW);
        assertEq(address(plan.vault()), address(vault));
        assertFalse(plan.swept());
        assertFalse(plan.frozen());
    }

    function test_SetVault_RevertWhenAlreadySet() public {
        vm.prank(owner);
        vm.expectRevert(SuccessionPlan.VaultAlreadySet.selector);
        plan.setVault(address(vault));
    }

    function test_SetGuardian_OnlyOwner() public {
        vm.prank(s1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, s1));
        plan.setGuardian(address(0xBEEF));
    }

    // ── INV-3: no early execution ──

    function test_AdvanceFromActive_RevertsBeforeWindow() public {
        vm.roll(block.number + WINDOW); // exactly at deadline, not past it
        vm.expectRevert(SuccessionPlan.WindowNotLapsed.selector);
        plan.advanceStage();
    }

    function test_AdvanceFromActive_SucceedsAfterWindow() public {
        vm.roll(block.number + WINDOW + 1);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Notice));
    }

    function test_AdvanceNotice_RevertsBeforeChallenge() public {
        _advanceToNotice();
        vm.roll(block.number + C1 - 1);
        vm.expectRevert(SuccessionPlan.WindowNotLapsed.selector);
        plan.advanceStage();
    }

    function testFuzz_NoEarlyExecution(uint64 offset) public {
        offset = uint64(bound(offset, 0, WINDOW)); // never past the window
        vm.roll(block.number + offset);
        vm.expectRevert(SuccessionPlan.WindowNotLapsed.selector);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Active));
    }

    // ── INV-2: monotonicity ──

    function test_FullSequenceMonotonic() public {
        _advanceToNotice();
        assertEq(_stage(), uint8(Stage.Notice));
        vm.roll(block.number + C1);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Handover));
        vm.roll(block.number + C2);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Sweep));
        assertFalse(plan.swept());
        vm.roll(block.number + C3);
        plan.advanceStage();
        assertTrue(plan.swept());
    }

    function test_AdvanceIsPermissionless() public {
        vm.roll(block.number + WINDOW + 1);
        vm.prank(keeper); // anyone
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Notice));
    }

    function test_CannotAdvanceAfterSwept() public {
        _executeSweep();
        vm.expectRevert(SuccessionPlan.AlreadySwept.selector);
        plan.advanceStage();
    }

    // ── INV-1: owner-supremacy ──

    function test_HeartbeatCancelsFromNotice() public {
        _advanceToNotice();
        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active));
        assertEq(plan.stageEnteredBlock(), 0);
    }

    function test_HeartbeatCancelsFromHandover() public {
        _advanceToHandover();
        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active));
    }

    function test_HeartbeatCancelsFromSweepEntered() public {
        _advanceToSweepEntered();
        assertEq(_stage(), uint8(Stage.Sweep));
        assertFalse(plan.swept());
        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active));
    }

    function test_CancelAliasWorks() public {
        _advanceToHandover();
        vm.prank(owner);
        plan.cancel();
        assertEq(_stage(), uint8(Stage.Active));
    }

    function test_HeartbeatRevertsAfterSwept() public {
        _executeSweep();
        vm.prank(owner);
        vm.expectRevert(SuccessionPlan.AlreadySwept.selector);
        plan.heartbeat();
    }

    function test_HeartbeatOnlyOwner() public {
        _advanceToNotice();
        vm.prank(s1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, s1));
        plan.heartbeat();
    }

    function test_HeartbeatRefreshesWindow() public {
        vm.roll(block.number + WINDOW - 1);
        vm.prank(owner);
        plan.heartbeat();
        assertEq(plan.deadlineBlock(), uint64(block.number) + WINDOW);
        assertFalse(plan.isOverdue());
    }

    /// INV-1 under fuzz: a heartbeat at ANY point in ANY non-final stage restores Active.
    function testFuzz_OwnerSupremacyAnyOrdering(uint8 steps, uint64 extra) public {
        steps = uint8(bound(steps, 0, 3));
        extra = uint64(bound(extra, 0, 40));

        if (steps >= 1) _advanceToNotice();
        if (steps >= 2) {
            vm.roll(block.number + C1);
            plan.advanceStage();
        }
        if (steps >= 3) {
            vm.roll(block.number + C2);
            plan.advanceStage();
        }
        vm.roll(block.number + extra);

        // not yet swept in any of these orderings
        assertFalse(plan.swept());
        vm.prank(owner);
        plan.heartbeat();
        assertEq(_stage(), uint8(Stage.Active), "owner heartbeat must restore Active");
    }

    // ── guardian freeze ──

    function test_FreezeBlocksAdvance() public {
        _advanceToNotice();
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true); // 2-of-3 -> plan frozen
        assertTrue(plan.frozen());

        vm.roll(block.number + C1);
        vm.expectRevert(SuccessionPlan.IsFrozen.selector);
        plan.advanceStage();
    }

    function test_UnfreezeRestoresAdvance() public {
        _advanceToNotice();
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        vm.prank(g1);
        guardian.vote(false);
        vm.prank(g3);
        guardian.vote(false);
        assertFalse(plan.frozen());

        vm.roll(block.number + C1);
        plan.advanceStage();
        assertEq(_stage(), uint8(Stage.Handover));
    }

    function test_FreezeOnlyByGuardianContract() public {
        vm.prank(owner);
        vm.expectRevert(SuccessionPlan.NotGuardian.selector);
        plan.freeze();
    }
}
