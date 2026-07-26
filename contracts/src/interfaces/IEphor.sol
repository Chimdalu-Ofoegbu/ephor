// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Stage of the succession staircase.
///  0 = Active (owner live) · 1 = Notice · 2 = Handover · 3 = Sweep (final).
enum Stage {
    Active,
    Notice,
    Handover,
    Sweep
}

/// @notice Minimal view surface of the SuccessionPlan that the vault and guardian read.
interface ISuccessionPlan {
    function owner() external view returns (address);
    function stage() external view returns (Stage);
    function swept() external view returns (bool);
    function frozen() external view returns (bool);
}

/// @notice Freeze controls the guardian holds over the plan (duress brake).
interface IPlanFreezable {
    function freeze() external;
    function unfreeze() external;
}

/// @notice The vault surface the plan invokes to execute the final settlement.
interface IContinuityVault {
    function owner() external view returns (address);
    function configLocked() external view returns (bool);
    function executeContinuitySettlement() external;
}
