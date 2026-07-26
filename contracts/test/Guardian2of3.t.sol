// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "./helpers/EphorBase.sol";
import {Guardian2of3} from "../src/Guardian2of3.sol";

/// @dev 2-of-3 veto multisig (the duress brake).
contract Guardian2of3Test is EphorBase {
    function test_Constructor_RevertsDuplicateGuardian() public {
        vm.expectRevert(Guardian2of3.DuplicateGuardian.selector);
        new Guardian2of3([g1, g1, g2], address(plan));
    }

    function test_Constructor_RevertsZeroGuardian() public {
        vm.expectRevert(Guardian2of3.ZeroGuardian.selector);
        new Guardian2of3([g1, address(0), g2], address(plan));
    }

    function test_SingleVote_NoAction() public {
        vm.prank(g1);
        guardian.vote(true);
        assertFalse(plan.frozen());
        assertEq(guardian.voteCount(0), 1);
        assertEq(guardian.round(), 0);
    }

    function test_TwoVotes_Freeze() public {
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        assertTrue(plan.frozen());
        assertEq(guardian.round(), 1); // round advanced after action
    }

    function test_ThirdGuardianCanComplete() public {
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g3);
        guardian.vote(true); // g1 + g3 is a valid 2-of-3
        assertTrue(plan.frozen());
    }

    function test_ConflictingVote_Reverts() public {
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        vm.expectRevert(Guardian2of3.ConflictingVote.selector);
        guardian.vote(false);
    }

    function test_AlreadyConfirmed_Reverts() public {
        vm.startPrank(g1);
        guardian.vote(true);
        vm.expectRevert(Guardian2of3.AlreadyConfirmed.selector);
        guardian.vote(true);
        vm.stopPrank();
    }

    function test_NonGuardian_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(Guardian2of3.NotGuardian.selector);
        guardian.vote(true);
    }

    function test_FreezeThenUnfreezeCycle() public {
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        assertTrue(plan.frozen());

        vm.prank(g2);
        guardian.vote(false);
        vm.prank(g3);
        guardian.vote(false);
        assertFalse(plan.frozen());
        assertEq(guardian.round(), 2);
    }
}
