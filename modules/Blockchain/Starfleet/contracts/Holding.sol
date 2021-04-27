pragma solidity ^0.4.24;

import './Hub.sol';
import {ERC725} from './ERC725.sol';
import {HoldingStorage} from './HoldingStorage.sol';
import {ProfileStorage} from './ProfileStorage.sol';
import {LitigationStorage} from './LitigationStorage.sol';
import {Profile} from './Profile.sol';
import {CreditorHandler} from './CreditorHandler.sol';
import {Approval} from './Approval.sol';
import {SafeMath} from './SafeMath.sol';

contract Holding is Ownable {
    using SafeMath for uint256;

    Hub public hub;
    uint256 public difficultyOverride;

    constructor(address hubAddress) public{
        require(hubAddress!=address(0));
        hub = Hub(hubAddress);
    }

    function setHubAddress(address newHubAddress) public{
        require(hub.isContract(msg.sender), "This function can only be called by contracts or their creator!");

        hub = Hub(newHubAddress);
    }

    event OfferTask(bytes32 dataSetId, bytes32 dcNodeId, bytes32 offerId, bytes32 task);
    event OfferCreated(bytes32 offerId, bytes32 dataSetId, bytes32 dcNodeId, uint256 holdingTimeInMinutes, uint256 dataSetSizeInBytes, uint256 tokenAmountPerHolder, uint256 litigationIntervalInMinutes);
    event OfferFinalized(bytes32 offerId, address holder1, address holder2, address holder3);

    event PaidOut(bytes32 offerId, address holder, uint256 amount);

    function createOffer(address identity, uint256 dataSetId,
        uint256 dataRootHash, uint256 redLitigationHash, uint256 greenLitigationHash, uint256 blueLitigationHash, uint256 dcNodeId,
        uint256 holdingTimeInMinutes, uint256 tokenAmountPerHolder, uint256 dataSetSizeInBytes, uint256 litigationIntervalInMinutes) public {
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2));
        require(Approval(hub.getContractAddress("Approval")).identityHasApproval(identity), "Identity does not have approval for using the contract");
        // First we check that the paramaters are valid
        require(dataRootHash != 0, "Data root hash cannot be zero");
        require(redLitigationHash != 0, "Litigation hash cannot be zero");
        require(greenLitigationHash != 0, "Litigation root hash cannot be zero");
        require(blueLitigationHash != 0, "Litigation root hash cannot be zero");
        require(holdingTimeInMinutes > 0, "Holding time cannot be zero");
        require(dataSetSizeInBytes > 0, "Data size cannot be zero");
        require(tokenAmountPerHolder > 0, "Token amount per holder cannot be zero");
        require(litigationIntervalInMinutes > 0, "Litigation interval cannot be zero");

        // Writing data root hash if it wasn't previously set
        if(HoldingStorage(hub.getContractAddress("HoldingStorage")).fingerprint(bytes32(dataSetId)) == bytes32(0)){
            HoldingStorage(hub.getContractAddress("HoldingStorage")).setFingerprint(bytes32(dataSetId), bytes32(dataRootHash));
        } else {
            require(bytes32(dataRootHash) == HoldingStorage(hub.getContractAddress("HoldingStorage")).fingerprint(bytes32(dataSetId)),
                "Cannot create offer with different data root hash!");
        }

        // Now we calculate the offerId, which should be unique
        // We consider a pair of dataSet and identity unique within one block, hence the formula for offerId
        bytes32 offerId = keccak256(abi.encodePacked(bytes32(dataSetId), identity, blockhash(block.number - 1)));


        //We calculate the task for the data creator to solve
        //Calculating task difficulty
        uint256 difficulty;
        if(HoldingStorage(hub.getContractAddress("HoldingStorage")).getDifficultyOverride() != 0) {
            difficulty = HoldingStorage(hub.getContractAddress("HoldingStorage")).getDifficultyOverride();
        }
        else {
            if(logs2(ProfileStorage(hub.getContractAddress("ProfileStorage")).activeNodes()) <= 4) difficulty = 1;
            else {
                difficulty = 4 + (((logs2(ProfileStorage(hub.getContractAddress("ProfileStorage")).activeNodes()) - 4) * 10000) / 13219);
            }
        }

        // Writing variables into storage
        HoldingStorage(hub.getContractAddress("HoldingStorage")).setOfferParameters(
            offerId,
            identity,
            bytes32(dataSetId),
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            litigationIntervalInMinutes,
            blockhash(block.number - 1) & bytes32(2 ** (difficulty * 4) - 1),
            difficulty
        );

        HoldingStorage(hub.getContractAddress("HoldingStorage")).setOfferLitigationHashes(
            offerId,
            bytes32(redLitigationHash),
            bytes32(greenLitigationHash),
            bytes32(blueLitigationHash)
        );

        emit OfferTask(bytes32(dataSetId), bytes32(dcNodeId), offerId, blockhash(block.number - 1) & bytes32(2 ** (difficulty * 4) - 1));
        emit OfferCreated(offerId, bytes32(dataSetId), bytes32(dcNodeId), holdingTimeInMinutes, dataSetSizeInBytes, tokenAmountPerHolder, litigationIntervalInMinutes);
    }

    function finalizeOffer(address identity, uint256 offerId, uint256 shift,
        bytes confirmation1, bytes confirmation2, bytes confirmation3,
        uint8[] encryptionType, address[] holderIdentity, address parentIdentity)
    public {
        HoldingStorage holdingStorage = HoldingStorage(hub.getContractAddress("HoldingStorage"));

        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2), "Sender does not have action permission to call this function!");
        if(parentIdentity != address(0)){
            CreditorHandler(hub.getContractAddress("CreditorHandler")).finalizeOffer(offerId, identity, parentIdentity);
        }
        require(identity == holdingStorage.getOfferCreator(bytes32(offerId)), "Offer can only be finalized by its creator!");

        // Check if signatures match identities
        require(ERC725(holderIdentity[0]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(holderIdentity[0]))), confirmation1))), 4), "Wallet from holder 1 does not have encryption approval!");
        require(ERC725(holderIdentity[1]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(holderIdentity[1]))), confirmation2))), 4), "Wallet from holder 2 does not have encryption approval!");
        require(ERC725(holderIdentity[2]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(holderIdentity[2]))), confirmation3))), 4), "Wallet from holder 3 does not have encryption approval!");

        // Verify task answer
        bytes32[3] memory hashes;

        hashes[0] = keccak256(abi.encodePacked(holderIdentity[0], holdingStorage.getOfferTask(bytes32(offerId))));
        hashes[1] = keccak256(abi.encodePacked(holderIdentity[1], holdingStorage.getOfferTask(bytes32(offerId))));
        hashes[2] = keccak256(abi.encodePacked(holderIdentity[2], holdingStorage.getOfferTask(bytes32(offerId))));

        require(uint256(hashes[0]) < uint256(hashes[1]) && uint256(hashes[1]) < uint256(hashes[2]), "Solution hashes are not sorted!");

        // Verify task answer
        require(((keccak256(abi.encodePacked(hashes[0], hashes[1], hashes[2])) >> (shift * 4)) & bytes32((2 ** (4 * holdingStorage.getOfferDifficulty(bytes32(offerId)))) - 1))
            == holdingStorage.getOfferTask(bytes32(offerId)), "Submitted identities do not answer the task correctly!");

        // Write data into storage
        holdingStorage.setHolders(bytes32(offerId), holderIdentity, encryptionType);

        // Secure funds from all parties
        reserveTokens(offerId, identity, holderIdentity);

        emit OfferFinalized(bytes32(offerId), holderIdentity[0], holderIdentity[1], holderIdentity[2]);
    }

    function reserveTokens(uint256 offerId, address payer, address[] identity)
    internal {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint256 amount = HoldingStorage(hub.getContractAddress("HoldingStorage")).getOfferTokenAmountPerHolder(bytes32(offerId));

        if(profileStorage.getWithdrawalPending(payer) && profileStorage.getWithdrawalAmount(payer).add(amount.mul(3)) > profileStorage.getStake(payer) - profileStorage.getStakeReserved(payer)) {
            profileStorage.setWithdrawalPending(payer,false);
        }
        if(profileStorage.getWithdrawalPending(identity[0]) && profileStorage.getWithdrawalAmount(identity[0]).add(amount) > profileStorage.getStake(identity[0]) - profileStorage.getStakeReserved(identity[0])) {
            profileStorage.setWithdrawalPending(identity[0],false);
        }
        if(profileStorage.getWithdrawalPending(identity[1]) && profileStorage.getWithdrawalAmount(identity[1]).add(amount) > profileStorage.getStake(identity[1]) - profileStorage.getStakeReserved(identity[1])) {
            profileStorage.setWithdrawalPending(identity[1],false);
        }
        if(profileStorage.getWithdrawalPending(identity[2]) && profileStorage.getWithdrawalAmount(identity[2]).add(amount) > profileStorage.getStake(identity[2]) - profileStorage.getStakeReserved(identity[2])) {
            profileStorage.setWithdrawalPending(identity[2],false);
        }

        uint256 minimalStake = Profile(hub.getContractAddress("Profile")).minimalStake();

        require(minimalStake <= profileStorage.getStake(payer).sub(profileStorage.getStakeReserved(payer)),
            "Data creator does not have enough stake to create new jobs!");
        require(minimalStake <= profileStorage.getStake(identity[0]).sub(profileStorage.getStakeReserved(identity[0])),
            "First profile does not have enough stake to take new jobs!");
        require(minimalStake <= profileStorage.getStake(identity[1]).sub(profileStorage.getStakeReserved(identity[1])),
            "Second profile does not have enough stake to take new jobs!");
        require(minimalStake <= profileStorage.getStake(identity[2]).sub(profileStorage.getStakeReserved(identity[2])),
            "Third profile does not have enough stake to take new jobs!");

        require(profileStorage.getStake(payer).sub(profileStorage.getStakeReserved(payer)) >= amount.mul(3),
            "Data creator does not have enough stake for reserving!");
        require(profileStorage.getStake(identity[0]).sub(profileStorage.getStakeReserved(identity[0])) >= amount,
            "First profile does not have enough stake for reserving!");
        require(profileStorage.getStake(identity[1]).sub(profileStorage.getStakeReserved(identity[1])) >= amount,
            "Second profile does not have enough stake for reserving!");
        require(profileStorage.getStake(identity[2]).sub(profileStorage.getStakeReserved(identity[2])) >= amount,
            "Third profile does not have enough stake for reserving!");

        profileStorage.increaseStakesReserved(
            payer,
            identity[0],
            identity[1],
            identity[2],
            amount
        );
    }

    function payOut(address identity, uint256 offerId)
    public {
        HoldingStorage holdingStorage = HoldingStorage(hub.getContractAddress("HoldingStorage"));

        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2) || ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1), "Sender does not have proper permission to call this function!");
        require(Approval(hub.getContractAddress("Approval")).identityHasApproval(identity), "Identity does not have approval for using the contract");

        // Verify that the litigation is not in progress
        LitigationStorage.LitigationStatus status = LitigationStorage(hub.getContractAddress("LitigationStorage")).getLitigationStatus(bytes32(offerId), identity);
        uint256 litigationTimestamp = LitigationStorage(hub.getContractAddress("LitigationStorage")).getLitigationTimestamp(bytes32(offerId), identity);
        uint256 litigationInterval = HoldingStorage(hub.getContractAddress("HoldingStorage")).getOfferLitigationIntervalInMinutes(bytes32(offerId)).mul(60);

        if(status == LitigationStorage.LitigationStatus.initiated) {
            require(litigationTimestamp + litigationInterval.mul(2) < block.timestamp,
                "Unanswered litigation in progress, cannot pay out");
        }
        else if(status == LitigationStorage.LitigationStatus.answered){
            require(litigationTimestamp + litigationInterval < block.timestamp,
                "Unanswered litigation in progress, cannot pay out");
        }
        else {
            require(status == LitigationStorage.LitigationStatus.completed,
                "Data holder is replaced or being replaced, cannot payout!");
        }

        // Verify holder
        require(holdingStorage.getHolderStakedAmount(bytes32(offerId), identity) > 0, "Sender is not holding this data set!");

        // Calculate amount to send
        uint256 amountToTransfer = holdingStorage.getOfferTokenAmountPerHolder(bytes32(offerId));
        // Multiply the tokenAmountPerHolder by the time the the holder held the data
        amountToTransfer = amountToTransfer.mul((block.timestamp).sub(holdingStorage.getHolderPaymentTimestamp(bytes32(offerId), identity)));
        // Divide the tokenAmountPerHolder by the total time
        amountToTransfer = amountToTransfer.div(holdingStorage.getOfferHoldingTimeInMinutes(bytes32(offerId)).mul(60));

        if(amountToTransfer.add(holdingStorage.getHolderPaidAmount(bytes32(offerId), identity))
            >= holdingStorage.getHolderStakedAmount(bytes32(offerId), identity)) {

            amountToTransfer = holdingStorage.getHolderStakedAmount(bytes32(offerId), identity);
            amountToTransfer = amountToTransfer.sub(holdingStorage.getHolderPaidAmount(bytes32(offerId), identity));

            if (amountToTransfer == 0) return;
            // Offer is completed, release holder stake
            Profile(hub.getContractAddress("Profile")).releaseTokens(identity, holdingStorage.getHolderStakedAmount(bytes32(offerId), identity));
        }

        // Release tokens staked by holder and transfer tokens from data creator to holder
        Profile(hub.getContractAddress("Profile")).transferTokens(holdingStorage.getOfferCreator(bytes32(offerId)), identity, amountToTransfer);

        holdingStorage.setHolderPaymentTimestamp(bytes32(offerId), identity, block.timestamp);

        uint256 holderPaidAmount = holdingStorage.getHolderPaidAmount(bytes32(offerId), identity);
        holderPaidAmount = holderPaidAmount.add(amountToTransfer);
        holdingStorage.setHolderPaidAmount(bytes32(offerId), identity, holderPaidAmount);

        emit PaidOut(bytes32(offerId), identity, amountToTransfer);
    }

    function ecrecovery(bytes32 hash, bytes sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        if (sig.length != 65)
            return address(0);

        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, hash));

        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))

        // Here we are loading the last 32 bytes. We exploit the fact that
        // 'mload' will pad with zeroes if we overread.
        // There is no 'mload8' to do this, but that would be nicer.
            v := byte(0, mload(add(sig, 96)))
        }

        // geth uses [0, 1] and some clients have followed. This might change, see:
        //  https://github.com/ethereum/go-ethereum/issues/2053
        if (v < 27) v += 27;

        if (v != 27 && v != 28) return address(0);

        return ecrecover(prefixedHash, v, r, s);
    }

    function logs2(uint x) internal pure returns (uint y) {
        require(x > 0, "log(0) not allowed");
        assembly {
            let arg := x
            x := sub(x,1)
            x := or(x, div(x, 0x02))
            x := or(x, div(x, 0x04))
            x := or(x, div(x, 0x10))
            x := or(x, div(x, 0x100))
            x := or(x, div(x, 0x10000))
            x := or(x, div(x, 0x100000000))
            x := or(x, div(x, 0x10000000000000000))
            x := or(x, div(x, 0x100000000000000000000000000000000))
            x := add(x, 1)
            let m := mload(0x40)
            mstore(m,           0xf8f9cbfae6cc78fbefe7cdc3a1793dfcf4f0e8bbd8cec470b6a28a7a5a3e1efd)
            mstore(add(m,0x20), 0xf5ecf1b3e9debc68e1d9cfabc5997135bfb7a7a3938b7b606b5b4b3f2f1f0ffe)
            mstore(add(m,0x40), 0xf6e4ed9ff2d6b458eadcdf97bd91692de2d4da8fd2d0ac50c6ae9a8272523616)
            mstore(add(m,0x60), 0xc8c0b887b0a8a4489c948c7f847c6125746c645c544c444038302820181008ff)
            mstore(add(m,0x80), 0xf7cae577eec2a03cf3bad76fb589591debb2dd67e0aa9834bea6925f6a4a2e0e)
            mstore(add(m,0xa0), 0xe39ed557db96902cd38ed14fad815115c786af479b7e83247363534337271707)
            mstore(add(m,0xc0), 0xc976c13bb96e881cb166a933a55e490d9d56952b8d4e801485467d2362422606)
            mstore(add(m,0xe0), 0x753a6d1b65325d0c552a4d1345224105391a310b29122104190a110309020100)
            mstore(0x40, add(m, 0x100))
            let magic := 0x818283848586878898a8b8c8d8e8f929395969799a9b9d9e9faaeb6bedeeff
            let shift := 0x100000000000000000000000000000000000000000000000000000000000000
            let a := div(mul(x, magic), shift)
            y := div(mload(add(m,sub(255,a))), shift)
            y := add(y, mul(256, gt(arg, 0x8000000000000000000000000000000000000000000000000000000000000000)))
        }
    }
}

