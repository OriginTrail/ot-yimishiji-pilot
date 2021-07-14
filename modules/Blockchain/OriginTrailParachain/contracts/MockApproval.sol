pragma solidity ^0.4.24;

/**
* @title Ownable
* @dev The Ownable contract has an owner address, and provides basic authorization control
* functions, this simplifies the implementation of "user permissions".
*/
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
    * @dev The Ownable constructor sets the original `owner` of the contract to the sender
    * account.
    */
    constructor () public {
        owner = msg.sender;
    }

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can call this function");
        _;
    }

    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param newOwner The address to transfer ownership to.
    */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

}

contract MockApproval is Ownable{
    bytes20[] public allNodes;
    bool[] public hasApproval;
    mapping (bytes20 => bool) public nodeApproved;
    mapping (address => bool) public identityApproved;

    event NodeApproved(bytes20 nodeId);
    event NodeRemoved(bytes20 nodeId);

    function identityHasApproval(address identity)
    public pure returns(bool) {
        return true;
    }

    function nodeHasApproval(bytes20 nodeId)
    public pure returns(bool) {
        return true;
    }

    function getAllNodes() public view returns(bytes20[]){
        return allNodes;
    }

    function getNodeStatuses() public view returns(bool[]){
        return hasApproval;
    }
    
    function approve(address identity, bytes20 nodeId) 
    public onlyOwner {
    }

    function removeApproval(address identity, bytes20 nodeId) 
    public onlyOwner {
    }

    function setIdentityApproval(address identity, bool newApproval) 
    public onlyOwner {
    }
}