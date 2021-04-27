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

// Helper variables
var errored = true;
var DC_identity;
var DC_wallet;
var offerId;
var tokensToDeposit = (new BN(100)).mul(new BN(10).pow(new BN(21)));
const emptyAddress = '0x0000000000000000000000000000000000000000';


// Offer variables
const dataSetId = '0x8cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const dataRootHash = '0x1cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const redLitigationHash = '0x2cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const greenLitigationHash = '0x3cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const blueLitigationHash = '0x4cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const dcNodeId = '0x5cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const holdingTimeInMinutes = new BN(1);
const tokenAmountPerHolder = new BN(1200);
const dataSetSizeInBytes = new BN(1024);
const litigationIntervalInMinutes = new BN(10);

// Profile variables
var privateKeys = [];
var identities = [];

// Contracts used in test
var hub;
var trac;
var profile;
var holding;
var holdingStorage;
var profileStorage;
var util;

async function createOffer(accounts) {
    await holdingStorage.setDifficultyOverride(new BN(1));

    let res = await holding.createOffer(
        DC_identity,
        dataSetId,
        dataRootHash,
        redLitigationHash,
        greenLitigationHash,
        blueLitigationHash,
        dcNodeId,
        holdingTimeInMinutes,
        tokenAmountPerHolder,
        dataSetSizeInBytes,
        litigationIntervalInMinutes,
        { from: DC_wallet },
    );
    const firstOfferGasUsage = res.receipt.gasUsed;

    // eslint-disable-next-line prefer-destructuring
    offerId = res.logs[0].args.offerId;

    const task = await holdingStorage.getOfferTask.call(offerId);

    const hash1 = await util.keccakAddressBytes(identities[0], task);
    const hash2 = await util.keccakAddressBytes(identities[1], task);
    const hash3 = await util.keccakAddressBytes(identities[2], task);

    const sortedIdentities = [
        {
            identity: identities[0],
            privateKey: privateKeys[0],
            hash: hash1,
        },
        {
            identity: identities[1],
            privateKey: privateKeys[1],
            hash: hash2,
        },
        {
            identity: identities[2],
            privateKey: privateKeys[2],
            hash: hash3,
        },
    ].sort((x, y) => x.hash.localeCompare(y.hash));

    const solution = await util.keccakBytesBytesBytes.call(
        sortedIdentities[0].hash,
        sortedIdentities[1].hash,
        sortedIdentities[2].hash,
    );

    for (var i = 65; i >= 2; i -= 1) {
        if (task.charAt(task.length - 1) === solution.charAt(i)) break;
    }
    if (i === 2) {
        assert(false, 'Could not find solution for offer challenge!');
    }
    const shift = 65 - i;

    // Getting hashes
    var hashes = [];
    let promises = [];
    for (i = 0; i < 3; i += 1) {
        promises[i] = util.keccakBytesAddress.call(offerId, sortedIdentities[i].identity);
    }
    hashes = await Promise.all(promises);

    // Getting confirmations
    var confimations = [];
    promises = [];
    for (i = 0; i < 3; i += 1) {
        promises[i] = web3.eth.accounts.sign(
            hashes[i],
            sortedIdentities[i].privateKey,
        );
    }
    confimations = await Promise.all(promises);

    res = await holding.finalizeOffer(
        DC_identity,
        offerId,
        shift,
        confimations[0].signature,
        confimations[1].signature,
        confimations[2].signature,
        [new BN(0), new BN(1), new BN(2)],
        [
            sortedIdentities[0].identity,
            sortedIdentities[1].identity,
            sortedIdentities[2].identity,
        ],
        emptyAddress,
        { from: DC_wallet },
    );

    await holdingStorage.setDifficultyOverride(new BN(0));
}

