pragma solidity ^0.4.19;

contract ERC725 {
    enum PURPOSES {
        MANAGEMENT_KEY,
        ACTION_KEY,
        CLAIM_SIGNER_KEY,
        ENCRYPTION_KEY
    }

    struct Key {
        uint256[] purposes; //e.g., MANAGEMENT_KEY = 1, ACTION_KEY = 2, etc.
        uint256 keyType; // e.g. 1 = ECDSA, 2 = RSA, etc.
        bytes32 key;
    }

    uint256 public otVersion;

    // Events
    event KeyAdded(bytes32 indexed key, uint256[] purposes, uint256 indexed keyType);
    event KeyRemoved(bytes32 indexed key, uint256[] purposes, uint256 indexed keyType);
    event ExecutionRequested(uint256 indexed executionId, address indexed to, uint256 indexed value, bytes data);
    event Executed(uint256 indexed executionId, address indexed to, uint256 indexed value, bytes data);
    event Approved(uint256 indexed executionId, bool approved);

    // Setters
    function addKey(bytes32 _key, uint256[] _purposes, uint256 _type) external returns (bool success);
    function approve(uint256 _id, bool _approve) public returns (bool success);
    function execute(address _to, uint256 _value, bytes _data) public returns (uint256 executionId);
    function removeKey(bytes32 _key) external returns (bool success);
    // Getters
    function getKey(bytes32 _key) public view returns (uint256[] purposes, uint256 keyType, bytes32 key);
    function getKeyPurposes(bytes32 _key) public view returns (uint256[] purposes);
    function getKeysByPurpose(uint256 _purpose) public view returns (bytes32[] keys);
    function keyHasPurpose(bytes32 _key, uint256 _purpose) public view returns (bool result);
}