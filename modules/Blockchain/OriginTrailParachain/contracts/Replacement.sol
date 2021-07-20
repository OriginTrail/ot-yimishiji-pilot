pragma solidity ^0.4.25;

import {SafeMath} from "./SafeMath.sol";
import {ERC725} from './ERC725.sol';
import {Hub} from "./Hub.sol";
import {Holding} from "./Holding.sol";
import {Profile} from "./Profile.sol";
import {HoldingStorage} from "./HoldingStorage.sol";
import {ProfileStorage} from "./ProfileStorage.sol";
import {LitigationStorage} from "./LitigationStorage.sol";

/**
 * The Replacement contract
 * Used for replacing a holder after a successful litigation
 */
contract Replacement {
	using SafeMath for uint256;

	Hub public hub;
	constructor (address hubAddress) public {
		require (hubAddress != address(0), "Hub contract address cannot be 0!");
		hub = Hub(hubAddress);
	}

	event ReplacementCompleted(bytes32 offerId, address challengerIdentity, address chosenHolder);

    function replaceHolder(bytes32 offerId, address holderIdentity, address litigatorIdentity, uint256 shift,
        bytes confirmation1, bytes confirmation2, bytes confirmation3, address[] replacementHolderIdentity)
    public {
        HoldingStorage holdingStorage = HoldingStorage(hub.getContractAddress("HoldingStorage"));
        LitigationStorage litigationStorage = LitigationStorage(hub.getContractAddress("LitigationStorage"));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        
        require(holdingStorage.getOfferCreator(offerId) == litigatorIdentity, "Challenger identity not equal to offer creator identity!");
        require(ERC725(litigatorIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2), "Sender does not have action purpose set!");
        require(litigationStorage.getLitigationLitigatorIdentity(offerId, holderIdentity) == litigatorIdentity, "Holder can only be replaced by the litigator who initiated the litigation!");

        LitigationStorage.LitigationStatus litigationStatus = litigationStorage.getLitigationStatus(offerId, holderIdentity);

        require(litigationStatus == LitigationStorage.LitigationStatus.replacing, "Litigation not in status replacing, cannot replace holder!");

        // Check if signatures match identities
        require(ERC725(replacementHolderIdentity[0]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(replacementHolderIdentity[0]))), confirmation1))), 4), "Wallet from holder 1 does not have encryption approval!");
        require(ERC725(replacementHolderIdentity[1]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(replacementHolderIdentity[1]))), confirmation2))), 4), "Wallet from holder 2 does not have encryption approval!");
        require(ERC725(replacementHolderIdentity[2]).keyHasPurpose(keccak256(abi.encodePacked(ecrecovery(keccak256(abi.encodePacked(offerId,uint256(replacementHolderIdentity[2]))), confirmation3))), 4), "Wallet from holder 3 does not have encryption approval!");

        checkTask(offerId, replacementHolderIdentity, holderIdentity, shift);

        // Set new holders
        require(profileStorage.getStake(replacementHolderIdentity[block.timestamp % 3]).sub(profileStorage.getStakeReserved(replacementHolderIdentity[block.timestamp % 3])) 
            >= holdingStorage.getHolderStakedAmount(offerId, holderIdentity).sub(holdingStorage.getHolderPaidAmount(offerId, holderIdentity)),
            "Replacement holder does not have stake available to take this job!");
        require(profileStorage.getStake(replacementHolderIdentity[block.timestamp % 3]) >= Profile(hub.getContractAddress("Profile")).minimalStake(),
            "Replacement holder does not have the minimal required stake available to take any new job!");
        
        require(holdingStorage.getHolderStakedAmount(offerId, replacementHolderIdentity[block.timestamp % 3]) == 0, 
            "Replacement holder was or is already a holder for this data, cannot be set as a new holder!");
    
        setUpHolders(offerId, holderIdentity, litigatorIdentity, replacementHolderIdentity[block.timestamp % 3]);
        // Set litigation status
        litigationStorage.setLitigationStatus(offerId, holderIdentity, LitigationStorage.LitigationStatus.replaced);
        emit ReplacementCompleted(offerId, litigatorIdentity, replacementHolderIdentity[block.timestamp % 3]);
    }

    function checkTask(bytes32 offerId, address[] replacementHolderIdentity, address holderIdentity, uint256 shift)
    internal {
        LitigationStorage litigationStorage = LitigationStorage(hub.getContractAddress("LitigationStorage"));

        bytes32[3] memory hashes;

        hashes[0] = keccak256(abi.encodePacked(replacementHolderIdentity[0], litigationStorage.getLitigationReplacementTask(bytes32(offerId), holderIdentity)));
        hashes[1] = keccak256(abi.encodePacked(replacementHolderIdentity[1], litigationStorage.getLitigationReplacementTask(bytes32(offerId), holderIdentity)));
        hashes[2] = keccak256(abi.encodePacked(replacementHolderIdentity[2], litigationStorage.getLitigationReplacementTask(bytes32(offerId), holderIdentity)));

        require(uint256(hashes[0]) < uint256(hashes[1]) && uint256(hashes[1]) < uint256(hashes[2]), "Solution hashes are not sorted!");

        // Verify task answer
        require(((keccak256(abi.encodePacked(hashes[0], hashes[1], hashes[2])) >> (shift * 4)) & bytes32((2 ** (4 * litigationStorage.getLitigationReplacementDifficulty(bytes32(offerId), holderIdentity))) - 1)) == litigationStorage.getLitigationReplacementTask(bytes32(offerId), holderIdentity), "Submitted identities do not answer the task correctly!");
    }

    function setUpHolders(bytes32 offerId, address holderIdentity, address litigatorIdentity, address replacementHolderIdentity)
    internal {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));
        HoldingStorage holdingStorage = HoldingStorage(hub.getContractAddress("HoldingStorage"));

        holdingStorage.setHolderLitigationEncryptionType(offerId, replacementHolderIdentity, holdingStorage.getHolderLitigationEncryptionType(offerId, holderIdentity));

        uint256 newStakedAmount = holdingStorage.getHolderStakedAmount(offerId, holderIdentity).sub(holdingStorage.getHolderPaidAmount(offerId, holderIdentity));
        // Reserve new holder stake in their profile
        profileStorage.setStakeReserved(
            replacementHolderIdentity,
            profileStorage.getStakeReserved(replacementHolderIdentity).add(newStakedAmount)
        );
        
        // Remove the previous holder's stake and move it to the litigator
        // Remove holder stake from reserved
        profileStorage.setStakeReserved(
            holderIdentity,
            profileStorage.getStakeReserved(holderIdentity).sub(holdingStorage.getHolderStakedAmount(offerId, holderIdentity))
        );
        // Remove holder stake
        profileStorage.setStake(
            holderIdentity,
            profileStorage.getStake(holderIdentity).sub(holdingStorage.getHolderStakedAmount(offerId, holderIdentity))
        );
        // Add stake to litigator
        profileStorage.setStake(
            litigatorIdentity,
            profileStorage.getStake(litigatorIdentity).add(holdingStorage.getHolderStakedAmount(offerId, holderIdentity))
        );
        
        // Set new holder staked amounts
        holdingStorage.setHolderStakedAmount(offerId, replacementHolderIdentity, newStakedAmount);
      
        // Set payment timestamps for new holders
        holdingStorage.setHolderPaymentTimestamp(offerId, replacementHolderIdentity, block.timestamp);
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

    function logs2(uint x) internal pure returns (uint y){
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
