// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {ContinuityVault} from "../../src/ContinuityVault.sol";
import {SuccessionPlan} from "../../src/SuccessionPlan.sol";
import {Guardian2of3} from "../../src/Guardian2of3.sol";
import {Stage} from "../../src/interfaces/IEphor.sol";

/// @dev Deploys and wires the full Ephor system for the demo company "Helios Robotics",
///      matching the fixtures in packages/shared. Shared by every unit/fuzz suite.
abstract contract EphorBase is Test {
    MockERC20 internal usdc;
    SuccessionPlan internal plan;
    ContinuityVault internal vault;
    Guardian2of3 internal guardian;

    address internal owner = makeAddr("owner");
    address internal s1 = makeAddr("successor1");
    address internal s2 = makeAddr("successor2");
    address internal vendor = makeAddr("vendor");
    address internal g1 = makeAddr("guardian1");
    address internal g2 = makeAddr("guardian2");
    address internal g3 = makeAddr("guardian3");
    address internal keeper = makeAddr("keeper");
    address[5] internal team;

    uint64 internal constant WINDOW = 100;
    uint64 internal constant C1 = 50; // Notice challenge
    uint64 internal constant C2 = 50; // Handover challenge
    uint64 internal constant C3 = 20; // Sweep final challenge
    uint64 internal constant PERIOD = 60;
    uint64 internal constant DAILY_WINDOW = 100;

    uint256 internal constant TREASURY = 500_000e6;
    uint256 internal constant RESERVE = 240_000e6;
    uint256 internal constant DISTRIBUTABLE = 260_000e6;

    function u(uint256 x) internal pure returns (uint256) {
        return x * 1e6;
    }

    function setUp() public virtual {
        vm.roll(1000);
        team[0] = makeAddr("t1");
        team[1] = makeAddr("t2");
        team[2] = makeAddr("t3");
        team[3] = makeAddr("t4");
        team[4] = makeAddr("t5");

        usdc = new MockERC20("USD Coin", "USDC", 6);

        uint64[3] memory ch = [C1, C2, C3];
        plan = new SuccessionPlan(owner, WINDOW, ch);
        vault = new ContinuityVault(owner, usdc, PERIOD, DAILY_WINDOW);
        guardian = new Guardian2of3([g1, g2, g3], address(plan));

        vm.startPrank(owner);
        plan.setVault(address(vault));
        plan.setGuardian(address(guardian));
        vault.setPlan(address(plan));

        ContinuityVault.Payee[] memory payees = new ContinuityVault.Payee[](5);
        payees[0] = ContinuityVault.Payee(team[0], u(10_000));
        payees[1] = ContinuityVault.Payee(team[1], u(9_000));
        payees[2] = ContinuityVault.Payee(team[2], u(8_000));
        payees[3] = ContinuityVault.Payee(team[3], u(7_000));
        payees[4] = ContinuityVault.Payee(team[4], u(6_000));
        vault.configurePayroll(payees, 0);

        address[] memory allow1 = new address[](6);
        allow1[0] = vendor;
        allow1[1] = team[0];
        allow1[2] = team[1];
        allow1[3] = team[2];
        allow1[4] = team[3];
        allow1[5] = team[4];
        vault.addSuccessor(s1, u(25_000), u(50_000), 3000, allow1);

        address[] memory allow2 = new address[](1);
        allow2[0] = vendor;
        vault.addSuccessor(s2, u(15_000), u(30_000), 2000, allow2);

        ContinuityVault.Allocation[] memory allocs = new ContinuityVault.Allocation[](4);
        allocs[0] = ContinuityVault.Allocation(address(vault), 2000); // payroll reserve top-up
        allocs[1] = ContinuityVault.Allocation(s1, 1500); // EURC buffer (leg in Phase 3)
        allocs[2] = ContinuityVault.Allocation(s2, 1000); // Base Sepolia (leg in Phase 3)
        allocs[3] = ContinuityVault.Allocation(address(vault), 500); // USYC residual park
        vault.setAllocations(allocs);

        vault.lockConfig();
        vm.stopPrank();

        usdc.mint(owner, TREASURY);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fundPayrollReserve(RESERVE);
        vault.depositFunds(DISTRIBUTABLE);
        vm.stopPrank();
    }

    // ── staircase movers ──
    function _advanceToNotice() internal {
        vm.roll(block.number + WINDOW + 1);
        plan.advanceStage();
    }

    function _advanceToHandover() internal {
        _advanceToNotice();
        vm.roll(block.number + C1);
        plan.advanceStage();
    }

    function _advanceToSweepEntered() internal {
        _advanceToHandover();
        vm.roll(block.number + C2);
        plan.advanceStage();
    }

    function _executeSweep() internal {
        _advanceToSweepEntered();
        vm.roll(block.number + C3);
        plan.advanceStage();
    }
}
