pragma solidity 0.4.25;

 /*
 * Contract interface for receivers of tokens that
 * comply with ERC-677.
 * See https://github.com/ethereum/EIPs/issues/677 for details.
 */
contract ERC677TransferReceiver {
    function tokenFallback(address from, uint256 amount, bytes data) external returns (bool);
}
