var BN = require('bn.js'); // eslint-disable-line no-undef
const { assert, expect } = require('chai');

var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef
var TracToken = artifacts.require('TracToken'); // eslint-disable-line no-undef

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef

var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Holding = artifacts.require('Holding'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef
var Reading = artifacts.require('Reading'); // eslint-disable-line no-undef

var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

// Helper variables
var amountToTransfer = (new BN(5)).mul(new BN(10).pow(new BN(10)));
const emptyHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Profile variables
const profileId = '0x0000000000000000000000000000000000000000';
const stake = new BN(31000);
const stakeReserved = new BN(29200);
const reputation = new BN(32191);
const withdrawalTimestamp = new BN(34291);
const withdrawalAmount = new BN(989123);
const nodeId = '0x5cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

// Contract used in contract
var trac;
var hub;
var profile;
var profileStorage;

// eslint-disable-next-line no-undef
contract('Profile storage testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        trac = await TracToken.deployed();
        hub = await Hub.deployed();
        profile = await Profile.deployed();
        profileStorage = await ProfileStorage.deployed();

        // Set accounts[0] as profile contract so it can execute functions
        await hub.setContractAddress('Profile', accounts[0]);
    });

    // eslint-disable-next-line no-undef
    after(async () => {
        // Revert Holding contract address in hub contract
        await hub.setContractAddress('Profile', profile.address);
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile stake', async () => {
        const initialProfileStake = await profileStorage.getStake.call(profileId);

        assert(initialProfileStake.isZero(), 'Initial profile stake in Profile storage must be 0!');

        // Execute tested function
        await profileStorage.setStake(profileId, stake);

        const newProfileStake = await profileStorage.getStake.call(profileId);

        assert(
            newProfileStake.eq(stake),
            `Incorrect token amount per holder written in Profile storage, got ${newProfileStake.toString()} instead of ${stake.toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile stake reserved', async () => {
        const initialProfileStakeReserved =
            await profileStorage.getStakeReserved.call(profileId);

        assert(initialProfileStakeReserved.isZero(), 'Initial profile stake reserved in Profile storage must be 0!');

        // Execute tested function
        await profileStorage.setStakeReserved(profileId, stakeReserved);

        const newProfileStakeReserved =
            await profileStorage.getStakeReserved.call(profileId);

        assert(
            newProfileStakeReserved.eq(stakeReserved),
            `Incorrect stake reserved written in profile storage, got ${newProfileStakeReserved.toString()} instead of ${stakeReserved.toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile reputation', async () => {
        const initialProfileReputation =
            await profileStorage.getReputation.call(profileId);

        assert(initialProfileReputation.isZero(), 'Initial profile reputation in Profile storage must be 0!');

        // Execute tested function
        await profileStorage.setReputation(profileId, reputation);

        const newProfileReputation =
            await profileStorage.getReputation.call(profileId);

        assert(
            newProfileReputation.eq(reputation),
            `Incorrect reputation written in Profile storage, got ${newProfileReputation.toString()} instead of ${reputation.toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile withdrawal pending', async () => {
        const initialProfileWithdrawalPending =
            await profileStorage.getWithdrawalPending.call(profileId);

        assert(!initialProfileWithdrawalPending, 'Initial profile withdrawal pending in Profile storage must be false!');

        // Execute tested function
        await profileStorage.setWithdrawalPending(profileId, true);

        const newProfileWithdrawalPending =
            await profileStorage.getWithdrawalPending.call(profileId);

        assert(
            newProfileWithdrawalPending,
            'Incorrect withdrawal pending status written in Profile storage!',
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile withdrawal timestamp', async () => {
        const initialProfileWithdrawalTimestamp =
            await profileStorage.getWithdrawalTimestamp.call(profileId);

        assert(initialProfileWithdrawalTimestamp.isZero(), 'Initial profile withdrawal timestamp in Profile storage must be 0!');

        // Execute tested function
        await profileStorage.setWithdrawalTimestamp(profileId, withdrawalTimestamp);

        const newProfileWithdrawalTimestamp =
            await profileStorage.getWithdrawalTimestamp.call(profileId);

        assert(
            newProfileWithdrawalTimestamp.eq(withdrawalTimestamp),
            `Incorrect withdrawal timestamp written in Profile storage, got ${newProfileWithdrawalTimestamp.toString()} instead of ${withdrawalTimestamp.toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile withdrawal amount', async () => {
        const initialProfileWithdrawalAmount =
            await profileStorage.getWithdrawalAmount.call(profileId);

        assert(initialProfileWithdrawalAmount.isZero(), 'Initial profile withdrawal amount in Profile storage must be 0!');

        // Execute tested function
        await profileStorage.setWithdrawalAmount(profileId, withdrawalAmount);

        const newProfileWithdrawalAmount =
            await profileStorage.getWithdrawalAmount.call(profileId);

        assert(
            newProfileWithdrawalAmount.eq(withdrawalAmount),
            `Incorrect withdrawal amount written in Profile storage, got ${newProfileWithdrawalAmount.toString()} instead of ${withdrawalAmount.toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Should set and get profile nodeId', async () => {
        const initialNodeId = await profileStorage.getNodeId.call(profileId);

        assert.equal(initialNodeId, emptyHash, 'Initial nodeId in Holding storage must be 0!');

        // Execute tested function
        await profileStorage.setNodeId(profileId, nodeId);

        const newNodeId = await profileStorage.getNodeId.call(profileId);

        assert.equal(newNodeId, nodeId, 'Incorrect dataSet ID written in Holding storage!');
    });

    // eslint-disable-next-line no-undef
    it('Should set stake reserved using increaseStakesReserved function', async () => {
        var initialProfileStakesReserved = [];
        for (var i = 0; i < 4; i += 1) {
            initialProfileStakesReserved[i] =
                // eslint-disable-next-line no-await-in-loop
                await profileStorage.getStakeReserved.call(accounts[i]);
        }

        // Execute tested function
        await profileStorage.increaseStakesReserved(
            accounts[0],
            accounts[1],
            accounts[2],
            accounts[3],
            stakeReserved,
        );

        var newProfileStakesReserved = [];
        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newProfileStakesReserved[i] = await profileStorage.getStakeReserved.call(accounts[i]);
            if (i !== 0) {
                assert(
                    newProfileStakesReserved[i]
                        .eq(initialProfileStakesReserved[i].add(stakeReserved)),
                    `Incorrect stake reserved written in profile storage, got ${newProfileStakesReserved[i].toString()} 
                        instead of ${initialProfileStakesReserved[i].add(stakeReserved).toString()}!`,
                );
            }
        }

        assert(
            newProfileStakesReserved[0]
                .eq(initialProfileStakesReserved[0].add(stakeReserved.mul(new BN(3)))),
            `Incorrect stake reserved written in profile storage, got ${newProfileStakesReserved[0].toString()} 
                instead of ${initialProfileStakesReserved[0].add(stakeReserved.mul(new BN(3))).toString()}!`,
        );

        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await profileStorage.setStakeReserved(accounts[i], initialProfileStakesReserved[i]);
        }
    });

    // eslint-disable-next-line no-undef
    it('Should transfer tokens from smart contract to an account', async () => {
        const initialContractBalance = await trac.balanceOf.call(profileStorage.address);
        const initialSenderBalance = await trac.balanceOf.call(accounts[0]);

        assert(initialSenderBalance.gte(amountToTransfer), 'Sender does not have enough funds to transfer');

        await trac.transfer(profileStorage.address, amountToTransfer, { from: accounts[0] });

        const secondContractBalance = await trac.balanceOf.call(profileStorage.address);
        assert(
            secondContractBalance.eq(initialContractBalance.add(amountToTransfer)),
            `Incorrect amount sent to Profile Storage contract! 
            Got ${secondContractBalance.toString()} instead of ${initialContractBalance.add(amountToTransfer).toString()}`,
        );

        const secondSenderBalance = await trac.balanceOf.call(accounts[0]);
        assert(
            secondSenderBalance.eq(initialSenderBalance.sub(amountToTransfer)),
            `Incorrect amount taken from sender account 
            Got ${secondSenderBalance.toString()} instead of ${initialSenderBalance.sub(amountToTransfer).toString()}`,
        );

        // Execute tested function
        await profileStorage.transferTokens(accounts[0], amountToTransfer);

        const finalContractBalance = await trac.balanceOf.call(profileStorage.address);
        assert(
            finalContractBalance.eq(initialContractBalance),
            `Incorrect final balance of Profile Storage contract! 
            Got ${finalContractBalance.toString()} instead of ${initialContractBalance.toString()}`,
        );
        const finalSenderBalance = await trac.balanceOf.call(accounts[0]);
        assert(
            finalSenderBalance.eq(initialSenderBalance),
            `Incorrect final balance of sender account! 
            Got ${finalSenderBalance.toString()} instead of ${initialSenderBalance.toString()}`,
        );
    });
});
