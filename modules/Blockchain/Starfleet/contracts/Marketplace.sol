pragma solidity ^0.4.0;

import './Hub.sol';

import {ERC725} from './ERC725.sol';
import {HoldingStorage} from './HoldingStorage.sol';
import {MarketplaceStorage} from './MarketplaceStorage.sol';
import {SafeMath} from './SafeMath.sol';
import {ProfileStorage} from "./ProfileStorage.sol";
import {Profile} from "./Profile.sol";

contract Marketplace {
    using SafeMath for uint256;

    Hub public hub;

    modifier onlyContracts(){
        require(hub.isContract(msg.sender),
            "Function can only be called by contracts!");
        _;
    }

    uint256 public paymentStageInterval = 5 minutes;

    constructor(address hubAddress) public {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    function setHubAddress(address newHubAddress)
    public onlyContracts {
        require(newHubAddress != address(0));
        hub = Hub(newHubAddress);
    }

    modifier onlyHolding(){
        require(msg.sender == hub.getContractAddress("Holding"),
            "Function can only be called by Holding contract!");
        _;
    }

    event PurchaseInitiated(
        bytes32 purchaseId,
        address sellerIdentity, address buyerIdentity,
        uint256 price,
        bytes32 originalDataRootHash, bytes32 encodedDataRootHash
    );
    event KeyDeposited(bytes32 purchaseId, bytes32 key);
    event MisbehaviourProven(bytes32 purchaseId, address sellerIdentity, address buyerIdentity);
    event PurchaseCompleted(bytes32 purchaseId, address sellerIdentity, address buyerIdentity);

    function initiatePurchase(
        address sellerIdentity,
        address buyerIdentity,
        uint price,
        bytes32 originalDataRootHash,
        bytes32 encodedDataRootHash
    ) public {
        require(uint256(sellerIdentity) != 0, "Cannot initiate purchase without seller id submitted");
        require(uint256(buyerIdentity) != 0, "Cannot initiate purchase without price submitted");
        require(uint256(originalDataRootHash) !=0, "Cannot initiate purchase without originalDataRootHash submitted");
        require(uint256(encodedDataRootHash) != 0, "Cannot initiate purchase without encodedDataRootHash submitted");

        require(ERC725(buyerIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2) || ERC725(buyerIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1), "Sender does not have proper permission to call this function!");

        // purchase_id is created as a hash of: sender, previous block hash, and data root hash
        bytes32 purchaseId = keccak256(abi.encodePacked(msg.sender, blockhash(block.number - 1), encodedDataRootHash));

        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setSeller(purchaseId, sellerIdentity);
        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setBuyer(purchaseId, buyerIdentity);

        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setPrice(purchaseId, price);

        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setOriginalDataRootHash(purchaseId, originalDataRootHash);
        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setEncodedDataRootHash(purchaseId, encodedDataRootHash);

        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setTimestamp(purchaseId, block.timestamp);
        MarketplaceStorage(hub.getContractAddress("MarketplaceStorage")).setStage(purchaseId, 1);

        // Secure funds from buyer
        reserveTokens(buyerIdentity, price);

        emit PurchaseInitiated(purchaseId, sellerIdentity, buyerIdentity, price, originalDataRootHash, encodedDataRootHash);
    }

    function depositKey(bytes32 purchaseId, bytes32 key) public {
        require(uint256(purchaseId) != 0, "Cannot reveal key without purchase id submitted");
        require(uint256(key) != 0, "Cannot reveal key without key submitted");

        MarketplaceStorage marketplaceStorage = MarketplaceStorage(hub.getContractAddress("MarketplaceStorage"));

        address sellerIdentity = marketplaceStorage.getSeller(purchaseId);
        require(ERC725(sellerIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2) || ERC725(sellerIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1), "Only seller can reveal key!");
        require(marketplaceStorage.getStage(purchaseId) == 1, "Key can only be revealed in the initiated stage");

        marketplaceStorage.setKey(purchaseId, key);

        marketplaceStorage.setTimestamp(purchaseId, block.timestamp);
        marketplaceStorage.setStage(purchaseId, 2);

        // Secure funds from all parties
        reserveTokens(sellerIdentity, marketplaceStorage.getPrice(purchaseId));

        emit KeyDeposited(purchaseId, key);
    }

    function takePayment(bytes32 purchaseId) public {
        require(uint256(purchaseId) != 0, "Cannot take payment  without purchase id submitted");

        MarketplaceStorage marketplaceStorage = MarketplaceStorage(hub.getContractAddress("MarketplaceStorage"));

        require(marketplaceStorage.getStage(purchaseId) == 2, "Payment can only be taken in the KeyDeposited stage");
        require(block.timestamp > marketplaceStorage.getTimestamp(purchaseId) + paymentStageInterval, "Complaint window has not yet expired!");

        address buyerIdentity = marketplaceStorage.getBuyer(purchaseId);
        address sellerIdentity = marketplaceStorage.getSeller(purchaseId);
        uint256 price = marketplaceStorage.getPrice(purchaseId);

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getStake(buyerIdentity) >= price, "Buyer does not have enough tokens to transfer!");
        require(profileStorage.getStakeReserved(buyerIdentity) >= price, "Buyer does not have enough tokens reserved to transfer!");

        profileStorage.setStakeReserved(buyerIdentity, profileStorage.getStakeReserved(buyerIdentity).sub(price));
        profileStorage.setStake(buyerIdentity, profileStorage.getStake(buyerIdentity).sub(price));
        profileStorage.setStake(sellerIdentity, profileStorage.getStake(sellerIdentity).add(price));

        // Unlock seller stake tokens
        require(profileStorage.getStakeReserved(sellerIdentity) >= price, "Seller does not have enough tokens reserved to unlock!");
        profileStorage.setStakeReserved(sellerIdentity, profileStorage.getStakeReserved(sellerIdentity).sub(price));

        marketplaceStorage.setStage(purchaseId, 3);
        marketplaceStorage.setTimestamp(purchaseId, block.timestamp);

        emit PurchaseCompleted(purchaseId, sellerIdentity, buyerIdentity);
    }

    function reserveTokens(address party, uint256 amount)
    internal {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        if(profileStorage.getWithdrawalPending(party) &&
            profileStorage.getWithdrawalAmount(party).add(amount) > profileStorage.getStake(party) - profileStorage.getStakeReserved(party)) {

            profileStorage.setWithdrawalPending(party, false);
        }

        require(profileStorage.getStake(party).sub(profileStorage.getStakeReserved(party)) >= amount,
            "User does not have enough stake for reserving!");

        profileStorage.setStakeReserved(party, profileStorage.getStakeReserved(party).add(amount));
    }

    // function complain about wrong hash of file
    function complainAboutRoot (bytes32 purchaseId, bytes32 _originalDataRootEncoded, bytes32[] _proofOfEncodedData, uint256 _indexOfRootHash)
    public {
        require(uint256(purchaseId) != 0, "Cannot take payment  without purchase id submitted");

        MarketplaceStorage marketplaceStorage = MarketplaceStorage(hub.getContractAddress("MarketplaceStorage"));
        bytes32 key = marketplaceStorage.getKey(purchaseId);
        bytes32 encodedDataRootHash = marketplaceStorage.getEncodedDataRootHash(purchaseId);

        require(marketplaceStorage.getStage(purchaseId) == 2, "Complaint can only be given in the KeyDeposited stage");
        require(block.timestamp <= marketplaceStorage.getTimestamp(purchaseId) + paymentStageInterval, "Complaint window has expired!");

        require (verifyMerkleTreeProof(_indexOfRootHash, _originalDataRootEncoded, _proofOfEncodedData, encodedDataRootHash));
        if (decryptCiphertext(_indexOfRootHash, _originalDataRootEncoded, key) !=
            marketplaceStorage.getOriginalDataRootHash(purchaseId))
        {
            refundBuyer(purchaseId);
        }
    }

    // function complain about wrong hash of two inputs
    function complainAboutNode (
        bytes32 purchaseId,
        uint _indexOfEncodedOutput, uint _indexOfEncodedInputLeft,
        bytes32 _encodedOutput, bytes32 _encodedInputLeft,
        bytes32[] _proofOfEncodedOutput, bytes32[] _proofOfEncodedInput
    ) public {
        require(uint256(purchaseId) != 0, "Cannot take payment  without purchase id submitted");

        MarketplaceStorage marketplaceStorage = MarketplaceStorage(hub.getContractAddress("MarketplaceStorage"));
        bytes32 key = marketplaceStorage.getKey(purchaseId);
        bytes32 encodedDataRootHash = marketplaceStorage.getEncodedDataRootHash(purchaseId);

        require(marketplaceStorage.getStage(purchaseId) == 2, "Complaint can only be given in the KeyDeposited stage");
        require(block.timestamp <= marketplaceStorage.getTimestamp(purchaseId) + paymentStageInterval, "Complaint window has expired!");

        // Verify that the output element was sent by seller
        require (
            verifyMerkleTreeProof(_indexOfEncodedOutput, _encodedOutput, _proofOfEncodedOutput, encodedDataRootHash),
            "Proof for output element incorrect"
        );

        // Verify that the left input element was sent by the seller
        require (
            verifyMerkleTreeProof(_indexOfEncodedInputLeft, _encodedInputLeft, _proofOfEncodedInput, encodedDataRootHash),
            "Proof for input element incorrect"
        );

        // Get decrypted output element
        bytes32 decodedOutput = decryptCiphertext(_indexOfEncodedOutput, _encodedOutput, key);
        bytes32 encodedInputRight = _proofOfEncodedInput[0];
        // Prove that the decrypted output element is different than the hash of decoded input elements
        if (decodedOutput !=
            keccak256(abi.encodePacked(
                decryptCiphertext(_indexOfEncodedInputLeft, _encodedInputLeft, key),
                decryptCiphertext(_indexOfEncodedInputLeft + 1, encodedInputRight, key)
                ))
            )
        {
            refundBuyer(purchaseId);
        }

    }

    // function to decrypt hashes of the merkle tree
    function decryptCiphertext (uint _index, bytes32 _ciphertext, bytes32 _key)
    public pure returns (bytes32){
        return keccak256(abi.encodePacked(_key, _index)) ^ _ciphertext;
    }

    // function to verify Merkle Tree proofs
    function verifyMerkleTreeProof(uint _index, bytes32 _value, bytes32[] _proof, bytes32 _encodedDataRootHash)
    public view returns (bool) {
        uint8 bitMask = 1;

        for (uint8 i = 0; i < _proof.length; i += 1){
            uint256 selectedBit = _index >> i;
            selectedBit = selectedBit & bitMask;

            if(selectedBit == 1) {
                _value = keccak256(abi.encodePacked(_proof[i], _value));
            }
            else {
                _value = keccak256(abi.encodePacked(_value, _proof[i]));
            }
        }
        return (_value == _encodedDataRootHash);
    }

    function refundBuyer(bytes32 purchaseId)
    internal {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        MarketplaceStorage marketplaceStorage = MarketplaceStorage(hub.getContractAddress("MarketplaceStorage"));

        address sellerIdentity = marketplaceStorage.getSeller(purchaseId);
        address buyerIdentity = marketplaceStorage.getBuyer(purchaseId);
        uint256 price = marketplaceStorage.getPrice(purchaseId);

        require(profileStorage.getStake(sellerIdentity) >= price, "Buyer does not have enough tokens to transfer!");
        require(profileStorage.getStakeReserved(buyerIdentity) >= price, "Buyer does not have enough tokens reserved to transfer!");

        profileStorage.setStakeReserved(sellerIdentity, profileStorage.getStakeReserved(sellerIdentity).sub(price));
        profileStorage.setStake(sellerIdentity, profileStorage.getStake(sellerIdentity).sub(price));
        profileStorage.setStake(buyerIdentity, profileStorage.getStake(buyerIdentity).add(price));

        // Unlock seller stake tokens
        require(profileStorage.getStakeReserved(buyerIdentity) >= price, "Seller does not have enough tokens reserved to unlock!");
        profileStorage.setStakeReserved(buyerIdentity, profileStorage.getStakeReserved(buyerIdentity).sub(price));

        marketplaceStorage.setStage(purchaseId, 3);
        marketplaceStorage.setTimestamp(purchaseId, block.timestamp);

        emit MisbehaviourProven(purchaseId, sellerIdentity, buyerIdentity);
    }
}
