// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ContinuityVault} from "../src/ContinuityVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SeedDemo
 * @notice Configures a deployed ContinuityVault as the demo company "Helios Robotics"
 *         and funds it from the deployer's USDC. Splits sum to 100% (10_000 bps).
 *
 *         Amounts and caps are env-overridable (SEED_*) so one script seeds both a
 *         faucet-limited testnet (a few USDC) and a production-scale config. Config is
 *         split across helpers to stay under Solidity's local-variable stack limit.
 *
 * Usage: set VAULT_ADDRESS, USDC_ADDRESS, SUCCESSOR_1, SUCCESSOR_2, VENDOR in .env, then
 *   forge script script/SeedDemo.s.sol --rpc-url arc_testnet --broadcast
 */
contract SeedDemo is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        ContinuityVault vault = ContinuityVault(vm.envAddress("VAULT_ADDRESS"));
        IERC20 usdc = IERC20(vm.envAddress("USDC_ADDRESS"));
        uint256 reserve = vm.envOr("SEED_RESERVE", uint256(240_000e6));
        uint256 distributable = vm.envOr("SEED_DISTRIBUTABLE", uint256(260_000e6));

        vm.startBroadcast(pk);
        _configurePayroll(vault, deployer);
        _addSuccessors(vault, deployer);
        _setAllocationsAndLock(vault);
        usdc.approve(address(vault), reserve + distributable);
        vault.fundPayrollReserve(reserve);
        vault.depositFunds(distributable);
        vm.stopBroadcast();

        console2.log("Seeded vault :", address(vault));
        console2.log("Reserve      :", reserve);
        console2.log("Distributable:", distributable);
    }

    /// @dev One payee (the deployer stands in for the team) so the seed needs no extra funded wallets.
    ///      In production, configure the real team via env-driven payees.
    function _configurePayroll(ContinuityVault vault, address deployer) internal {
        ContinuityVault.Payee[] memory payees = new ContinuityVault.Payee[](1);
        payees[0] = ContinuityVault.Payee(deployer, vm.envOr("SEED_PAYROLL_PER_PERIOD", uint256(40_000e6)));
        vault.configurePayroll(payees, 0);
    }

    function _addSuccessors(ContinuityVault vault, address deployer) internal {
        address vendor = vm.envAddress("VENDOR");

        address[] memory allow1 = new address[](2);
        allow1[0] = vendor;
        allow1[1] = deployer;
        vault.addSuccessor(
            vm.envAddress("SUCCESSOR_1"),
            vm.envOr("SEED_S1_PERTX", uint256(25_000e6)),
            vm.envOr("SEED_S1_DAILY", uint256(50_000e6)),
            3000, // 30%
            allow1
        );

        address[] memory allow2 = new address[](1);
        allow2[0] = vendor;
        vault.addSuccessor(
            vm.envAddress("SUCCESSOR_2"),
            vm.envOr("SEED_S2_PERTX", uint256(15_000e6)),
            vm.envOr("SEED_S2_DAILY", uint256(30_000e6)),
            2000, // 20%
            allow2
        );
    }

    function _setAllocationsAndLock(ContinuityVault vault) internal {
        ContinuityVault.Allocation[] memory allocs = new ContinuityVault.Allocation[](2);
        allocs[0] = ContinuityVault.Allocation(address(vault), 3000); // reserve top-up 30%
        allocs[1] = ContinuityVault.Allocation(address(vault), 2000); // residual park 20%
        vault.setAllocations(allocs);
        vault.lockConfig();
    }
}
