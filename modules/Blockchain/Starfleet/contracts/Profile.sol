pragma solidity ^0.4.23;

import {SafeMath} from './SafeMath.sol';
import {ProfileStorage} from './ProfileStorage.sol';
import {Ownable, Hub} from './Hub.sol';
import {Identity, ERC725} from './Identity.sol';
import {ERC20} from './TracToken.sol';


contract Profile {
    using SafeMath for uint256;
    Hub public hub;

    uint256 public version = 101;

    uint256 public minimalStake = 3*10**21;
    uint256 public withdrawalTime = 5 minutes;

    constructor(address hubAddress) public {
        require(hubAddress != address(0));
        hub = Hub(hubAddress);
    }

    modifier onlyHolding(){
        require(msg.sender == hub.getContractAddress("Holding"),
        "Function can only be called by Holding contract!");
        _;
    }

    event ProfileCreated(address profile, uint256 initialBalance);
    event IdentityCreated(address profile, address newIdentity);
    event IdentityTransferred(bytes20 nodeId, address oldIdentity, address newIdentity);
    event TokenDeposit(address profile, uint256 amount);

    event TokensDeposited(address profile, uint256 amountDeposited, uint256 newBalance);
    event TokensReserved(address profile, uint256 amountReserved);

    event WithdrawalInitiated(address profile, uint256 amount, uint256 withdrawalDelayInSeconds);
    event TokenWithdrawalCancelled(address profile);
    event TokensWithdrawn(address profile, uint256 amountWithdrawn, uint256 newBalance);

    event TokensReleased(address profile, uint256 amount);
    event TokensTransferred(address sender, address receiver, uint256 amount);

    function createProfile(address managementWallet, bytes32 profileNodeId, uint256 initialBalance, bool senderHas725, address identity) public {
        require(managementWallet!=address(0));
        ERC20 tokenContract = ERC20(hub.tokenAddress());
        require(tokenContract.allowance(msg.sender, this) >= initialBalance, "Sender allowance must be equal to or higher than initial balance");
        require(tokenContract.balanceOf(msg.sender) >= initialBalance, "Sender balance must be equal to or higher than initial balance!");
        require(uint256(profileNodeId) != 0, "Cannot create a profile without a nodeId submitted");

        tokenContract.transferFrom(msg.sender, hub.getContractAddress("ProfileStorage"), initialBalance);

        if(!senderHas725) {
            Identity newIdentity = new Identity(msg.sender, managementWallet);
            emit IdentityCreated(msg.sender, address(newIdentity));

            ProfileStorage(hub.getContractAddress("ProfileStorage")).setStake(address(newIdentity), initialBalance);
            ProfileStorage(hub.getContractAddress("ProfileStorage")).setNodeId(address(newIdentity), profileNodeId);

            emit ProfileCreated(address(newIdentity), initialBalance);
        }
        else {
            // Verify sender
            require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2),  "Sender does not have action permission for identity!");

            ProfileStorage(hub.getContractAddress("ProfileStorage")).setStake(identity, initialBalance);
            ProfileStorage(hub.getContractAddress("ProfileStorage")).setNodeId(identity, profileNodeId);

            emit ProfileCreated(identity, initialBalance);
        }

        if(initialBalance > minimalStake) {
            uint256 activeNodes = ProfileStorage(hub.getContractAddress("ProfileStorage")).activeNodes();
            activeNodes += 1;
            ProfileStorage(hub.getContractAddress("ProfileStorage")).setActiveNodes(activeNodes);
        }
    }

    function transferProfile(address oldIdentity, address managementWallet) public returns(address){
        require(ERC725(oldIdentity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");
        require(managementWallet != address(0));

        Identity newIdentity = new Identity(msg.sender, managementWallet);
        emit IdentityCreated(msg.sender, address(newIdentity));

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        profileStorage.setStake(address(newIdentity), profileStorage.getStake(oldIdentity));
        profileStorage.setStakeReserved(address(newIdentity), profileStorage.getStakeReserved(oldIdentity));
        profileStorage.setNodeId(address(newIdentity), profileStorage.getNodeId(oldIdentity));
        profileStorage.setReputation(address(newIdentity), profileStorage.getReputation(oldIdentity));

        if(profileStorage.getWithdrawalPending(oldIdentity)){
            emit TokenWithdrawalCancelled(oldIdentity);
            profileStorage.setWithdrawalPending(oldIdentity, false);
        }

        profileStorage.setStake(oldIdentity, 0);
        profileStorage.setStakeReserved(oldIdentity, 0);
        profileStorage.setNodeId(oldIdentity, bytes32(0));
        profileStorage.setReputation(oldIdentity, 0);

        emit IdentityTransferred(bytes20(profileStorage.getNodeId(address(newIdentity))), oldIdentity, address(newIdentity));
        return address(newIdentity);
    }

    function depositTokens(address identity, uint256 amount) public {
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        ERC20 tokenContract = ERC20(hub.getContractAddress("Token"));
        require(tokenContract.allowance(msg.sender, this) >= amount, "Sender allowance must be equal to or higher than chosen amount");
        require(tokenContract.balanceOf(msg.sender) >= amount, "Sender balance must be equal to or higher than chosen amount!");

        tokenContract.transferFrom(msg.sender, address(profileStorage), amount);

        profileStorage.setStake(identity, profileStorage.getStake(identity).add(amount));

        emit TokensDeposited(identity, amount, profileStorage.getStake(identity));
    }

    function startTokenWithdrawal(address identity, uint256 amount) public {
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getWithdrawalPending(identity) == false, "Withrdrawal process already pending!");

        uint256 availableBalance = profileStorage.getStake(identity).sub(profileStorage.getStakeReserved(identity));

        profileStorage.setWithdrawalPending(identity, true);
        profileStorage.setWithdrawalTimestamp(identity, block.timestamp + withdrawalTime);
        if(availableBalance >= amount) {
            // Reserve chosen token amount
            profileStorage.setWithdrawalAmount(identity, amount);
            emit WithdrawalInitiated(identity, amount, withdrawalTime);
        }
        else {
            // Reserve only the available balance
            profileStorage.setWithdrawalAmount(identity, availableBalance);
            emit WithdrawalInitiated(identity, availableBalance, withdrawalTime);
        }
    }

    function withdrawTokens(address identity) public {
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getWithdrawalPending(identity) == true, "Cannot withdraw tokens before starting token withdrawal!");
        require(profileStorage.getWithdrawalTimestamp(identity) < block.timestamp, "Cannot withdraw tokens before withdrawal timestamp!");

        // Transfer already reserved tokens to user identity
        profileStorage.transferTokens(msg.sender, profileStorage.getWithdrawalAmount(identity));
        
        profileStorage.setStake(
            identity,
            profileStorage.getStake(identity).sub(profileStorage.getWithdrawalAmount(identity))
        );

        profileStorage.setWithdrawalPending(identity, false);
        
        emit TokensWithdrawn(
            identity,
            profileStorage.getWithdrawalAmount(identity),
            profileStorage.getStake(identity)
        );
    }

    function setNodeId(address identity, bytes32 newNodeId)
    public {
         // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2),
            "Sender does not have action permission for submitted identity");
        require(uint256(newNodeId) != 0, "Cannot set a blank nodeId");

        ProfileStorage(hub.getContractAddress("ProfileStorage")).setNodeId(identity, newNodeId);
    }

    function releaseTokens(address profile, uint256 amount)
    public onlyHolding {
        require(profile!=address(0));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getStakeReserved(profile) >= amount, "Cannot release more tokens than there are reserved");

        profileStorage.setStakeReserved(profile, profileStorage.getStakeReserved(profile).sub(amount));

        emit TokensReleased(profile, amount);
    }
    
    function transferTokens(address sender, address receiver, uint256 amount)
    public onlyHolding {
        require(sender!=address(0) && receiver!=address(0));
        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(profileStorage.getStake(sender) >= amount, "Sender does not have enough tokens to transfer!");
        require(profileStorage.getStakeReserved(sender) >= amount, "Sender does not have enough tokens reserved to transfer!");

        profileStorage.setStakeReserved(sender, profileStorage.getStakeReserved(sender).sub(amount));
        profileStorage.setStake(sender, profileStorage.getStake(sender).sub(amount));
        profileStorage.setStake(receiver, profileStorage.getStake(receiver).add(amount));

        emit TokensTransferred(sender, receiver, amount);
    }

    function setMinimalStake(uint256 newMinimalStake) 
    public {
        require (msg.sender == hub.owner(), "Function can only be called by hub owner!");
        if(minimalStake != newMinimalStake) minimalStake = newMinimalStake;
    }

    function setWithdrawalTime(uint256 newWithdrawalTime) 
    public {
        require (msg.sender == hub.owner(), "Function can only be called by hub owner!");
        if(withdrawalTime != newWithdrawalTime) withdrawalTime = newWithdrawalTime;
    }
}