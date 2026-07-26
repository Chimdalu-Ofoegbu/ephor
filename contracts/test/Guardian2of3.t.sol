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
        assertEq(guardian.directionVotes(0, true), 1);
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

    /// H-1: a first-mover or dissenting vote must NOT block the majority.
    function test_DissentDoesNotBlockMajority() public {
        vm.prank(g1);
        guardian.vote(false); // front-run with the opposite direction
        vm.prank(g2);
        guardian.vote(true);
        vm.prank(g3);
        guardian.vote(true); // two concordant freeze votes win regardless of g1
        assertTrue(plan.frozen());
        assertEq(guardian.directionVotes(0, true), 2);
        assertEq(guardian.directionVotes(0, false), 1);
    }

    /// H-1: one compromised guardian cannot DoS the freeze during a duress event.
    function test_CompromisedGuardianCannotBlockFreeze() public {
        vm.prank(g3);
        guardian.vote(false); // compromised guardian spams "unfreeze"
        vm.prank(g1);
        guardian.vote(true);
        vm.prank(g2);
        guardian.vote(true);
        assertTrue(plan.frozen());
    }

    function test_AlreadyVoted_Reverts() public {
        vm.startPrank(g1);
        guardian.vote(true);
        vm.expectRevert(Guardian2of3.AlreadyVoted.selector);
        guardian.vote(false); // same guardian cannot vote twice, even in the other direction
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
