pragma solidity ^0.4.23;

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

contract Hub is Ownable{
    mapping(bytes32 => address) contractAddress;
    mapping(address => bool) contractList;

    event ContractsChanged();

    function setContractAddress(string contractName, address newContractAddress)
    public onlyOwner {
        bytes32 index = keccak256(abi.encodePacked(contractName));

        if(contractAddress[index] != address(0)) {
            address oldContractAddress = contractAddress[index];
            contractList[oldContractAddress] = false;
        }
        contractAddress[index] = newContractAddress;

        if(newContractAddress != address(0)){
            contractList[newContractAddress] = true;
        }

        emit ContractsChanged();
    }

    function getContractAddress(string contractName)  public view returns(address selectedContractAddress) {
        bytes32 index = keccak256(abi.encodePacked(contractName));
        return contractAddress[index];
    }
    
    function isContract(address selectedContractAddress) public view returns (bool) {
        return contractList[selectedContractAddress];
    }

    /**
    * @dev Legacy function for getting token contract address
    */
    function tokenAddress() public view returns(address) {
        return getContractAddress("Token");
    }
}

