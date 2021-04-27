pragma solidity ^0.4.25;

import {Hub} from "./Hub.sol";

contract LitigationStorage {
	Hub public hub;
	
	constructor(address hubAddress) public{
		hub = Hub(hubAddress);
	}

	function setHubAddress(address newHubAddress) public onlyContracts {
		hub = Hub(newHubAddress);
	}

	modifier onlyContracts() {
		require(hub.isContract(msg.sender),
		"Function can only be called by contracts!");
		_;
	}
	
	enum LitigationStatus {completed, initiated, answered, replacing, replaced}

	struct LitigationDefinition{
		address litigatorIdentity;

		uint256 requestedObjectIndex;
		uint256 requestedBlockIndex;
		bytes32 requestedData;
		bytes32[] hashArray;
		
		LitigationStatus status;
		uint256 timestamp;

		bytes32 replacementTask;
		uint256 replacementDifficulty;
	}

	mapping(bytes32 => mapping(address => LitigationDefinition)) public litigation; // litigation[offerId][holderIdentity]
	
	function setLitigationLitigatorIdentity (bytes32 offerId, address holderIdentity, address litigatorIdentity)
	public onlyContracts {
		litigation[offerId][holderIdentity].litigatorIdentity = litigatorIdentity;
	}
	function setLitigationRequestedObjectIndex (bytes32 offerId, address holderIdentity, uint256 requestedObjectIndex)
	public onlyContracts {
		litigation[offerId][holderIdentity].requestedObjectIndex = requestedObjectIndex;
	}
	function setLitigationRequestedBlockIndex (bytes32 offerId, address holderIdentity, uint256 requestedBlockIndex)
	public onlyContracts {
		litigation[offerId][holderIdentity].requestedBlockIndex = requestedBlockIndex;
	}
	function setLitigationRequestedData (bytes32 offerId, address holderIdentity, bytes32 requestedData)
	public onlyContracts {
		litigation[offerId][holderIdentity].requestedData = requestedData;
	}
	function setLitigationHashArray (bytes32 offerId, address holderIdentity, bytes32[] hashArray)
	public onlyContracts {
		litigation[offerId][holderIdentity].hashArray = hashArray;
	}
	function setLitigationStatus (bytes32 offerId, address holderIdentity, LitigationStatus status)
	public onlyContracts {
		litigation[offerId][holderIdentity].status = status;
	}
	function setLitigationTimestamp (bytes32 offerId, address holderIdentity, uint256 timestamp)
	public onlyContracts {
		litigation[offerId][holderIdentity].timestamp = timestamp;
	}
	function setLitigationReplacementTask (bytes32 offerId, address holderIdentity, bytes32 replacementTask)
	public onlyContracts {
		litigation[offerId][holderIdentity].replacementTask = replacementTask;
	}
	function setLitigationReplacementDifficulty (bytes32 offerId, address holderIdentity, uint256 replacementDifficulty)
	public onlyContracts {
		litigation[offerId][holderIdentity].replacementDifficulty = replacementDifficulty;
	}

	function getLitigationLitigatorIdentity (bytes32 offerId, address holderIdentity)
	public view returns (address litigatorIdentity){
		return litigation[offerId][holderIdentity].litigatorIdentity;
	}
	function getLitigationRequestedObjectIndex (bytes32 offerId, address holderIdentity)
	public view returns (uint256 requestedObjectIndex){
		return litigation[offerId][holderIdentity].requestedObjectIndex;
	}
	function getLitigationRequestedBlockIndex (bytes32 offerId, address holderIdentity)
	public view returns (uint256 requestedBlockIndex){
		return litigation[offerId][holderIdentity].requestedBlockIndex;
	}
	function getLitigationRequestedData (bytes32 offerId, address holderIdentity)
	public view returns (bytes32 requestedData){
		return litigation[offerId][holderIdentity].requestedData;
	}
	function getLitigationHashArray (bytes32 offerId, address holderIdentity)
	public view returns (bytes32[] hashArray){
		return litigation[offerId][holderIdentity].hashArray;
	}
	function getLitigationStatus (bytes32 offerId, address holderIdentity)
	public view returns (LitigationStatus status){
		return litigation[offerId][holderIdentity].status;
	}
	function getLitigationTimestamp (bytes32 offerId, address holderIdentity)
	public view returns (uint256 timestamp){
		return litigation[offerId][holderIdentity].timestamp;
	}
	function getLitigationReplacementTask (bytes32 offerId, address holderIdentity)
	public view returns (bytes32 replacementTask) {
		return litigation[offerId][holderIdentity].replacementTask;
	}
	function getLitigationReplacementDifficulty (bytes32 offerId, address holderIdentity)
	public view returns (uint256 replacementDifficulty) {
		return litigation[offerId][holderIdentity].replacementDifficulty;
	}
}