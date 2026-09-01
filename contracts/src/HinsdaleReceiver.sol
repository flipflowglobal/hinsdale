// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

/// @title  HinsdaleReceiver
/// @notice Deterministic (CREATE2) payment sink for the Hinsdale toolchain.
///         Accepts native value and ERC-20 tokens; only the owner may withdraw.
/// @dev    Design constraints, all of them checked by `hinsdale-cli --security-only`
///         against this contract's own deployed runtime bytecode:
///           * no SELFDESTRUCT, no DELEGATECALL, no tx.origin authentication
///           * every external CALL return value is checked
///           * state is written before value leaves the contract (CEI)
///           * `receive()` has an empty body so it stays inside the 2300 gas
///             stipend used by `address.transfer()` / `address.send()`
contract HinsdaleReceiver {
    /// @notice Current owner; the only account able to move funds out.
    address public owner;
    /// @notice Nominated owner, pending acceptance (two-step handover).
    address public pendingOwner;

    /// @dev Non-zero while a withdrawal is executing. 1 = idle, 2 = entered.
    uint256 private _lock = 1;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NativeTransferFailed();
    error TokenTransferFailed();
    error Reentrancy();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param initialOwner Account that may withdraw. Baked into the init code,
    ///        so the CREATE2 address is bound to this owner.
    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Bare native transfers. Intentionally empty — see contract docs.
    receive() external payable {}

    /// @notice Deposit native value and emit an attributable event.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw `amount` wei to `to`.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = address(this).balance;
        if (amount > available) revert InsufficientBalance(amount, available);

        // Effect before interaction: the event and the reentrancy latch are
        // both settled before control leaves this frame.
        emit Withdrawn(to, amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    /// @notice Withdraw the entire native balance to `to`.
    function withdrawAll(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        uint256 amount = address(this).balance;
        if (amount == 0) revert ZeroAmount();

        emit Withdrawn(to, amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    /// @notice Withdraw ERC-20 `token`. Tolerates non-standard tokens that
    ///         return no data (USDT) as well as those returning a bool.
    function withdrawToken(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        emit TokenWithdrawn(token, to, amount);

        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount) // transfer(address,uint256)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    /// @notice Step 1 of ownership handover. Pass address(0) to cancel.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step 2 of ownership handover, called by the nominee.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();

        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);

        emit OwnershipTransferred(previous, msg.sender);
    }

    /// @notice Native balance held by this receiver.
    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
