pragma solidity ^0.4.24;

contract MockHolding {
    event OfferTask(bytes32 dataSetId, address dcProfile, bytes32 offerId, byte task);
    event OfferCreated(bytes32 offerId, bytes32 dcNodeId);

    function createOffer(bytes32 dataSetId, bytes32 dcNodeId) public{
        emit OfferCreated(keccak256(abi.encodePacked(dataSetId)), dcNodeId);
        emit OfferTask(dataSetId, msg.sender, keccak256(abi.encodePacked(dataSetId)), byte(keccak256(abi.encodePacked(blockhash(block.number)))));
    }
  
    event OfferFinalized(bytes32 offerId, address holder1, address holder2, address holder3);
    function finalizeOffer(bytes32 offerId, address holder1, address holder2, address holder3) public{
        emit OfferFinalized(offerId, holder1, holder2, holder3);
    }
}



