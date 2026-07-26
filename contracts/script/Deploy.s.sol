// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ContinuityVault} from "../src/ContinuityVault.sol";
import {SuccessionPlan} from "../src/SuccessionPlan.sol";
import {Guardian2of3} from "../src/Guardian2of3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Deploy
 * @notice Deploys the Ephor core to Arc testnet, wires it, and records addresses.
 *
 * Usage (after filling .env and funding the deployer from the faucet):
 *   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify
 *
 * All windows are BLOCK COUNTS. Demo defaults are compressed; production would use
 * ~14 days of blocks for the heartbeat window.
 */
contract Deploy is Script {
    struct Cfg {
        uint256 pk;
        address usdc;
        uint64 windowBlocks;
        uint64 c1;
        uint64 c2;
        uint64 c3;
        uint64 period;
        uint64 dailyWindow;
        address g1;
        address g2;
        address g3;
    }

    function run() external {
        Cfg memory c = _cfg();
        address deployer = vm.addr(c.pk);

        vm.startBroadcast(c.pk);
        uint64[3] memory ch = [c.c1, c.c2, c.c3];
        SuccessionPlan plan = new SuccessionPlan(deployer, c.windowBlocks, ch);
        ContinuityVault vault = new ContinuityVault(deployer, IERC20(c.usdc), c.period, c.dailyWindow);
        plan.setVault(address(vault));
        vault.setPlan(address(plan));
        address guardianAddr = _maybeGuardian(c, address(plan));
        vm.stopBroadcast();

        _report(deployer, c.usdc, address(plan), address(vault), guardianAddr);
    }

    function _cfg() internal view returns (Cfg memory c) {
        c.pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        c.usdc = vm.envAddress("USDC_ADDRESS");
        c.windowBlocks = uint64(vm.envOr("WINDOW_BLOCKS", uint256(200)));
        c.c1 = uint64(vm.envOr("CHALLENGE_1_BLOCKS", uint256(100)));
        c.c2 = uint64(vm.envOr("CHALLENGE_2_BLOCKS", uint256(100)));
        c.c3 = uint64(vm.envOr("CHALLENGE_3_BLOCKS", uint256(50)));
        c.period = uint64(vm.envOr("PAYROLL_PERIOD_BLOCKS", uint256(120)));
        c.dailyWindow = uint64(vm.envOr("DAILY_WINDOW_BLOCKS", uint256(200)));
        c.g1 = vm.envOr("GUARDIAN_1", address(0));
        c.g2 = vm.envOr("GUARDIAN_2", address(0));
        c.g3 = vm.envOr("GUARDIAN_3", address(0));
    }

    function _maybeGuardian(Cfg memory c, address plan) internal returns (address) {
        if (c.g1 == address(0) || c.g2 == address(0) || c.g3 == address(0)) return address(0);
        Guardian2of3 guardian = new Guardian2of3([c.g1, c.g2, c.g3], plan);
        SuccessionPlan(plan).setGuardian(address(guardian));
        return address(guardian);
    }

    function _report(address deployer, address usdc, address plan, address vault, address guardian) internal {
        console2.log("== Ephor deployed on chain", block.chainid, "==");
        console2.log("Deployer       :", deployer);
        console2.log("USDC           :", usdc);
        console2.log("SuccessionPlan :", plan);
        console2.log("ContinuityVault:", vault);
        console2.log("Guardian2of3   :", guardian);

        string memory obj = "ephor";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "successionPlan", plan);
        vm.serializeAddress(obj, "continuityVault", vault);
        vm.serializeAddress(obj, "guardian2of3", guardian);
        string memory json = vm.serializeAddress(obj, "usdc", usdc);
        vm.writeJson(json, "./deployments/arc-testnet.json");
        console2.log("Wrote ./deployments/arc-testnet.json");
    }
}
