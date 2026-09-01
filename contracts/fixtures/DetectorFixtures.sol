// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

// ============================================================================
//  DETECTOR FIXTURES — DELIBERATELY VULNERABLE. NEVER DEPLOY TO A LIVE NETWORK.
//
//  Each contract below reproduces exactly one pattern that src/security.rs
//  claims to detect. They exist so `hinsdale-cli --security-only` can be
//  regression-tested against bytecode whose ground truth is known.
// ============================================================================

/// @dev Reentrancy: SSTORE after CALL, violating checks-effects-interactions.
contract ReentrantVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] = 0; // interaction happened first
    }
}

/// @dev Unchecked CALL return value (result is popped, never inspected).
contract UncheckedCall {
    function pay(address to, uint256 amount) external {
        to.call{value: amount}("");
    }
}

/// @dev tx.origin used for authentication.
contract TxOriginAuth {
    address public admin;

    constructor() {
        admin = msg.sender;
    }

    function drain(address to) external {
        require(tx.origin == admin, "not admin");
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok);
    }

    receive() external payable {}
}

/// @dev Arbitrary DELEGATECALL to a calldata-supplied address.
contract ArbitraryDelegate {
    function forward(address target, bytes calldata data) external {
        (bool ok, ) = target.delegatecall(data);
        require(ok);
    }
}

/// @dev Unguarded SELFDESTRUCT.
contract Destructible {
    function kill(address payable to) external {
        selfdestruct(to);
    }

    receive() external payable {}
}

/// @dev Block timestamp used as a decision input.
contract TimestampGate {
    uint256 public unlockAt;

    constructor(uint256 delay) {
        unlockAt = block.timestamp + delay;
    }

    function claim() external view returns (bool) {
        return block.timestamp >= unlockAt;
    }
}
