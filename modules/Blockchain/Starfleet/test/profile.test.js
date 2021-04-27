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

var Web3 = require('web3');

var web3;

var Ganache = require('ganache-core');

// Global values
const amountToDeposit = (new BN(10)).pow(new BN(21));
const amountToWithdraw = (new BN(100));
const nodeId = '0x4cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

// Profile variables
var identities = [];

// Hepler variables
var errored = true;

// eslint-disable-next-line no-undef
contract('Profile contract testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Generate web3 and set provider
        web3 = new Web3('HTTP://127.0.0.1:7545');
        web3.setProvider(Ganache.provider());
    });

    // eslint-disable-next-line no-undef
    it('Should create 10 profiles with existing identities', async () => {
        // Get contracts used in hook
        const trac = await TracToken.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();

        var identities = [];
        for (var i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            identities[i] = await Identity.new(accounts[i], accounts[i], { from: accounts[i] });
        }

        var initialBalances = [];
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialBalances[i] = await trac.balanceOf.call(accounts[i]);
        }

        var promises = [];
        for (i = 0; i < accounts.length; i += 1) {
            promises[i] = trac.increaseApproval(
                profile.address,
                amountToDeposit,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);

        promises = [];
        for (i = 0; i < accounts.length; i += 1) {
            promises[i] = profile.createProfile(
                accounts[i],
                nodeId,
                amountToDeposit,
                true,
                identities[i].address,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);

        // Get new balances
        var newBalances = [];
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newBalances[i] = await trac.balanceOf.call(accounts[i]);
            assert(
                newBalances[i].eq(initialBalances[i].sub(amountToDeposit)),
                `Account balance for account ${i} does not match!`,
            );
        }

        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i].address);
            assert(
                amountToDeposit.eq(res.stake),
                `Stake deposited not matching for account ${i}!`,
            );
            assert.equal(
                res.stakeReserved,
                0,
                `Stake reserved not 0 for account ${i}!`,
            );
            assert.equal(
                res.reputation,
                0,
                `Reputation not 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalTimestamp,
                0,
                `Withdrawal timestamp not equal 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalAmount,
                0,
                `Withdrawal amount not 0 for account ${i}!`,
            );
            assert.equal(
                res.nodeId,
                nodeId,
                `NodeId not equal to the submitted for account ${i}!`,
            );
        }
    });

    // eslint-disable-next-line no-undef
    it('Should create 10 profiles without existing identities', async () => {
        // Get contracts used in hook
        const trac = await TracToken.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();

        var initialBalances = [];
        for (var i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialBalances[i] = await trac.balanceOf.call(accounts[i]);
        }

        var promises = [];
        for (i = 0; i < accounts.length; i += 1) {
            promises[i] = trac.increaseApproval(
                profile.address,
                amountToDeposit,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);

        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profile.createProfile(
                accounts[i],
                nodeId,
                amountToDeposit,
                false,
                '0x7e9f99b7971cb3de779690a82fec5e2ceec74dd0',
                { from: accounts[i] },
            );
            identities[i] = res.logs[0].args.newIdentity;
        }

        // Get new balances
        var newBalances = [];
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newBalances[i] = await trac.balanceOf.call(accounts[i]);
            assert(
                newBalances[i].eq(initialBalances[i].sub(amountToDeposit)),
                `Account balance for account ${i} does not match!`,
            );
        }

        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            assert(
                amountToDeposit.eq(res.stake),
                `Stake deposited not matching for account ${i}!`,
            );
            assert.equal(
                res.stakeReserved,
                0,
                `Stake reserved not 0 for account ${i}!`,
            );
            assert.equal(
                res.reputation,
                0,
                `Reputation not 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalTimestamp,
                0,
                `Withdrawal timestamp not equal 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalAmount,
                0,
                `Withdrawal amount not 0 for account ${i}!`,
            );
            assert.equal(
                res.nodeId,
                nodeId,
                `NodeId not equal to the submitted for account ${i}!`,
            );
        }
    });

    // eslint-disable-next-line no-undef
    it('Should deposit tokens to profile', async () => {
        // Get contracts used in hook
        const trac = await TracToken.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();

        var initialBalances = [];
        for (var i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialBalances[i] = await trac.balanceOf.call(accounts[i]);
        }

        var promises = [];
        for (i = 0; i < accounts.length; i += 1) {
            promises[i] = trac.increaseApproval(
                profile.address,
                amountToDeposit,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);

        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profile.depositTokens(
                identities[i],
                amountToDeposit,
                { from: accounts[i] },
            );
        }

        // Get new balances
        var newBalances = [];
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newBalances[i] = await trac.balanceOf.call(accounts[i]);
            assert(
                newBalances[i].eq(initialBalances[i].sub(amountToDeposit)),
                `Account balance for account ${i} does not match!`,
            );
        }

        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            assert(
                amountToDeposit.mul(new BN(2)).eq(res.stake),
                `Stake deposited not matching for account ${i}!`,
            );
            assert.equal(
                res.stakeReserved,
                0,
                `Stake reserved not 0 for account ${i}!`,
            );
            assert.equal(
                res.reputation,
                0,
                `Reputation not 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalTimestamp,
                0,
                `Withdrawal timestamp not equal 0 for account ${i}!`,
            );
            assert.equal(
                res.withdrawalAmount,
                0,
                `Withdrawal amount not 0 for account ${i}!`,
            );
            assert.equal(
                res.nodeId,
                nodeId,
                `NodeId not equal to the submitted for account ${i}!`,
            );
        }
    });

    // eslint-disable-next-line no-undef
    it('Should reserve tokens', async () => {
        // Get contracts used in hook
        const hub = await Hub.deployed();
        const holding = await Holding.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();

        var initialStakes = [];
        for (var i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialStakes[i] = await profileStorage.getStake.call(identities[i]);
        }
        var initialStakesReserved = [];
        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        await hub.setContractAddress('Holding', accounts[0]);

        const amountToReserve = new BN(100);
        await profileStorage.increaseStakesReserved(
            identities[0],
            identities[1],
            identities[2],
            identities[3],
            amountToReserve,
        );

        var newStakes = [];
        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newStakes[i] = await profileStorage.getStake.call(identities[i]);
        }
        var newStakesReserved = [];
        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        assert(initialStakes[0].eq(newStakes[0]), 'Stake changed for DC');
        assert(
            initialStakesReserved[0].add(amountToReserve.mul(new BN(3))).eq(newStakesReserved[0]),
            'Wrong amount of tokens reserved for DC',
        );
        for (i = 1; i < 4; i += 1) {
            assert(initialStakes[i].eq(newStakes[i]), `Stake changed for account ${i}!`);
            assert(
                initialStakesReserved[i].add(amountToReserve).eq(newStakesReserved[i]),
                `Wrong amount of tokens reserved for account ${i}!`,
            );
        }

        await hub.setContractAddress('Holding', holding.address);
    });

    // eslint-disable-next-line no-undef
    it('Should release tokens', async () => {
        // Get contracts used in hook
        const hub = await Hub.deployed();
        const holding = await Holding.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();

        var initialStakes = [];
        for (var i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialStakes[i] = await profileStorage.getStake.call(identities[i]);
        }
        var initialStakesReserved = [];
        for (i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        await hub.setContractAddress('Holding', accounts[0]);

        const amountToRelease = new BN(100);
        for (i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await profile.releaseTokens(identities[i], amountToRelease);
        }

        var newStakes = [];
        for (i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newStakes[i] = await profileStorage.getStake.call(identities[i]);
        }
        var newStakesReserved = [];
        for (i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        for (i = 1; i < 4; i += 1) {
            assert(initialStakes[i].eq(newStakes[i]), `Stake changed for account ${i}!`);
            assert(
                initialStakesReserved[i].sub(amountToRelease).eq(newStakesReserved[i]),
                `Wrong amount of tokens reserved for account ${i}!`,
            );
        }

        await hub.setContractAddress('Holding', holding.address);
    });

    // eslint-disable-next-line no-undef
    it('Should transfer tokens in profile contract', async () => {
        // Get contracts used in hook
        const hub = await Hub.deployed();
        const holding = await Holding.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();


        // Get initial balances
        var initialStakes = [];
        var initialStakesReserved = [];
        for (var i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialStakes[i] = await profileStorage.getStake.call(identities[i]);
            // eslint-disable-next-line no-await-in-loop
            initialStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        await hub.setContractAddress('Holding', accounts[0]);
        const amountToTransfer = new BN(100);

        // Execute tested function
        for (i = 1; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await profile.transferTokens(identities[0], identities[i], amountToTransfer);
        }

        var newStakes = [];
        var newStakesReserved = [];
        for (i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newStakes[i] = await profileStorage.getStake.call(identities[i]);
            // eslint-disable-next-line no-await-in-loop
            newStakesReserved[i] = await profileStorage.getStakeReserved.call(identities[i]);
        }

        assert(
            initialStakes[0].sub(amountToTransfer.mul(new BN(3))).eq(newStakes[0]),
            'Wrong amount of stake for DC!',
        );
        assert(
            initialStakesReserved[0].sub(amountToTransfer.mul(new BN(3))).eq(newStakesReserved[0]),
            'Wrong amount of tokens reserved for DC!',
        );
        for (i = 1; i < 4; i += 1) {
            assert(initialStakes[i].add(amountToTransfer).eq(newStakes[i]), `Wrong amount of stake for account ${i}!`);
            assert(
                initialStakesReserved[i].eq(newStakesReserved[i]),
                `Amount of tokens reserved for account ${i} has changed!`,
            );
        }

        await hub.setContractAddress('Holding', holding.address);
    });

    // eslint-disable-next-line no-undef
    it('Should start token withdrawal process', async () => {
        // Get contracts used in hook
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();
        const util = await TestingUtilities.deployed();

        // Set withdrawal time to 10 seconds for faster testing
        await profile.setWithdrawalTime(new BN(1));

        // Get initial balances
        var initialStakes = [];
        var initialStakesReserved = [];
        for (var i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            initialStakes[i] = res.stake;
            initialStakesReserved[i] = res.stakeReserved;
        }

        var timestamps = [];
        // Call tested function
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profile.startTokenWithdrawal(
                identities[i],
                amountToWithdraw,
                { from: accounts[i] },
            );
            // console.log(JSON.stringify(res));
            // eslint-disable-next-line no-await-in-loop
            timestamps[i] = await util.getBlockTimestamp.call();
        }

        // Get new balances
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            assert(
                initialStakes[i].eq(res.stake),
                `Stake not matching for account ${i}, expected ${initialStakes[i].toString()}, got ${res.stake.toString()}!`,
            );
            assert(
                initialStakesReserved[i].eq(res.stakeReserved),
                `Stake not matching for account ${i}, expected ${initialStakesReserved[i].toString()}, got ${res.stakeReserved.toString()}!`,
            );
            assert(
                timestamps[i].add(new BN(10)).gte(res.withdrawalTimestamp),
                `Withdrawal timestamp incorrect for account ${i}!`,
            );
            assert(
                !(new BN(0)).eq(res.withdrawalTimestamp),
                `Withdrawal timestamp not set for account ${i}!`,
            );
            assert(
                amountToWithdraw.eq(res.withdrawalAmount),
                `Withdrawal amount not set for account ${i}!`,
            );
            assert.equal(
                res.withdrawalPending,
                true,
                `Withdrawal flag not set for account ${i}!`,
            );
        }

        // Revert profile withdrawal time to its initial value
        await profile.setWithdrawalTime(new BN(300));

        errored = false;
    });

    // eslint-disable-next-line no-undef
    it('Should complete token withdrawal process', async () => {
        // Get contracts used in hook
        const trac = await TracToken.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();
        const util = await TestingUtilities.deployed();

        if (errored) assert(false, 'No use of running a test after previous test failed');
        // Wait other half of the withdrawal delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get initial balances
        var initialBalances = [];
        var initialStakes = [];
        var initialStakesReserved = [];
        for (var i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            initialBalances[i] = await trac.balanceOf.call(accounts[i]);
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            initialStakes[i] = res.stake;
            initialStakesReserved[i] = res.stakeReserved;
        }

        // Call tested function
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await profile.withdrawTokens(identities[i], { from: accounts[i] });
        }

        // Get new balances
        var newBalances = [];
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            newBalances[i] = await trac.balanceOf.call(accounts[i]);
            // eslint-disable-next-line no-await-in-loop
            const res = await profileStorage.profile.call(identities[i]);
            assert(
                newBalances[i].eq(initialBalances[i].add(amountToWithdraw)),
                `Account balance for account ${i} does not match!`,
            );
            assert(
                initialStakes[i].sub(amountToWithdraw).eq(res.stake),
                `Stake not matching for account ${i}, expected ${initialStakes[i].sub(amountToWithdraw).toString()}, got ${res.stake.toString()}!`,
            );
            assert(
                initialStakesReserved[i].eq(res.stakeReserved),
                `Stake not matching for account ${i}, expected ${initialStakesReserved[i].toString()}, got ${res.stakeReserved.toString()}!`,
            );
            assert.equal(
                res.withdrawalPending,
                false,
                `Withdrawal flag not reset for account ${i}!`,
            );
        }
    });

    // eslint-disable-next-line no-undef
    it('Should test withdrawal of entire balance', async () => {
        // Get contracts used in hook
        const trac = await TracToken.deployed();
        const profile = await Profile.deployed();
        const profileStorage = await ProfileStorage.deployed();
        const util = await TestingUtilities.deployed();

        // Set withdrawal time to 10 seconds for faster testing
        await profile.setWithdrawalTime(new BN(1));

        // Get initial balances
        let res = await profileStorage.profile.call(identities[0]);
        const initialStake = res.stake;
        const initialStakeReserved = res.stakeReserved;
        const initialBalance = await trac.balanceOf.call(accounts[0]);
        const availableForWithdrawal = initialStake.sub(initialStakeReserved);

        res = await profile.startTokenWithdrawal(
            identities[0],
            availableForWithdrawal,
            { from: accounts[0] },
        );

        await new Promise(resolve => setTimeout(resolve, 2000));

        await profile.withdrawTokens(identities[0], { from: accounts[0] });

        // eslint-disable-next-line no-await-in-loop
        const newBalance = await trac.balanceOf.call(accounts[0]);
        // eslint-disable-next-line no-await-in-loop
        res = await profileStorage.profile.call(identities[0]);
        assert(
            newBalance.eq(initialBalance.add(availableForWithdrawal)),
            `Account balance does not match, expected ${initialBalance.add(availableForWithdrawal).toString()}, got ${newBalance.toString()}`,
        );
        assert(
            initialStake.sub(availableForWithdrawal).eq(res.stake),
            `Stake not matching, expected ${initialStake.sub(availableForWithdrawal).toString()}, got ${res.stake.toString()}!`,
        );
        assert(
            (res.stake.sub(res.stakeReserved)).isZero(),
            `Entire available balance not withdrawn! ${res.stake.sub(res.stakeReserved)} Abrashkins still available!`,
        );
        assert(
            initialStakeReserved.eq(res.stakeReserved),
            `Stake not matching, expected ${initialStakeReserved.toString()}, got ${res.stakeReserved.toString()}!`,
        );
        assert.equal(
            res.withdrawalPending,
            false,
            'Withdrawal flag not reset!',
        );
    });
});
