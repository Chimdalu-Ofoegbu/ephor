// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only 6-dec ERC-20 (mirrors USDC's decimals on Arc). Includes an optional
///      blocklist to simulate USDC-style transfer reverts for pull-over-push testing.
contract MockERC20 is ERC20 {
    uint8 private immutable _dec;
    mapping(address => bool) public blocked;

    constructor(string memory name_, string memory symbol_, uint8 dec_) ERC20(name_, symbol_) {
        _dec = dec_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "ERC20: blocked");
        super._update(from, to, value);
    }
}
