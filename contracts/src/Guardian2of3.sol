// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPlanFreezable} from "./interfaces/IEphor.sol";

/**
 * @title  Guardian2of3
 * @notice A 2-of-3 veto multisig whose single power is to freeze / unfreeze the
 *         SuccessionPlan's staircase — the duress brake for a forced-silence or
 *         hostage attack, where an adversary jams the owner's check-ins to inherit
 *         the vault through the succession machinery.
 *
 *         Votes are scoped to a monotonically increasing `round`, so a confirmation
 *         can never carry across executed actions. Effects (advancing the round)
 *         precede the external freeze/unfreeze call (CEI).
 *
 *         Key-rotation / social-recovery authority is documented production hardening
 *         (docs/SECURITY.md) and is intentionally NOT built here.
 */
contract Guardian2of3 {
    uint8 public constant THRESHOLD = 2;

    address[3] public guardians;
    IPlanFreezable public immutable plan;

    /// @dev Increments after each executed action; votes are per-round.
    uint256 public round;
    mapping(uint256 => mapping(address => bool)) public confirmedInRound;
    mapping(uint256 => uint8) public voteCount;
    mapping(uint256 => bool) public desiredFreezeInRound;
    mapping(uint256 => bool) public roundInitialized;

    error NotGuardian();
    error DuplicateGuardian();
    error ZeroGuardian();
    error ZeroPlan();
    error AlreadyConfirmed();
    error ConflictingVote();

    event GuardianVote(address indexed guardian, bool freeze, uint256 indexed round, uint8 votes);
    event GuardianActionExecuted(bool freeze, uint256 indexed round);

    modifier onlyGuardian() {
        if (!_isGuardian(msg.sender)) revert NotGuardian();
        _;
    }

    constructor(address[3] memory _guardians, address _plan) {
        if (_plan == address(0)) revert ZeroPlan();
        for (uint256 i = 0; i < 3; ++i) {
            if (_guardians[i] == address(0)) revert ZeroGuardian();
            for (uint256 j = i + 1; j < 3; ++j) {
                if (_guardians[i] == _guardians[j]) revert DuplicateGuardian();
            }
        }
        guardians = _guardians;
        plan = IPlanFreezable(_plan);
    }

    /**
     * @notice Cast a guardian vote. `freeze = true` to engage the veto, `false` to lift it.
     *         The second matching vote in the current round executes the action and
     *         opens a fresh round.
     */
    function vote(bool freeze) external onlyGuardian {
        uint256 r = round;
        if (confirmedInRound[r][msg.sender]) revert AlreadyConfirmed();

        if (!roundInitialized[r]) {
            roundInitialized[r] = true;
            desiredFreezeInRound[r] = freeze;
        } else if (desiredFreezeInRound[r] != freeze) {
            revert ConflictingVote();
        }

        confirmedInRound[r][msg.sender] = true;
        uint8 votes = voteCount[r] + 1;
        voteCount[r] = votes;
        emit GuardianVote(msg.sender, freeze, r, votes);

        if (votes >= THRESHOLD) {
            round = r + 1; // effect before interaction (CEI)
            emit GuardianActionExecuted(freeze, r);
            if (freeze) {
                plan.freeze();
            } else {
                plan.unfreeze();
            }
        }
    }

    function isGuardian(address account) external view returns (bool) {
        return _isGuardian(account);
    }

    function _isGuardian(address account) internal view returns (bool) {
        return account == guardians[0] || account == guardians[1] || account == guardians[2];
    }
}
