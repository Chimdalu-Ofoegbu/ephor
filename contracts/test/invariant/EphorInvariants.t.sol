// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EphorBase} from "../helpers/EphorBase.sol";
import {EphorHandler} from "./Handler.sol";
import {Stage} from "../../src/interfaces/IEphor.sol";

/// @dev The six named invariants, asserted across fuzzed action orderings.
contract EphorInvariants is EphorBase {
    EphorHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new EphorHandler(vault, plan, guardian, usdc, owner, s1, s2, vendor, [g1, g2, g3]);
        targetContract(address(handler));
    }

    // INV-1 owner-supremacy
    function invariant_OwnerSupremacy() public view {
        assertFalse(handler.supremacyViolated(), "INV-1: heartbeat must restore Active");
    }

    // INV-2 stage monotonicity
    function invariant_StageMonotonicity() public view {
        assertFalse(handler.monotonicityViolated(), "INV-2: stages never skip or regress");
        assertLe(uint8(plan.stage()), uint8(Stage.Sweep));
    }

    function invariant_SweptImpliesSweepStage() public view {
        if (plan.swept()) {
            assertEq(uint8(plan.stage()), uint8(Stage.Sweep), "swept => Sweep stage");
        }
    }

    // INV-4 split conservation (all distributable consumed once the sweep executes)
    function invariant_ConservationAfterSweep() public view {
        if (plan.swept()) {
            assertEq(
                usdc.balanceOf(address(vault)),
                vault.payrollReserve() + vault.totalClaimable(),
                "INV-4: distributable fully settled"
            );
            assertEq(vault.distributable(), 0);
        }
    }

    // INV-5 cap safety
    function invariant_CapSafety() public view {
        assertLe(vault.spentInWindow(s1), u(50_000), "INV-5: s1 within daily cap");
        assertLe(vault.spentInWindow(s2), u(30_000), "INV-5: s2 within daily cap");
        assertFalse(handler.capViolated());
    }

    // INV-6 payroll continuity
    function invariant_PayrollContinuity() public view {
        assertFalse(handler.payrollFailedWhenFunded(), "INV-6: funded payroll never fails");
    }

    // Solvency: the earmarked reserve + escrowed claims are always fully backed by real tokens.
    function invariant_Solvency() public view {
        assertGe(
            usdc.balanceOf(address(vault)),
            vault.payrollReserve() + vault.totalClaimable(),
            "reserve + claims fully backed"
        );
    }
}
