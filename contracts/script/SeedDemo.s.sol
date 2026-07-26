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
 * Usage: set VAULT_ADDRESS, USDC_ADDRESS, SUCCESSOR_1, SUCCESSOR_2, VENDOR in .env, then
 *   forge script script/SeedDemo.s.sol --rpc-url arc_testnet --broadcast
 */
contract SeedDemo is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        ContinuityVault vault = ContinuityVault(vm.envAddress("VAULT_ADDRESS"));
        IERC20 usdc = IERC20(vm.envAddress("USDC_ADDRESS"));

        address s1 = vm.envAddress("SUCCESSOR_1");
        address s2 = vm.envAddress("SUCCESSOR_2");
        address vendor = vm.envAddress("VENDOR");

        // Demo payee: the deployer stands in for the team so the seed needs no extra funded wallets.
        // In production, configure the real team via env-driven payees.
        uint256 payPerPeriod = vm.envOr("SEED_PAYROLL_PER_PERIOD", uint256(40_000e6));
        uint256 reserve = vm.envOr("SEED_RESERVE", uint256(240_000e6));
        uint256 distributable = vm.envOr("SEED_DISTRIBUTABLE", uint256(260_000e6));

        vm.startBroadcast(pk);

        ContinuityVault.Payee[] memory payees = new ContinuityVault.Payee[](1);
        payees[0] = ContinuityVault.Payee(deployer, payPerPeriod);
        vault.configurePayroll(payees, 0);

        address[] memory allow1 = new address[](2);
        allow1[0] = vendor;
        allow1[1] = deployer;
        vault.addSuccessor(s1, 25_000e6, 50_000e6, 3000, allow1); // 30%

        address[] memory allow2 = new address[](1);
        allow2[0] = vendor;
        vault.addSuccessor(s2, 15_000e6, 30_000e6, 2000, allow2); // 20%

        ContinuityVault.Allocation[] memory allocs = new ContinuityVault.Allocation[](2);
        allocs[0] = ContinuityVault.Allocation(address(vault), 3000); // reserve top-up 30%
        allocs[1] = ContinuityVault.Allocation(address(vault), 2000); // USYC residual park 20%
        vault.setAllocations(allocs);

        vault.lockConfig();

        usdc.approve(address(vault), reserve + distributable);
        vault.fundPayrollReserve(reserve);
        vault.depositFunds(distributable);

        vm.stopBroadcast();

        console2.log("Seeded vault:", address(vault));
        console2.log("Reserve     :", reserve);
        console2.log("Distributable:", distributable);
    }
}
