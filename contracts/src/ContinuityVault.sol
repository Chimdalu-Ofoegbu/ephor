// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Stage, ISuccessionPlan} from "./interfaces/IEphor.sol";

/**
 * @title  ContinuityVault
 * @notice Holds the treasury and enforces, in the vault (never in the UI):
 *          - INV-4 split conservation : the stage-3 sweep distributes EXACTLY 100% of the
 *                                       distributable balance (dust remainder to the last recipient).
 *          - INV-5 cap safety         : a stage-2 successor spends ≤ per-tx AND ≤ rolling-daily caps,
 *                                       to allowlisted payees only.
 *          - INV-6 payroll continuity : reserve-funded payroll pulls succeed regardless of stage
 *                                       or guardian freeze.
 *
 *         Security posture: CEI, `nonReentrant` on every value-moving function, SafeERC20,
 *         custom errors, events on every transition, 6-dec accounting, bounded payroll batch.
 *
 *         Stage-3 conversion / cross-chain / yield legs (Swap, CCTP, USYC) are layered on in a
 *         later phase; the base splits + receipts are here and are conservation-exact.
 */
contract ContinuityVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PAYROLL_BATCH = 10;

    struct Payee {
        address wallet;
        uint256 amountPerPeriod;
    }

    struct Successor {
        address wallet;
        uint256 perTxCap;
        uint256 dailyCap;
        uint16 splitBps;
    }

    struct Allocation {
        address recipient; // address(this) == payroll reserve top-up (kept in vault)
        uint16 bps;
    }

    ISuccessionPlan public plan;
    IERC20 public immutable payrollAsset; // 6-dec settlement asset (USDC)

    // payroll
    uint64 public payrollPeriodBlocks;
    uint64 public nextPayrollBlock;
    uint256 public payrollReserve; // earmarked; excluded from the sweep's distributable balance
    Payee[] public payroll;

    // successors + caps
    Successor[] public successors;
    mapping(address => uint256) public successorIndexPlus1; // 0 => not a successor
    mapping(address => bool) public allowlistedPayee;

    // rolling daily-cap accounting (tumbling window, measured in blocks)
    uint64 public dailyWindowBlocks;
    mapping(address => uint256) public spentInWindow;
    mapping(address => uint64) public windowStartBlock;

    // stage-3 allocations (beneficiaries). Σ successor.splitBps + Σ allocation.bps == 10_000.
    Allocation[] public allocations;

    bool public configLocked;

    // ── events ──
    event PlanLinked(address indexed plan);
    event Deposited(address indexed from, uint256 amount);
    event PayrollConfigured(uint256 payeeCount, uint64 periodBlocks, uint64 firstRunBlock);
    event SuccessorAdded(address indexed wallet, uint256 perTxCap, uint256 dailyCap, uint16 splitBps);
    event AllocationsSet(uint256 count);
    event ConfigLocked(uint256 totalSplitBps);
    event PayrollReserveFunded(address indexed from, uint256 amount, uint256 reserve);
    event PayrollReserveReleased(uint256 amount, uint256 reserve);
    event PayrollRun(uint256 total, uint256 payeeCount, uint64 nextRunBlock);
    event PayrollPaid(address indexed payee, uint256 amount, uint64 atBlock);
    event SuccessorSpend(address indexed successor, address indexed payee, uint256 amount);
    event Split(address indexed recipient, uint256 amount, bool reserveTopUp);
    event ContinuitySettlementExecuted(uint256 distributable, uint64 atBlock);
    event OwnerWithdraw(address indexed token, address indexed to, uint256 amount);

    // ── errors ──
    error ZeroAddress();
    error PlanAlreadySet();
    error ConfigIsLocked();
    error ConfigNotLocked();
    error NotPlan();
    error NotSuccessor();
    error HandoverNotActive();
    error IsFrozen();
    error PayeeNotAllowlisted();
    error PerTxCapExceeded();
    error DailyCapExceeded();
    error PayrollNotDue();
    error PayrollBatchTooLarge();
    error ReserveInsufficient();
    error ExceedsDistributable();
    error InvalidSplits(uint256 totalBps);
    error EmptyConfig();

    constructor(address owner_, IERC20 payrollAsset_, uint64 payrollPeriodBlocks_, uint64 dailyWindowBlocks_)
        Ownable(owner_)
    {
        if (address(payrollAsset_) == address(0)) revert ZeroAddress();
        if (payrollPeriodBlocks_ == 0 || dailyWindowBlocks_ == 0) revert EmptyConfig();
        payrollAsset = payrollAsset_;
        payrollPeriodBlocks = payrollPeriodBlocks_;
        dailyWindowBlocks = dailyWindowBlocks_;
    }

    modifier notLocked() {
        if (configLocked) revert ConfigIsLocked();
        _;
    }

    // ── linking ──
    function setPlan(address plan_) external onlyOwner {
        if (address(plan) != address(0)) revert PlanAlreadySet();
        if (plan_ == address(0)) revert ZeroAddress();
        plan = ISuccessionPlan(plan_);
        emit PlanLinked(plan_);
    }

    // ── configuration (owner, pre-lock) ──
    function configurePayroll(Payee[] calldata payees, uint64 firstRunBlock) external onlyOwner notLocked {
        if (payees.length == 0) revert EmptyConfig();
        if (payees.length > MAX_PAYROLL_BATCH) revert PayrollBatchTooLarge();
        delete payroll;
        for (uint256 i = 0; i < payees.length; ++i) {
            if (payees[i].wallet == address(0)) revert ZeroAddress();
            payroll.push(payees[i]);
        }
        nextPayrollBlock = firstRunBlock == 0 ? uint64(block.number) + payrollPeriodBlocks : firstRunBlock;
        emit PayrollConfigured(payees.length, payrollPeriodBlocks, nextPayrollBlock);
    }

    function addSuccessor(
        address wallet,
        uint256 perTxCap,
        uint256 dailyCap,
        uint16 splitBps,
        address[] calldata allowlist
    ) external onlyOwner notLocked {
        if (wallet == address(0)) revert ZeroAddress();
        successors.push(Successor({wallet: wallet, perTxCap: perTxCap, dailyCap: dailyCap, splitBps: splitBps}));
        successorIndexPlus1[wallet] = successors.length; // index + 1
        for (uint256 i = 0; i < allowlist.length; ++i) {
            allowlistedPayee[allowlist[i]] = true;
        }
        emit SuccessorAdded(wallet, perTxCap, dailyCap, splitBps);
    }

    function setAllocations(Allocation[] calldata allocs) external onlyOwner notLocked {
        delete allocations;
        for (uint256 i = 0; i < allocs.length; ++i) {
            if (allocs[i].recipient == address(0)) revert ZeroAddress();
            allocations.push(allocs[i]);
        }
        emit AllocationsSet(allocs.length);
    }

    /// @notice Freeze the split configuration. Requires Σ splitBps + Σ allocation bps == 10_000
    ///         (the precondition for split conservation).
    function lockConfig() external onlyOwner notLocked {
        uint256 total;
        for (uint256 i = 0; i < successors.length; ++i) {
            total += successors[i].splitBps;
        }
        for (uint256 i = 0; i < allocations.length; ++i) {
            total += allocations[i].bps;
        }
        if (total != BPS_DENOMINATOR) revert InvalidSplits(total);
        configLocked = true;
        emit ConfigLocked(total);
    }

    // ── funding ──
    /// @notice Deposit into the distributable pool (owner approves first).
    function depositFunds(uint256 amount) external nonReentrant {
        payrollAsset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Deposit AND earmark as payroll reserve (owner approves first).
    function fundPayrollReserve(uint256 amount) external nonReentrant {
        payrollAsset.safeTransferFrom(msg.sender, address(this), amount);
        payrollReserve += amount;
        emit PayrollReserveFunded(msg.sender, amount, payrollReserve);
    }

    // ── payroll continuity (INV-6) ──
    /// @notice Pull one payroll period. Permissionless (keeper-driven). Succeeds regardless of
    ///         stage or guardian freeze, as long as the reserve is funded.
    function runPayroll() external nonReentrant {
        uint256 len = payroll.length;
        if (len == 0) revert EmptyConfig();
        if (block.number < nextPayrollBlock) revert PayrollNotDue();
        if (len > MAX_PAYROLL_BATCH) revert PayrollBatchTooLarge();

        uint256 total;
        for (uint256 i = 0; i < len; ++i) {
            total += payroll[i].amountPerPeriod;
        }
        if (payrollReserve < total) revert ReserveInsufficient();

        // effects before interactions (CEI)
        payrollReserve -= total;
        nextPayrollBlock += payrollPeriodBlocks;
        emit PayrollRun(total, len, nextPayrollBlock);

        for (uint256 i = 0; i < len; ++i) {
            Payee memory p = payroll[i];
            payrollAsset.safeTransfer(p.wallet, p.amountPerPeriod);
            emit PayrollPaid(p.wallet, p.amountPerPeriod, uint64(block.number));
        }
    }

    // ── capped successor spend (INV-5) ──
    /// @notice A stage-2 successor pays an allowlisted payee, within per-tx and rolling-daily caps.
    function successorPay(address payee, uint256 amount) external nonReentrant {
        uint256 idxPlus1 = successorIndexPlus1[msg.sender];
        if (idxPlus1 == 0) revert NotSuccessor();
        if (uint8(plan.stage()) < uint8(Stage.Handover)) revert HandoverNotActive();
        if (plan.frozen()) revert IsFrozen();
        if (!allowlistedPayee[payee]) revert PayeeNotAllowlisted();

        Successor memory s = successors[idxPlus1 - 1];
        if (amount > s.perTxCap) revert PerTxCapExceeded();

        // tumbling daily window
        uint256 spent = spentInWindow[msg.sender];
        if (block.number >= uint256(windowStartBlock[msg.sender]) + dailyWindowBlocks) {
            windowStartBlock[msg.sender] = uint64(block.number);
            spent = 0;
        }
        uint256 newSpent = spent + amount;
        if (newSpent > s.dailyCap) revert DailyCapExceeded();

        // A successor spends operating funds only — never the earmarked payroll reserve.
        // This is what makes payroll continuity (INV-6) hold under a hostile successor.
        if (payrollAsset.balanceOf(address(this)) < payrollReserve + amount) revert ExceedsDistributable();

        spentInWindow[msg.sender] = newSpent; // effect before interaction
        payrollAsset.safeTransfer(payee, amount);
        emit SuccessorSpend(msg.sender, payee, amount);
    }

    // ── terminal settlement (INV-4) ──
    /// @notice Distribute EXACTLY the distributable balance across successors and allocations.
    ///         Only the plan can call this, and only after the final challenge window lapses.
    function executeContinuitySettlement() external nonReentrant {
        if (msg.sender != address(plan)) revert NotPlan();
        if (!configLocked) revert ConfigNotLocked();

        uint256 bal = payrollAsset.balanceOf(address(this));
        uint256 dist = bal > payrollReserve ? bal - payrollReserve : 0;
        emit ContinuitySettlementExecuted(dist, uint64(block.number));
        if (dist == 0) return;

        uint256 itemCount = successors.length + allocations.length;
        uint256 distributed;
        uint256 idx;

        for (uint256 i = 0; i < successors.length; ++i) {
            idx++;
            uint256 amount = idx == itemCount
                ? dist - distributed
                : (dist * successors[i].splitBps) / BPS_DENOMINATOR;
            distributed += amount;
            if (amount > 0) {
                payrollAsset.safeTransfer(successors[i].wallet, amount);
                emit Split(successors[i].wallet, amount, false);
            }
        }

        for (uint256 i = 0; i < allocations.length; ++i) {
            idx++;
            uint256 amount = idx == itemCount
                ? dist - distributed
                : (dist * allocations[i].bps) / BPS_DENOMINATOR;
            distributed += amount;
            if (amount == 0) continue;

            if (allocations[i].recipient == address(this)) {
                // payroll reserve top-up / residual park — kept in the vault, re-earmarked
                payrollReserve += amount;
                emit Split(address(this), amount, true);
            } else {
                payrollAsset.safeTransfer(allocations[i].recipient, amount);
                emit Split(allocations[i].recipient, amount, false);
            }
        }
    }

    // ── owner (supremacy over own funds) ──
    /// @notice Owner may move any funds — except the earmarked payroll reserve, which stays
    ///         protected for the team. To reclaim over-funded reserve, call `releaseReserve` first.
    function ownerWithdraw(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (address(token) == address(payrollAsset) && payrollAsset.balanceOf(address(this)) < payrollReserve + amount) {
            revert ExceedsDistributable();
        }
        token.safeTransfer(to, amount);
        emit OwnerWithdraw(address(token), to, amount);
    }

    /// @notice Owner intentionally un-earmarks reserve (e.g. it was over-funded), freeing it for withdrawal.
    function releaseReserve(uint256 amount) external onlyOwner {
        if (amount > payrollReserve) revert ReserveInsufficient();
        payrollReserve -= amount;
        emit PayrollReserveReleased(amount, payrollReserve);
    }

    // ── views ──
    function distributable() external view returns (uint256) {
        uint256 bal = payrollAsset.balanceOf(address(this));
        return bal > payrollReserve ? bal - payrollReserve : 0;
    }

    function successorCount() external view returns (uint256) {
        return successors.length;
    }

    function payrollCount() external view returns (uint256) {
        return payroll.length;
    }

    function allocationCount() external view returns (uint256) {
        return allocations.length;
    }

    function payrollTotalPerPeriod() external view returns (uint256 total) {
        for (uint256 i = 0; i < payroll.length; ++i) {
            total += payroll[i].amountPerPeriod;
        }
    }
}
