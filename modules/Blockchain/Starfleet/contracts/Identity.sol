pragma solidity ^0.4.18;

import './ByteArr.sol';
import './ERC725.sol';

contract Identity is ERC725 {
    using ByteArr for bytes;
    using ByteArr for bytes32[];
    using ByteArr for uint256[];

    struct Execution {
        address to;
        uint256 value;
        bytes data;
        bool approved;
        bool executed;
    }

    uint256 executionNonce;

    mapping (bytes32 => Key) keys;
    mapping (uint256 => bytes32[]) keysByPurpose;
    mapping (uint256 => Execution) executions;

    constructor(address operational, address management) public {
        require(operational != address(0) && management != address(0));

        otVersion = 1;

        bytes32 _management_key = keccak256(abi.encodePacked(management));

        keys[_management_key].key = _management_key;

        keys[_management_key].keyType = 1;

        keys[_management_key].purposes = [1,2,3,4];

        keysByPurpose[1].push(_management_key);
        keysByPurpose[2].push(_management_key);
        keysByPurpose[3].push(_management_key);
        keysByPurpose[4].push(_management_key);
        emit KeyAdded(_management_key, keys[_management_key].purposes, 1);

        if(operational != management){
            bytes32 _operational_key = keccak256(abi.encodePacked(operational));

            keys[_operational_key].key = _operational_key;

            keys[_operational_key].keyType = 1;

            keys[_operational_key].purposes = [2,4];

            keysByPurpose[2].push(_operational_key);
            keysByPurpose[4].push(_operational_key);

            emit KeyAdded(_operational_key, keys[_operational_key].purposes, 1);
        }
    }

    function addKey(bytes32 _key, uint256[] _purposes, uint256 _type) external returns (bool success) {
        require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1));
        require(_key != bytes32(0));
        require(keys[_key].key != _key);

        keys[_key].key = _key;
        keys[_key].purposes = _purposes;
        keys[_key].keyType = _type;

        for (uint i = 0; i < _purposes.length; i++) {
            keysByPurpose[_purposes[i]].push(_key);
        }

        emit KeyAdded(_key, _purposes, _type);
        return true;
    }

    //  "a820f50a": "addKey(bytes32,uint256[],uint256)",
    //  "747442d3": "approve(uint256,bool)",
    //  "b61d27f6": "execute(address,uint256,bytes)",
    //  "862642f5": "removeKey(bytes32)"

    function approve(uint256 _id, bool _approve) public returns (bool success) {
        address to = executions[_id].to;
        bytes4 fHash = executions[_id].data.getFuncHash();
        if (to == address(this)) {
            if (fHash == 0xa820f50a || fHash == 0x862642f5) {
                require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1));
            } else {
                require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2));
            }
        } else {
            require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2));
        }

        emit Approved(_id, _approve);

        if (_approve == true) {
            executions[_id].approved = true;
            success = executions[_id].to.call.value(executions[_id].value)(executions[_id].data);
            if (success) {
                executions[_id].executed = true;
                emit Executed(_id, executions[_id].to, executions[_id].value, executions[_id].data);
                return;
            } else {
                return;
            }
        } else {
            executions[_id].approved = false;
        }
        return true;
    }

    function execute(address _to, uint256 _value, bytes _data) public returns (uint256 executionId) {
        require(!executions[executionNonce].executed);
        executions[executionNonce].to = _to;
        executions[executionNonce].value = _value;
        executions[executionNonce].data = _data;

        if (keyHasPurpose(keccak256(abi.encodePacked(msg.sender)),1) || keyHasPurpose(keccak256(abi.encodePacked(msg.sender)),2)) {
            approve(executionNonce, true);
        }

        emit ExecutionRequested(executionNonce, _to, _value, _data);

        executionNonce++;
        return executionNonce-1;
    }

    function removeKey(bytes32 _key) external returns (bool success) {
        require(keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1));
        require(_key != bytes32(0));

        require(keys[_key].key == _key);

        require(!(keysByPurpose[1].length == 1 && keyHasPurpose(_key, 1)), "Cannot delete only management key!");

        emit KeyRemoved(keys[_key].key, keys[_key].purposes, keys[_key].keyType);

        for (uint i = 0; i < keys[_key].purposes.length; i++) {
            uint index;
            (index,) = keysByPurpose[keys[_key].purposes[i]].indexOf(_key);
            keysByPurpose[keys[_key].purposes[i]].removeByIndex(index);
        }

        delete keys[_key];

        return true;
    }

    function getKey(bytes32 _key) public view returns (uint256[] purposes, uint256 keyType, bytes32 key){
        return (keys[_key].purposes, keys[_key].keyType, keys[_key].key);
    }

    function getKeyPurposes(bytes32 _key) public view returns (uint256[] purposes) {
        return keys[_key].purposes;
    }

    function getKeysByPurpose(uint256 _purpose) public view returns (bytes32[] _keys) {
        return keysByPurpose[_purpose];
    }

    function keyHasPurpose(bytes32 _key, uint256 _purpose) public view returns (bool result) {
        bool isThere;
        (,isThere) = keys[_key].purposes.indexOf(_purpose);
        return isThere;
    }
}