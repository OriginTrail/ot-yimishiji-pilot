pragma solidity 0.4.25;

// Use only for testing reasons

import "./ERC677TransferReceiver.sol";
import "./TracToken.sol";

contract XDAITestTrac is TracToken {
    string public constant symbol = 'TXTRAC';

    event Transfer(address indexed from, address indexed to, uint256 value, bytes data);

    constructor(
        address _initialAccount,
        uint256 _initialBalance
    ) TracToken(_initialAccount, _initialAccount, _initialAccount) public {
        mint(_initialAccount, _initialBalance);
    }

    /**
     * ERC-677's only method implementation
     * See https://github.com/ethereum/EIPs/issues/677 for details
     */
    function transferAndCall(address _to, uint _value, bytes memory _data) public returns (bool) {
        bool result = super.transfer(_to, _value);
        if (!result) return false;

        emit Transfer(msg.sender, _to, _value, _data);

        ERC677TransferReceiver receiver = ERC677TransferReceiver(_to);
        receiver.tokenFallback(msg.sender, _value, _data);

        // IMPORTANT: the ERC-677 specification does not say
        // anything about the use of the receiver contract's
        // tokenFallback method return value. Given
        // its return type matches with this method's return
        // type, returning it could be a possibility.
        // We here take the more conservative approach and
        // ignore the return value, returning true
        // to signal a succesful transfer despite tokenFallback's
        // return value -- fact being tokens are transferred
        // in any case.
        return true;
    }
}