// eslint-disable-next-line no-undef
contract('Offer testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        hub = await Hub.deployed();
        trac = await TracToken.deployed();
        profile = await Profile.deployed();
        holding = await Holding.deployed();
        const holdingStorageAddress = await hub.getContractAddress.call('HoldingStorage');
        holdingStorage = await HoldingStorage.at(holdingStorageAddress);
        profileStorage = await ProfileStorage.deployed();
        util = await TestingUtilities.deployed();

        privateKeys = [
            '0x02b39cac1532bef9dba3e36ec32d3de1e9a88f1dda597d3ac6e2130aed9adc4e',
            '0xb1c53fd90d0172ff60f14f61f7a09555a9b18aa3c371991d77209cfe524e71e6',
            '0x8ab3477bf3a1e0af66ab468fafd6cf982df99a59fee405d99861e7faf4db1f7b',
            '0xc80796c049af64d07c76ab4cfb00655895368c60e50499e56cdc3c38d09aa88e',
            '0x239d785cea7e22f23d1fa0f22a7cb46c04d81498ce4f2de07a9d2a7ceee45004',
            '0x021336479aa1553e42bfcd3b928dee791db84a227906cb7cec5982d382ecf106',
            '0x217479bee25ed6d28302caec069c7297d0c3aefdda81cf91ed754c4d660862ae',
            '0xa050f7b3a0479a55e9ddd074d218fbfea302f061e9f21a117a2ec1f0b986a363',
            '0x0dbaee2066aacd16d43a9e23649f232913bca244369463320610ffe6ffb0d69d',
            '0x63b854ff0d973dbd4808a6def4c6a7f65bebcaec07520fbf1c0056331af65a7b',
        ];


        // Generate web3 and set provider
        web3 = new Web3('HTTP://127.0.0.1:7545');
        web3.setProvider(Ganache.provider());

        // Generate eth_account, identities, and profiles

        // Increase approval for depositing tokens
        var promises = [];
        for (var i = 0; i < accounts.length; i += 1) {
            promises[i] = trac.increaseApproval(
                profile.address,
                tokensToDeposit,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);


        var res;
        // Generate profiles
        for (i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            res = await profile.createProfile(
                accounts[i],
                accounts[i],
                tokensToDeposit,
                false,
                '0x7e9f99b7971cb3de779690a82fec5e2ceec74dd0',
                { from: accounts[i] },
            );
            identities[i] = res.logs[0].args.newIdentity;
        }

        DC_wallet = accounts[accounts.length - 1];
        DC_identity = identities[identities.length - 1];
    });

    // eslint-disable-next-line no-undef
    it('Should create an offer', async () => {
        let res = await holding.createOffer(
            DC_identity,
            dataSetId,
            dataRootHash,
            redLitigationHash,
            greenLitigationHash,
            blueLitigationHash,
            dcNodeId,
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            dataSetSizeInBytes,
            litigationIntervalInMinutes,
            { from: DC_wallet },
        ).catch((err) => {
            assert(false, 'Failed to create offer!');
        });

        // eslint-disable-next-line prefer-destructuring
        const offerId = res.logs[0].args.offerId;

        res = await holdingStorage.offer.call(offerId);

        assert(holdingTimeInMinutes.eq(res.holdingTimeInMinutes), 'Holding time not matching!');
        assert(tokenAmountPerHolder.eq(res.tokenAmountPerHolder), 'Token amount not matching!');
        assert(litigationIntervalInMinutes.eq(res.litigationIntervalInMinutes), 'Litigation interval not matching!');
        assert.equal(res.redLitigationHash, redLitigationHash, 'Red litigation hash not matching!');
        assert.equal(res.greenLitigationHash, greenLitigationHash, 'Green litigation hash not matching!');
        assert.equal(res.blueLitigationHash, blueLitigationHash, 'Blue litigation hash not matching!');
        assert.equal(res.startTime, 0, 'Start time set before it should be set!');
        assert.notEqual(res.difficulty, 0, 'Difficulty not written!');
    });

    // eslint-disable-next-line no-undef
    it('Should test finalizing offer', async () => {
        await holdingStorage.setDifficultyOverride(new BN(1));

        let res = await holding.createOffer(
            DC_identity,
            dataSetId,
            dataRootHash,
            redLitigationHash,
            greenLitigationHash,
            blueLitigationHash,
            dcNodeId,
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            dataSetSizeInBytes,
            litigationIntervalInMinutes,
            { from: DC_wallet },
        );
        const firstOfferGasUsage = res.receipt.gasUsed;

        // eslint-disable-next-line prefer-destructuring
        offerId = res.logs[0].args.offerId;

        const task = await holdingStorage.getOfferTask.call(offerId);

        const hash1 = await util.keccakAddressBytes(identities[0], task);
        const hash2 = await util.keccakAddressBytes(identities[1], task);
        const hash3 = await util.keccakAddressBytes(identities[2], task);

        const sortedIdentities = [
            {
                identity: identities[0],
                privateKey: privateKeys[0],
                hash: hash1,
            },
            {
                identity: identities[1],
                privateKey: privateKeys[1],
                hash: hash2,
            },
            {
                identity: identities[2],
                privateKey: privateKeys[2],
                hash: hash3,
            },
        ].sort((x, y) => x.hash.localeCompare(y.hash));

        const solution = await util.keccakBytesBytesBytes.call(
            sortedIdentities[0].hash,
            sortedIdentities[1].hash,
            sortedIdentities[2].hash,
        );

        for (var i = 65; i >= 2; i -= 1) {
            if (task.charAt(task.length - 1) === solution.charAt(i)) break;
        }
        if (i === 2) {
            assert(false, 'Could not find solution for offer challenge!');
        }
        const shift = 65 - i;

        // Getting hashes
        var hashes = [];
        for (i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            hashes[i] = await util.keccakBytesAddress.call(offerId, sortedIdentities[i].identity);
        }

        // Getting confirmations
        var confimations = [];
        for (i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            confimations[i] = await web3.eth.accounts.sign(
                hashes[i],
                sortedIdentities[i].privateKey,
            );
        }

        res = await holding.finalizeOffer(
            DC_identity,
            offerId,
            shift,
            confimations[0].signature,
            confimations[1].signature,
            confimations[2].signature,
            [new BN(0), new BN(1), new BN(2)],
            [
                sortedIdentities[0].identity,
                sortedIdentities[1].identity,
                sortedIdentities[2].identity,
            ],
            emptyAddress,
            { from: DC_wallet },
        );

        for (i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            res = await profileStorage.profile.call(sortedIdentities[i].identity);
            assert(tokenAmountPerHolder.eq(res.stakeReserved), `Reserved stake amount incorrect for account ${i}!`);
        }
        res = await profileStorage.profile.call(DC_identity);
        assert(tokenAmountPerHolder.mul(new BN(3)).eq(res.stakeReserved), 'Reserved stake amount incorrect for DC!');

        for (i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            res = await holdingStorage.holder.call(offerId, sortedIdentities[i].identity);

            assert(tokenAmountPerHolder.eq(res.stakedAmount), 'Token amount not matching!');
            assert.equal(res.litigationEncryptionType, i, 'Red litigation hash not matching!');
        }

        for (i = 0; i < confimations.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            res = await profileStorage.getStakeReserved.call(sortedIdentities[i].identity);
            assert(tokenAmountPerHolder.eq(res), 'Tokens reserved not matching');
        }
        res = await profileStorage.getStakeReserved.call(DC_identity);
        assert(tokenAmountPerHolder.mul(new BN(3)).eq(res), 'Tokens reserved for DC not matching');

        // Create an additional offer
        res = await holding.createOffer(
            DC_identity,
            dataSetId,
            dataRootHash,
            redLitigationHash,
            greenLitigationHash,
            blueLitigationHash,
            dcNodeId,
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            dataSetSizeInBytes,
            litigationIntervalInMinutes,
            { from: DC_wallet },
        );

        await holdingStorage.setDifficultyOverride(new BN(0));
    });

    // eslint-disable-next-line no-undef
    it('Should test token transfers for holding', async () => {
        await createOffer(accounts);

        // Move the payment timestamp halfway through the offer
        let timestamp;
        let promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = holdingStorage.getHolderPaymentTimestamp(offerId, identities[i]);
        }
        let res = await Promise.all(promises);
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            timestamp = res[i];
            timestamp = timestamp.sub(holdingTimeInMinutes.muln(60));
            promises[i] = holdingStorage.setHolderPaymentTimestamp(
                offerId,
                identities[i],
                timestamp,
            );
        }
        await Promise.all(promises);

        for (var i = 0; i < 3; i += 1) {
            promises[i] =
                holdingStorage.setHolderPaymentTimestamp(offerId, identities[i], timestamp);
        }
        await Promise.all(promises);

        const initialStake = [];
        const initialStakeReserved = [];
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = profileStorage.profile.call(identities[i]);
        }
        res = await Promise.all(promises);
        for (let i = 0; i < 3; i += 1) {
            initialStake[i] = res[i].stake;
            initialStakeReserved[i] = res[i].stakeReserved;
        }
        res = await profileStorage.profile.call(DC_identity);
        const initialStakeDC = res.stake;
        const initialStakeReservedDC = res.stakeReserved;

        for (i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await holding.payOut(identities[i], offerId, { from: accounts[i] });
        }

        const finalStake = [];
        const finalStakeReserved = [];
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = profileStorage.profile.call(identities[i]);
        }
        res = await Promise.all(promises);
        for (let i = 0; i < 3; i += 1) {
            finalStake[i] = res[i].stake;
            finalStakeReserved[i] = res[i].stakeReserved;
        }
        res = await profileStorage.profile.call(DC_identity);
        const finalStakeDC = res.stake;
        const finalStakeReservedDC = res.stakeReserved;

        for (let i = 0; i < 3; i += 1) {
            assert(initialStake[i].add(tokenAmountPerHolder).eq(finalStake[i]), `Stake amount incorrect for account ${i}! `
                + `Expected ${initialStake[i].add(tokenAmountPerHolder).toString()}, but got ${finalStake[i].toString()}!`);
            assert(initialStakeReserved[i].sub(tokenAmountPerHolder).eq(finalStakeReserved[i]), `Reserved stake amount incorrect for account ${i}! `
                + `Expected ${initialStakeReserved[i].sub(tokenAmountPerHolder).toString()}, but got ${finalStakeReserved[i].toString()}!`);
        }
        assert(initialStakeDC.sub(tokenAmountPerHolder.muln(3)).eq(finalStakeDC), 'Stake amount incorrect for DC account! '
            + `Expected ${initialStakeDC.sub(tokenAmountPerHolder.muln(3)).toString()}, but got ${finalStakeDC.toString()}!`);
        assert(initialStakeReservedDC.sub(tokenAmountPerHolder.muln(3)).eq(finalStakeReservedDC), 'Reserved stake amount incorrect for DC account! '
            + `Expected ${initialStakeReservedDC.sub(tokenAmountPerHolder.muln(3)).toString()}, but got ${finalStakeReservedDC.toString()}!`);
    });

    // eslint-disable-next-line no-undef
    it('Should test multiple calls of payOut function', async () => {
        // Create a new job for a holder

        await createOffer(accounts);

        // Move the payment timestamp halfway through the offer
        let timestamp;
        let promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = holdingStorage.getHolderPaymentTimestamp(offerId, identities[i]);
        }
        let res = await Promise.all(promises);
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            timestamp = res[i];
            timestamp = timestamp.sub(holdingTimeInMinutes.muln(60).divn(2));
            promises[i] = holdingStorage.setHolderPaymentTimestamp(
                offerId,
                identities[i],
                timestamp,
            );
        }
        await Promise.all(promises);

        const initialStake = [];
        const initialStakeReserved = [];
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = profileStorage.profile.call(identities[i]);
        }
        res = await Promise.all(promises);
        for (let i = 0; i < 3; i += 1) {
            initialStake[i] = res[i].stake;
            initialStakeReserved[i] = res[i].stakeReserved;
        }
        res = await profileStorage.profile.call(DC_identity);
        const initialStakeDC = res.stake;
        const initialStakeReservedDC = res.stakeReserved;

        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = holding.payOut(identities[i], offerId, { from: accounts[i] });
        }
        await Promise.all(promises);

        // Move the payment timestamp even further - some time after the offer has finished
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = holdingStorage.getHolderPaymentTimestamp(offerId, identities[i]);
        }
        res = await Promise.all(promises);
        promises = [];
        for (let i = 0; i < res.length; i += 1) {
            timestamp = res[i];
            timestamp = timestamp.sub(holdingTimeInMinutes.muln(60));
            promises[i] = holdingStorage.setHolderPaymentTimestamp(
                offerId,
                identities[i],
                timestamp,
            );
        }
        await Promise.all(promises);

        // Call payout again
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = holding.payOut(identities[i], offerId, { from: accounts[i] });
        }
        await Promise.all(promises);

        const finalStake = [];
        const finalStakeReserved = [];
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            promises[i] = profileStorage.profile.call(identities[i]);
        }
        res = await Promise.all(promises);
        for (let i = 0; i < 3; i += 1) {
            finalStake[i] = res[i].stake;
            finalStakeReserved[i] = res[i].stakeReserved;
        }
        res = await profileStorage.profile.call(DC_identity);
        const finalStakeDC = res.stake;
        const finalStakeReservedDC = res.stakeReserved;

        for (let i = 0; i < 3; i += 1) {
            assert(initialStake[i].add(tokenAmountPerHolder).eq(finalStake[i]), `Stake amount incorrect for account ${i}! `
                + `Expected ${initialStake[i].add(tokenAmountPerHolder).toString()}, but got ${finalStake[i].toString()}!`);
            assert(initialStakeReserved[i].sub(tokenAmountPerHolder).eq(finalStakeReserved[i]), `Reserved stake amount incorrect for account ${i}! `
                + `Expected ${initialStakeReserved[i].sub(tokenAmountPerHolder).toString()}, but got ${finalStakeReserved[i].toString()}!`);
        }
        assert(initialStakeDC.sub(tokenAmountPerHolder.muln(3)).eq(finalStakeDC), 'Stake amount incorrect for DC account! '
            + `Expected ${initialStakeDC.sub(tokenAmountPerHolder.muln(3)).toString()}, but got ${finalStakeDC.toString()}!`);
        assert(initialStakeReservedDC.sub(tokenAmountPerHolder.muln(3)).eq(finalStakeReservedDC), 'Reserved stake amount incorrect for DC account! '
            + `Expected ${initialStakeReservedDC.sub(tokenAmountPerHolder.muln(3)).toString()}, but got ${finalStakeReservedDC.toString()}!`);
    });

    // eslint-disable-next-line no-undef
    it('Should test difficulty override', async () => {
        let res = await holdingStorage.getDifficultyOverride.call();
        assert(
            res.isZero(),
            `Initial difficulty ovverride incorrect, got ${res.toString()} instead of 0!`,
        );

        const difficultyToSet = new BN(10);
        // Execute tested function
        res = await holdingStorage.setDifficultyOverride(difficultyToSet, { from: accounts[0] });

        res = await holdingStorage.getDifficultyOverride.call();
        assert(
            difficultyToSet.eq(res),
            `Initial difficulty override incorrect, got ${res.toString()} instead of ${difficultyToSet.toString()}!`,
        );

        // Create offer to check difficulty to be written
        res = await holding.createOffer(
            DC_identity,
            dataSetId,
            dataRootHash,
            redLitigationHash,
            greenLitigationHash,
            blueLitigationHash,
            dcNodeId,
            holdingTimeInMinutes,
            tokenAmountPerHolder,
            dataSetSizeInBytes,
            litigationIntervalInMinutes,
            { from: DC_wallet },
        );
        // eslint-disable-next-line prefer-destructuring
        offerId = res.logs[0].args.offerId;
        res = await holdingStorage.offer.call(offerId);

        assert(
            difficultyToSet.eq(res.difficulty),
            `Written difficulty ovverride incorrect, got ${res.difficulty.toString()} instead of ${difficultyToSet.toString()}!`,
        );
        await holdingStorage.setDifficultyOverride(new BN(0));
    });
});
