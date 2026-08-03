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

    // Pull-over-push escrow for the terminal settlement (M-1): a recipient that cannot receive
    // (e.g. a token blocklist) is credited here instead of bricking the whole sweep.
    mapping(address => uint256) public claimable;
    uint256 public totalClaimable;

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
    event SettlementEscrowed(address indexed recipient, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);

    // ── errors ──
    error ZeroAddress();
    error PlanAlreadySet();
    error ConfigIsLocked();
    error ConfigNotLocked();
    error NotPlan();
    error NotSuccessor();
    error AlreadySuccessor();
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
    error NothingToClaim();

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
        // A wallet added twice would receive a double settlement allocation (both entries pay out in
        // the sweep) while caps track only the last entry — reject re-adds outright.
        if (successorIndexPlus1[wallet] != 0) revert AlreadySuccessor();
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

        // Pull-over-push, identical to the terminal sweep (M-1): a payee that cannot receive (a token
        // blocklist, or a contract wallet that reverts) is escrowed to `claimable` instead of reverting
        // the whole batch. One bad payee can NEVER brick payroll for the rest of the team — INV-6 must
        // hold for the healthy payees even in the founder-gone state, where no owner exists to fix it.
        for (uint256 i = 0; i < len; ++i) {
            Payee memory p = payroll[i];
            if (_trySendOrEscrow(p.wallet, p.amountPerPeriod)) {
                emit PayrollPaid(p.wallet, p.amountPerPeriod, uint64(block.number));
            }
        }
    }

    // ── capped successor spend (INV-5) ──
    /// @notice A stage-2 successor pays an allowlisted payee, within per-tx and rolling-daily caps.
    function successorPay(address payee, uint256 amount) external nonReentrant {
        uint256 idxPlus1 = successorIndexPlus1[msg.sender];
        if (idxPlus1 == 0) revert NotSuccessor();
        // Stage 2 ONLY: the capped role opens at Handover and closes once the sweep window opens.
        if (plan.stage() != Stage.Handover) revert HandoverNotActive();
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

        // A successor spends operating funds only — never the earmarked payroll reserve or
        // escrowed settlement claims. This is what makes payroll continuity (INV-6) hold.
        if (payrollAsset.balanceOf(address(this)) < payrollReserve + totalClaimable + amount) {
            revert ExceedsDistributable();
        }

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

        uint256 dist = distributable();
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
                _deliver(successors[i].wallet, amount);
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
                _deliver(allocations[i].recipient, amount);
            }
        }
    }

    // ── settlement escrow (pull-over-push) ──
    /// @dev Try to push; on failure (e.g. a blocklisted recipient) escrow to a claimable ledger
    ///      so one bad recipient can never brick the whole settlement (M-1).
    function _deliver(address to, uint256 amount) internal {
        if (_trySendOrEscrow(to, amount)) emit Split(to, amount, false);
    }

    /// @dev Try to push `amount` of the settlement asset to `to`; on ANY failure (a blocklisted or
    ///      reverting recipient) credit it to the `claimable` escrow ledger instead of reverting.
    ///      Returns true iff the transfer was delivered. Shared by the terminal sweep and payroll so
    ///      that one unreceivable recipient can never brick either batch (M-1 / INV-6). Escrowed funds
    ///      join `totalClaimable`, which is already protected from successor spend and owner withdraw.
    function _trySendOrEscrow(address to, uint256 amount) internal returns (bool delivered) {
        (bool success, bytes memory data) =
            address(payrollAsset).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (success && (data.length == 0 || abi.decode(data, (bool)))) {
            return true;
        }
        claimable[to] += amount;
        totalClaimable += amount;
        emit SettlementEscrowed(to, amount);
        return false;
    }

    /// @notice Recipients pull any escrowed settlement funds owed to them.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        payrollAsset.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ── owner (supremacy over own funds) ──
    /// @notice Owner may move any funds — except the earmarked payroll reserve and escrowed
    ///         claims, which stay protected. To reclaim over-funded reserve, call `releaseReserve`.
    function ownerWithdraw(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (
            address(token) == address(payrollAsset)
                && payrollAsset.balanceOf(address(this)) < payrollReserve + totalClaimable + amount
        ) {
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
    function distributable() public view returns (uint256) {
        uint256 bal = payrollAsset.balanceOf(address(this));
        uint256 locked = payrollReserve + totalClaimable;
        return bal > locked ? bal - locked : 0;
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
