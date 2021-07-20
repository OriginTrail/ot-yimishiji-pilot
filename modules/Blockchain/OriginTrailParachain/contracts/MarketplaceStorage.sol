pragma solidity ^0.4.0;

import './Hub.sol';

contract MarketplaceStorage {
    Hub public hub;

    modifier onlyContracts(){
        require(hub.isContract(msg.sender),
            "Function can only be called by contracts!");
        _;
    }

    constructor(address hubAddress) public {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function setHubAddress(address newHubAddress)
    public onlyContracts {
        require(newHubAddress != address(0));
        hub = Hub(newHubAddress);
    }

    enum StageDefinition {created, initialized, keyDeposited, finished}

    struct PurchaseDefinition{
        address seller;
        address buyer;
        uint256 price;
        bytes32 key;
        uint256 timestamp;
        bytes32 originalDataRootHash;
        bytes32 encodedDataRootHash;
        StageDefinition stage;
    }
    mapping(bytes32 => PurchaseDefinition) public purchase;


    function setSeller (bytes32 purchaseId, address sellerAddress)
    public onlyContracts {
        purchase[purchaseId].seller = sellerAddress;
    }

    function getSeller (bytes32 purchaseId)
    public view returns(address seller){
        return purchase[purchaseId].seller;
    }

    function setBuyer (bytes32 purchaseId, address buyerAddress)
    public onlyContracts {
        purchase[purchaseId].buyer = buyerAddress;
    }

    function getBuyer (bytes32 purchaseId)
    public view returns(address buyer){
        return purchase[purchaseId].buyer;
    }

    function setPrice (bytes32 purchaseId, uint price)
    public onlyContracts {
        purchase[purchaseId].price = price;
    }

    function getPrice (bytes32 purchaseId)
    public view returns(uint price){
        return purchase[purchaseId].price;
    }

    function setKey (bytes32 purchaseId, bytes32 key)
    public onlyContracts {
        purchase[purchaseId].key = key;
    }

    function getKey (bytes32 purchaseId)
    public view returns(bytes32 key){
        return purchase[purchaseId].key;
    }

    function setTimestamp (bytes32 purchaseId, uint256 timestamp)
    public onlyContracts {
        purchase[purchaseId].timestamp = timestamp;
    }

    function getTimestamp (bytes32 purchaseId)
    public view returns(uint256 timestamp){
        return purchase[purchaseId].timestamp;
    }

    function setOriginalDataRootHash (bytes32 purchaseId, bytes32 originalDataRootHash)
    public onlyContracts {
        purchase[purchaseId].originalDataRootHash = originalDataRootHash;
    }

    function getOriginalDataRootHash (bytes32 purchaseId)
    public view returns(bytes32 originalDataRootHash){
        return purchase[purchaseId].originalDataRootHash;
    }

    function setEncodedDataRootHash (bytes32 purchaseId, bytes32 encodedDataRootHash)
    public onlyContracts {
        purchase[purchaseId].encodedDataRootHash = encodedDataRootHash;
    }

    function getEncodedDataRootHash (bytes32 purchaseId)
    public view returns(bytes32 encodedDataRootHash){
        return purchase[purchaseId].encodedDataRootHash;
    }

    function setStage (bytes32 purchaseId, uint stage)
    public onlyContracts {
        purchase[purchaseId].stage = StageDefinition(stage);
    }

    function getStage (bytes32 purchaseId)
    public view returns(uint stage){
        return uint(purchase[purchaseId].stage);
    }
}
