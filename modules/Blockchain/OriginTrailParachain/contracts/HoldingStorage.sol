pragma solidity ^0.4.24;

import './Hub.sol';

contract HoldingStorage {
    Hub public hub;

    constructor(address hubAddress) public{
        hub = Hub(hubAddress);
    }

    modifier onlyContracts() {
        require(hub.isContract(msg.sender),
            "Function can only be called by contracts!");
        _;
    }

    uint256 public difficultyOverride;
    function getDifficultyOverride()
    public view returns (uint256) {
        return difficultyOverride;
    }
    function setDifficultyOverride(uint256 new_difficulty)
    public onlyContracts {
        difficultyOverride = new_difficulty;
    }

    mapping(bytes32 => bytes32) public fingerprint;

    function setFingerprint(bytes32 dataSetId, bytes32 dataRootHash)
    public onlyContracts {
        fingerprint[dataSetId] = dataRootHash;
    }

    struct OfferDefinition {
        address creator;
        bytes32 dataSetId;

        uint256 holdingTimeInMinutes;
        uint256 tokenAmountPerHolder;
        uint256 litigationIntervalInMinutes;

        bytes32 task;
        uint256 difficulty;

        bytes32 redLitigationHash;
        bytes32 greenLitigationHash;
        bytes32 blueLitigationHash;

        uint256 startTime;
    }
    mapping(bytes32 => OfferDefinition) public offer; // offer[offerId];

    function getOfferCreator (bytes32 offerId)
    public view returns(address creator){
        return offer[offerId].creator;
    }
    function getOfferDataSetId (bytes32 offerId)
    public view returns(bytes32 dataSetId){
        return offer[offerId].dataSetId;
    }
    function getOfferHoldingTimeInMinutes (bytes32 offerId)
    public view returns(uint256 holdingTimeInMinutes){
        return offer[offerId].holdingTimeInMinutes;
    }
    function getOfferTokenAmountPerHolder (bytes32 offerId)
    public view returns(uint256 tokenAmountPerHolder){
        return offer[offerId].tokenAmountPerHolder;
    }
    function getOfferLitigationIntervalInMinutes (bytes32 offerId)
    public view returns(uint256 litigationIntervalInMinutes){
        return offer[offerId].litigationIntervalInMinutes;
    }
    function getOfferTask (bytes32 offerId)
    public view returns(bytes32 task){
        return offer[offerId].task;
    }
    function getOfferDifficulty (bytes32 offerId)
    public view returns(uint256 difficulty){
        return offer[offerId].difficulty;
    }
    function getOfferRedLitigationHash (bytes32 offerId)
    public view returns(bytes32 redLitigationHash){
        return offer[offerId].redLitigationHash;
    }
    function getOfferGreenLitigationHash (bytes32 offerId)
    public view returns(bytes32 greenLitigationHash){
        return offer[offerId].greenLitigationHash;
    }
    function getOfferBlueLitigationHash (bytes32 offerId)
    public view returns(bytes32 blueLitigationHash){
        return offer[offerId].blueLitigationHash;
    }
    function getOfferStartTime (bytes32 offerId)
    public view returns(uint256 startTime){
        return offer[offerId].startTime;
    }

    function setOfferCreator (bytes32 offerId, address creator)
    public onlyContracts {
        offer[offerId].creator = creator;
    }
    function setOfferDataSetId (bytes32 offerId, bytes32 dataSetId)
    public onlyContracts {
        offer[offerId].dataSetId = dataSetId;
    }
    function setOfferHoldingTimeInMinutes (bytes32 offerId, uint256 holdingTimeInMinutes)
    public onlyContracts {
        offer[offerId].holdingTimeInMinutes = holdingTimeInMinutes;
    }
    function setOfferTokenAmountPerHolder (bytes32 offerId, uint256 tokenAmountPerHolder)
    public onlyContracts {
        offer[offerId].tokenAmountPerHolder = tokenAmountPerHolder;
    }
    function setOfferLitigationIntervalInMinutes (bytes32 offerId, uint256 litigationIntervalInMinutes)
    public onlyContracts {
        offer[offerId].litigationIntervalInMinutes = litigationIntervalInMinutes;
    }
    function setOfferTask (bytes32 offerId, bytes32 task)
    public onlyContracts {
        offer[offerId].task = task;
    }
    function setOfferDifficulty (bytes32 offerId, uint256 difficulty)
    public onlyContracts {
        offer[offerId].difficulty = difficulty;
    }
    function setOfferRedLitigationHash (bytes32 offerId, bytes32 redLitigationHash)
    public onlyContracts {
        offer[offerId].redLitigationHash = redLitigationHash;
    }
    function setOfferGreenLitigationHash (bytes32 offerId, bytes32 greenLitigationHash)
    public onlyContracts {
        offer[offerId].greenLitigationHash = greenLitigationHash;
    }
    function setOfferBlueLitigationHash (bytes32 offerId, bytes32 blueLitigationHash)
    public onlyContracts {
        offer[offerId].blueLitigationHash = blueLitigationHash;
    }
    function setOfferStartTime (bytes32 offerId, uint256 startTime)
    public onlyContracts {
        offer[offerId].startTime = startTime;
    }
    function setOfferParameters (
        bytes32 offerId,
        address creator,
        bytes32 dataSetId,
        uint256 holdingTimeInMinutes,
        uint256 tokenAmountPerHolder,
        uint256 litigationIntervalInMinutes,
        bytes32 task,
        uint256 difficulty)
    public onlyContracts {
        offer[offerId].creator = creator;
        offer[offerId].dataSetId = dataSetId;
        offer[offerId].holdingTimeInMinutes = holdingTimeInMinutes;
        offer[offerId].tokenAmountPerHolder = tokenAmountPerHolder;
        offer[offerId].litigationIntervalInMinutes = litigationIntervalInMinutes;
        if(offer[offerId].task != task) offer[offerId].task = task;
        offer[offerId].difficulty = difficulty;
    }
    function setOfferLitigationHashes (
        bytes32 offerId,
        bytes32 redLitigationHash,
        bytes32 greenLitigationHash,
        bytes32 blueLitigationHash)
    public onlyContracts {
        offer[offerId].redLitigationHash = redLitigationHash;
        offer[offerId].greenLitigationHash = greenLitigationHash;
        offer[offerId].blueLitigationHash = blueLitigationHash;
    }


    struct HolderDefinition {
        uint256 stakedAmount;
        uint256 paidAmount;
        uint256 litigationEncryptionType;

        uint256 paymentTimestamp;
    }
    mapping(bytes32 => mapping(address => HolderDefinition)) public holder; // holder[offerId][address];

    function setHolders(
        bytes32 offerId,
        address[] identities,
        uint8[] litigationEncryptionTypes)
    public onlyContracts {
        offer[offerId].startTime = block.timestamp;

        holder[offerId][identities[0]].stakedAmount = offer[offerId].tokenAmountPerHolder;
        if(holder[offerId][identities[0]].litigationEncryptionType != litigationEncryptionTypes[0])
            holder[offerId][identities[0]].litigationEncryptionType = litigationEncryptionTypes[0];

        holder[offerId][identities[1]].stakedAmount = offer[offerId].tokenAmountPerHolder;
        if(holder[offerId][identities[1]].litigationEncryptionType != litigationEncryptionTypes[1])
            holder[offerId][identities[1]].litigationEncryptionType = litigationEncryptionTypes[1];

        holder[offerId][identities[2]].stakedAmount = offer[offerId].tokenAmountPerHolder;
        if(holder[offerId][identities[2]].litigationEncryptionType != litigationEncryptionTypes[2])
            holder[offerId][identities[2]].litigationEncryptionType = litigationEncryptionTypes[2];

        holder[offerId][identities[0]].paymentTimestamp = block.timestamp;
        holder[offerId][identities[1]].paymentTimestamp = block.timestamp;
        holder[offerId][identities[2]].paymentTimestamp = block.timestamp;
    }
    function setHolderStakedAmount (bytes32 offerId, address identity, uint256 stakedAmount)
    public onlyContracts {
        require(identity!=address(0));
        holder[offerId][identity].stakedAmount = stakedAmount;
    }
    function setHolderPaidAmount (bytes32 offerId, address identity, uint256 paidAmount)
    public onlyContracts {
        require(identity!=address(0));
        holder[offerId][identity].paidAmount = paidAmount;
    }
    function setHolderLitigationEncryptionType(bytes32 offerId, address identity, uint256 litigationEncryptionType)
    public onlyContracts {
        require(identity!=address(0));
        holder[offerId][identity].litigationEncryptionType = litigationEncryptionType;
    }
    function setHolderPaymentTimestamp(bytes32 offerId, address identity, uint256 paymentTimestamp)
    public onlyContracts {
        holder[offerId][identity].paymentTimestamp = paymentTimestamp;
    }

    function getHolderStakedAmount (bytes32 offerId, address identity)
    public view returns(uint256 stakedAmount) {
        require(identity!=address(0));
        return holder[offerId][identity].stakedAmount;
    }
    function getHolderPaidAmount (bytes32 offerId, address identity)
    public view returns(uint256 paidAmount) {
        require(identity!=address(0));
        return holder[offerId][identity].paidAmount;
    }
    function getHolderLitigationEncryptionType(bytes32 offerId, address identity)
    public view returns(uint256 litigationEncryptionType) {
        require(identity!=address(0));
        return holder[offerId][identity].litigationEncryptionType;
    }
    function getHolderPaymentTimestamp(bytes32 offerId, address identity)
    public view returns(uint256 paymentTimestamp) {
        return holder[offerId][identity].paymentTimestamp;
    }
    function setHubAddress(address newHubAddress)
    public onlyContracts {
        require(newHubAddress!=address(0));
        hub = Hub(newHubAddress);
    }
}
