pragma solidity ^0.4.23;

import {SafeMath} from './SafeMath.sol';
import {ProfileStorage} from './ProfileStorage.sol';
import {Ownable, Hub} from './Hub.sol';
import {Identity, ERC725} from './Identity.sol';


contract Profile {
    using SafeMath for uint256;
    Hub public hub;

    uint256 public version = 201;

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

    function createProfile(address managementWallet, bytes32 profileNodeId, address identity)
    public payable {
        require(managementWallet!=address(0));
        require(msg.value > 0, "Cannot deposit 0 tokens!");
        require(uint256(profileNodeId) != 0, "Cannot create a profile without a nodeId submitted");

        hub.getContractAddress("ProfileStorage").transfer(msg.value);
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 2),  "Sender does not have action permission for identity!");

        ProfileStorage(hub.getContractAddress("ProfileStorage")).setStake(identity, msg.value);
        ProfileStorage(hub.getContractAddress("ProfileStorage")).setNodeId(identity, profileNodeId);

        emit ProfileCreated(identity, msg.value);

        if(msg.value > minimalStake) {
            uint256 activeNodes = ProfileStorage(hub.getContractAddress("ProfileStorage")).activeNodes();
            activeNodes += 1;
            ProfileStorage(hub.getContractAddress("ProfileStorage")).setActiveNodes(activeNodes);
        }
    }

    function depositTokens(address identity) public payable {
        // Verify sender
        require(ERC725(identity).keyHasPurpose(keccak256(abi.encodePacked(msg.sender)), 1),  "Sender does not have management permission for identity!");

        ProfileStorage profileStorage = ProfileStorage(hub.getContractAddress("ProfileStorage"));

        require(msg.value > 0, "Cannot deposit 0 tokens!");

        hub.getContractAddress("ProfileStorage").transfer(msg.value);

        profileStorage.setStake(identity, profileStorage.getStake(identity).add(msg.value));

        emit TokensDeposited(identity, msg.value, profileStorage.getStake(identity));
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

        if(profileStorage.getStake(identity) < minimalStake) {
            uint256 activeNodes = ProfileStorage(hub.getContractAddress("ProfileStorage")).activeNodes();
            activeNodes -= 1;
            ProfileStorage(hub.getContractAddress("ProfileStorage")).setActiveNodes(activeNodes);
        }

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