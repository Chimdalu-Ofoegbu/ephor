// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Stage, IContinuityVault} from "./interfaces/IEphor.sol";

/**
 * @title  SuccessionPlan
 * @notice The staircase brain: heartbeat registry + a monotonic, cancellable stage
 *         machine measured in BLOCK COUNTS (Arc timestamps repeat).
 *
 *         Invariants enforced here:
 *          - INV-1 owner-supremacy : `heartbeat()` resets any stage < Sweep-executed to Active.
 *          - INV-2 monotonicity    : stages advance Active→Notice→Handover→Sweep, one at a time;
 *                                     the only regression is cancel-to-Active via heartbeat.
 *          - INV-3 no early exec    : each advance requires the prior window to have lapsed, in blocks.
 *
 *         Advancement is PERMISSIONLESS once a window lapses (liveness without trusting the
 *         keeper). Cancellation is OWNER-ONLY. That asymmetry is the security model.
 */
contract SuccessionPlan is Ownable {
    // ── config ──
    uint64 public windowBlocks; // heartbeat window
    uint64[3] public challengeBlocks; // challenge windows for Notice, Handover, Sweep
    IContinuityVault public vault;
    address public guardian;

    // ── state ──
    Stage public stage;
    uint64 public lastHeartbeatBlock;
    uint64 public stageEnteredBlock;
    bool public swept;
    bool public frozen;

    // ── events ──
    event PlanCreated(address indexed owner, uint64 windowBlocks, uint64[3] challengeBlocks);
    event VaultLinked(address indexed vault);
    event GuardianLinked(address indexed guardian);
    event Heartbeat(address indexed owner, uint64 atBlock, uint64 deadlineBlock);
    event StageAdvanced(Stage indexed from, Stage indexed to, uint64 atBlock);
    event SuccessionCancelled(Stage indexed fromStage, uint64 atBlock);
    event SweepExecuted(uint64 atBlock);
    event Frozen(uint64 atBlock);
    event Unfrozen(uint64 atBlock);

    // ── errors ──
    error VaultAlreadySet();
    error VaultNotSet();
    error VaultNotReady();
    error ZeroAddress();
    error NotGuardian();
    error IsFrozen();
    error AlreadySwept();
    error WindowNotLapsed();
    error InvalidConfig();

    constructor(address owner_, uint64 windowBlocks_, uint64[3] memory challengeBlocks_) Ownable(owner_) {
        if (windowBlocks_ == 0) revert InvalidConfig();
        for (uint256 i = 0; i < 3; ++i) {
            if (challengeBlocks_[i] == 0) revert InvalidConfig();
        }
        windowBlocks = windowBlocks_;
        challengeBlocks = challengeBlocks_;
        lastHeartbeatBlock = uint64(block.number);
        stage = Stage.Active;
        emit PlanCreated(owner_, windowBlocks_, challengeBlocks_);
    }

    // ── linking ──
    function setVault(address vault_) external onlyOwner {
        if (address(vault) != address(0)) revert VaultAlreadySet();
        if (vault_ == address(0)) revert ZeroAddress();
        vault = IContinuityVault(vault_);
        emit VaultLinked(vault_);
    }

    /// @notice Set (or replace) the guardian contract. address(0) disables the veto.
    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianLinked(guardian_);
    }

    // ── heartbeat / owner-supremacy (INV-1) ──

    /// @notice "I'm here." Refreshes the window and rewinds any active stage to Active
    ///         (unless the final sweep already executed). The owner's live key always wins.
    function heartbeat() external onlyOwner {
        _heartbeat();
    }

    /// @notice Explicit alias for the UI's master CANCEL action.
    function cancel() external onlyOwner {
        _heartbeat();
    }

    function _heartbeat() internal {
        if (swept) revert AlreadySwept();
        Stage from = stage;
        lastHeartbeatBlock = uint64(block.number);
        if (from != Stage.Active) {
            stage = Stage.Active;
            stageEnteredBlock = 0;
            emit SuccessionCancelled(from, uint64(block.number));
        }
        emit Heartbeat(owner(), uint64(block.number), uint64(block.number) + windowBlocks);
    }

    // ── permissionless advancement (INV-2, INV-3) ──

    /// @notice Advance the staircase by exactly one step, iff the current window has lapsed.
    ///         Anyone may call. Entering Sweep does not settle; a final challenge window must
    ///         lapse before the terminal `executeContinuitySettlement()` fires.
    function advanceStage() external {
        if (frozen) revert IsFrozen();
        if (swept) revert AlreadySwept();
        if (address(vault) == address(0)) revert VaultNotSet();

        Stage from = stage;
        if (from == Stage.Active) {
            if (block.number <= uint256(lastHeartbeatBlock) + windowBlocks) revert WindowNotLapsed();
            // Don't arm succession before the vault's policy is finalized — otherwise the
            // terminal sweep would revert ConfigNotLocked and dead-end (L-4).
            if (!vault.configLocked()) revert VaultNotReady();
            _enter(Stage.Notice, Stage.Active);
        } else if (from == Stage.Notice) {
            if (block.number < uint256(stageEnteredBlock) + challengeBlocks[0]) revert WindowNotLapsed();
            _enter(Stage.Handover, Stage.Notice);
        } else if (from == Stage.Handover) {
            if (block.number < uint256(stageEnteredBlock) + challengeBlocks[1]) revert WindowNotLapsed();
            _enter(Stage.Sweep, Stage.Handover);
        } else {
            // from == Sweep, not yet settled: final challenge window, then the terminal sweep.
            if (block.number < uint256(stageEnteredBlock) + challengeBlocks[2]) revert WindowNotLapsed();
            swept = true; // effect before interaction (CEI); also blocks re-entry via AlreadySwept
            emit SweepExecuted(uint64(block.number));
            vault.executeContinuitySettlement();
        }
    }

    function _enter(Stage to, Stage from) internal {
        stage = to;
        stageEnteredBlock = uint64(block.number);
        emit StageAdvanced(from, to, uint64(block.number));
    }

    // ── guardian veto ──
    function freeze() external {
        if (msg.sender != guardian) revert NotGuardian();
        frozen = true;
        emit Frozen(uint64(block.number));
    }

    function unfreeze() external {
        if (msg.sender != guardian) revert NotGuardian();
        frozen = false;
        emit Unfrozen(uint64(block.number));
    }

    // ── views ──
    function deadlineBlock() external view returns (uint64) {
        return lastHeartbeatBlock + windowBlocks;
    }

    function isOverdue() external view returns (bool) {
        return block.number > uint256(lastHeartbeatBlock) + windowBlocks;
    }

    /// @notice Block at/after which the current stage's next advance becomes callable.
    function nextAdvanceBlock() external view returns (uint256) {
        if (stage == Stage.Active) {
            return uint256(lastHeartbeatBlock) + windowBlocks + 1;
        }
        uint256 idx = uint256(uint8(stage)) - 1; // Notice→0, Handover→1, Sweep→2
        return uint256(stageEnteredBlock) + challengeBlocks[idx];
    }
}
