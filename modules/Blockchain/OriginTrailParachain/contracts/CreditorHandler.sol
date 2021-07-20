pragma solidity ^0.4.25;

import './Hub.sol';
import {ERC725} from './ERC725.sol';
import {Profile} from './Profile.sol';
import {ProfileStorage} from './ProfileStorage.sol';
import {HoldingStorage} from './HoldingStorage.sol';
import {SafeMath} from './SafeMath.sol';

/**
 * The CreditorHandler contract handles funds and requirements when an offer is finalized using
 * creditor funds
 */
contract CreditorHandler {
	using SafeMath for uint256;

    Hub public hub;
	constructor(address hubAddress) public{
		require(hubAddress!=address(0));
        hub = Hub(hubAddress);
	}

	function setHubAddress(address newHubAddress) public{
        require(hub.isContract(msg.sender), "This function can only be called by contracts or their creator!");

        hub = Hub(newHubAddress);
    }

    modifier onlyContracts() {
        require(hub.isContract(msg.sender),
        "Function can only be called by contracts!");
        _;
    }

    modifier verifyParent(address identity, address parentIdentity) {
        require(ERC725(parentIdentity).keyHasPurpose(keccak256(abi.encodePacked(identity)), 237),
        "Sender identity is not a sub-identity of the provided parent identity!");
        _;
    }

    function transferCredit(address identity, address parentIdentity, uint256 amount)
    internal {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint256 currentStake = profileStorage.getStake(parentIdentity);
        profileStorage.setStake(parentIdentity, currentStake.sub(amount));

        currentStake = profileStorage.getStake(identity);
        profileStorage.setStake(identity, currentStake.add(amount));
    }

    function finalizeOffer(uint256 offerId, address identity, address parentIdentity)
    public onlyContracts verifyParent(identity, parentIdentity) {
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        uint256 jobCost = HoldingStorage(hub.getContractAddress("HoldingStorage")).getOfferTokenAmountPerHolder(bytes32(offerId)).mul(3);
        uint256 minimalStake = Profile(hub.getContractAddress("Profile")).minimalStake();

        if(profileStorage.getWithdrawalPending(parentIdentity) && profileStorage.getWithdrawalAmount(parentIdentity).add(jobCost) > profileStorage.getStake(parentIdentity) - profileStorage.getStakeReserved(parentIdentity)) {
            profileStorage.setWithdrawalPending(parentIdentity,false);
        }

    	require(minimalStake <= profileStorage.getStake(parentIdentity).sub(profileStorage.getStakeReserved(parentIdentity)),
            "Parent identity does not have enough stake to create new jobs!");

    	// Transferring funds
        require(profileStorage.getStake(parentIdentity).sub(profileStorage.getStakeReserved(parentIdentity)) >= jobCost,
            "Parent identity does not have enough stake for reserving!");

        transferCredit(identity, parentIdentity, jobCost);
    }
}
