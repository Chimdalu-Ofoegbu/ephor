// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ContinuityVault} from "../../src/ContinuityVault.sol";
import {SuccessionPlan} from "../../src/SuccessionPlan.sol";
import {Guardian2of3} from "../../src/Guardian2of3.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {Stage} from "../../src/interfaces/IEphor.sol";

/// @dev Drives the Ephor system with bounded random actions and records ghost flags
///      that the invariant suite asserts remain clean across every ordering.
contract EphorHandler is Test {
    ContinuityVault public vault;
    SuccessionPlan public plan;
    Guardian2of3 public guardian;
    MockERC20 public usdc;

    address internal owner;
    address internal s1;
    address internal s2;
    address internal vendor;
    address[3] internal guardians;

    // ── ghosts (asserted by the invariant suite) ──
    bool public monotonicityViolated; // INV-2
    bool public supremacyViolated; // INV-1
    bool public capViolated; // INV-5
    bool public payrollFailedWhenFunded; // INV-6
    uint8 public maxStageSeen;

    // ── coverage counters ──
    uint256 public heartbeats;
    uint256 public advances;
    uint256 public payrolls;
    uint256 public spends;

    constructor(
        ContinuityVault _vault,
        SuccessionPlan _plan,
        Guardian2of3 _guardian,
        MockERC20 _usdc,
        address _owner,
        address _s1,
        address _s2,
        address _vendor,
        address[3] memory _guardians
    ) {
        vault = _vault;
        plan = _plan;
        guardian = _guardian;
        usdc = _usdc;
        owner = _owner;
        s1 = _s1;
        s2 = _s2;
        vendor = _vendor;
        guardians = _guardians;
    }

    function warp(uint256 blocks) external {
        vm.roll(block.number + bound(blocks, 1, 60));
    }

    function heartbeat() external {
        if (plan.swept()) return;
        vm.prank(owner);
        plan.heartbeat();
        heartbeats++;
        // INV-1: after any owner heartbeat (pre-sweep), the staircase is back to Active.
        if (uint8(plan.stage()) != uint8(Stage.Active)) supremacyViolated = true;
    }

    function advance() external {
        uint8 before = uint8(plan.stage());
        try plan.advanceStage() {
            uint8 aft = uint8(plan.stage());
            // INV-2: advance never skips or regresses (staying put on the terminal sweep is fine).
            if (aft != before && aft != before + 1) monotonicityViolated = true;
            if (aft > maxStageSeen) maxStageSeen = aft;
            advances++;
        } catch {}
    }

    function doPayroll() external {
        bool due = block.number >= vault.nextPayrollBlock();
        bool funded = vault.payrollReserve() >= vault.payrollTotalPerPeriod();
        try vault.runPayroll() {
            payrolls++;
        } catch {
            // INV-6: a due, funded payroll must never fail — regardless of stage or freeze.
            if (due && funded) payrollFailedWhenFunded = true;
        }
    }

    function successorPay(uint256 who, uint256 amount) external {
        address actor = (who % 2 == 0) ? s1 : s2;
        amount = bound(amount, 1, 80_000e6);
        vm.prank(actor);
        try vault.successorPay(vendor, amount) {
            spends++;
        } catch {}
        // INV-5: recorded spend never exceeds either successor's rolling daily cap.
        if (vault.spentInWindow(s1) > 50_000e6) capViolated = true;
        if (vault.spentInWindow(s2) > 30_000e6) capViolated = true;
    }

    function guardianVote(uint256 g, bool freeze) external {
        vm.prank(guardians[g % 3]);
        try guardian.vote(freeze) {} catch {}
    }
}
