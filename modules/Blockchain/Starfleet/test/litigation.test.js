var BN = require('bn.js'); // eslint-disable-line no-undef
const { assert, expect } = require('chai');

const TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef
const TracToken = artifacts.require('TracToken'); // eslint-disable-line no-undef

const Hub = artifacts.require('Hub'); // eslint-disable-line no-undef

const Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
const Holding = artifacts.require('Holding'); // eslint-disable-line no-undef
const Litigation = artifacts.require('Litigation'); // eslint-disable-line no-undef
const Replacement = artifacts.require('Replacement'); // eslint-disable-line no-undef

const ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
const HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef
const LitigationStorage = artifacts.require('LitigationStorage'); // eslint-disable-line no-undef
const Reading = artifacts.require('Reading'); // eslint-disable-line no-undef

const Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

var Web3 = require('web3');

var web3;

var Ganache = require('ganache-core');

// Helper variables
var errored = true;
var DC_identity;
var DH_identity;
var DC_wallet;
var DH_wallet;
var offerId;
var tokensToDeposit = (new BN(5)).mul(new BN(10).pow(new BN(21)));
const emptyAddress = '0x0000000000000000000000000000000000000000';

// Variables used for litigation
const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const requested_data_index = 5;
var requested_data = [];
var hashes = [];
var hash_AB;
var hash_CD;
var hash_EF;
var hash_GH;
var hash_ABCD;
var hash_EFGH;
var root_hash;

// Offer variables
const dataSetId = '0x8cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
let dataRootHash;
let redLitigationHash;
let greenLitigationHash;
let blueLitigationHash;
const dcNodeId = '0x5cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
const holdingTimeInMinutes = new BN(1);
const tokenAmountPerHolder = new BN(120);
const dataSetSizeInBytes = new BN(1024);
const litigationIntervalInMinutes = new BN(1);

// Profile variables
var privateKeys = [];
var identities = [];

// Contracts used in test
var trac;
var profile;
var holding;
var litigation;
var replacement;
var holdingStorage;
var profileStorage;
var litigationStorage;
var util;

// eslint-disable-next-line no-undef
contract('Litigation testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        trac = await TracToken.deployed();
        profile = await Profile.deployed();
        holding = await Holding.deployed();
        litigation = await Litigation.deployed();
        replacement = await Replacement.deployed();
        holdingStorage = await HoldingStorage.deployed();
        profileStorage = await ProfileStorage.deployed();
        litigationStorage = await LitigationStorage.deployed();
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
        let promises = [];
        for (let i = 0; i < accounts.length; i += 1) {
            promises[i] = trac.increaseApproval(
                profile.address,
                tokensToDeposit,
                { from: accounts[i] },
            );
        }
        await Promise.all(promises);

        let res;
        // Generate profiles
        for (let i = 0; i < accounts.length; i += 1) {
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

        // eslint-disable-next-line prefer-destructuring
        DH_wallet = accounts[0];
        // eslint-disable-next-line prefer-destructuring
        DH_identity = identities[0];

        // Calculate litigation root hash
        // Merkle tree structure
        /*      / \
               /   \
              /     \
             /       \
            /         \
           / \       / \
          /   \     /   \
         /\   /\   /\   /\
        A  B C  D E  F G  H  */

        // Calculating hashes of requested data
        promises = [];
        for (let i = 0; i < 8; i += 1) {
            promises[i] = util.keccakString.call(letters[i]);
        }
        requested_data = await Promise.all(promises);

        // Calculating indexed hashes of requested data
        promises = [];
        for (let i = 0; i < 8; i += 1) {
            promises[i] = util.keccakIndex.call(requested_data[i], i);
        }
        hashes = await Promise.all(promises);

        // Creating merkle tree
        hash_AB = await util.keccak2hashes.call(hashes[0], hashes[1]);
        hash_CD = await util.keccak2hashes.call(hashes[2], hashes[3]);
        hash_EF = await util.keccak2hashes.call(hashes[4], hashes[5]);
        hash_GH = await util.keccak2hashes.call(hashes[6], hashes[7]);
        hash_ABCD = await util.keccak2hashes.call(hash_AB, hash_CD);
        hash_EFGH = await util.keccak2hashes.call(hash_EF, hash_GH);
        root_hash = await util.keccak2hashes.call(hash_ABCD, hash_EFGH);

        dataRootHash = root_hash;
        redLitigationHash = root_hash;
        greenLitigationHash = root_hash;
        blueLitigationHash = root_hash;
    });

    // eslint-disable-next-line no-undef
    beforeEach(async () => {
        await holdingStorage.setDifficultyOverride(new BN(1));
        // Creating offer used for litigation
        const res = await holding.createOffer(
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

        // Calculate task solution
        for (var i = 65; i >= 2; i -= 1) {
            if (task.charAt(task.length - 1) === solution.charAt(i)) break;
        }
        if (i === 2) {
            assert(false, 'Could not find solution for offer challenge!');
        }
        const shift = 65 - i;

        // Calculating confirmations to be signed by DH's
        var confirmations = [];
        let promises = [];
        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            promises[i] = await util.keccakBytesAddress.call(offerId, sortedIdentities[i].identity);
        }
        confirmations = await Promise.all(promises);

        // Signing calculated confirmations
        promises = [];
        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            promises[i] = web3.eth.accounts.sign(
                confirmations[i],
                sortedIdentities[i].privateKey,
            );
        }
        const signedConfirmations = await Promise.all(promises);

        await holding.finalizeOffer(
            DC_identity,
            offerId,
            shift,
            signedConfirmations[0].signature,
            signedConfirmations[1].signature,
            signedConfirmations[2].signature,
            [new BN(2), new BN(2), new BN(2)],
            [
                sortedIdentities[0].identity,
                sortedIdentities[1].identity,
                sortedIdentities[2].identity,
            ],
            emptyAddress,
            { from: DC_wallet },
        );

        await holdingStorage.setDifficultyOverride(new BN(0));
    });


    // eslint-disable-next-line no-undef
    it('Challenge and replace an unresponsive DH', async () => {
        // Get initial litigation values
        const initialLitigationState =
            await litigationStorage.litigation.call(offerId, DH_identity);
        const initialOfferState = await holdingStorage.offer.call(offerId);
        const initialDhProfileState = await profileStorage.profile.call(DH_identity);
        const initialDhState = await holdingStorage.holder.call(offerId, DH_identity);

        const initialDhStateTest = await profileStorage.profile.call(DH_identity);
        const initialDcState = await profileStorage.profile.call(DC_identity);

        const initialBlockTimestamp = await util.getBlockTimestamp.call();

        assert(
            initialLitigationState.status.isZero(),
            'Initial litigation status differs from expected! ' +
            `Got ${initialLitigationState.status.toString()} but expected 0!`,
        );
        assert(
            initialLitigationState.timestamp.isZero(),
            'Initial litigation timestamp differs from expected! ' +
            `Got ${initialLitigationState.timestamp.toString()} but expected 0!`,
        );
        assert(
            initialDhState.stakedAmount.eq(initialOfferState.tokenAmountPerHolder),
            'Initial holder staked amount differs from expected! ' +
            `Got ${initialDhState.stakedAmount.toString()} but expected ${initialOfferState.tokenAmountPerHolder.toString()}!`,
        );
        assert(
            initialDhState.paidAmount.isZero(),
            'Initial litigation status differs from expected! ' +
            `Got ${initialDhState.paidAmount.toString()} but expected 0!`,
        );
        assert.closeTo(
            initialDhState.paymentTimestamp.toNumber(),
            initialBlockTimestamp.toNumber(),
            10,
            'Initial payment timestamp differs from expected! ' +
            `Got ${initialDhState.paymentTimestamp.toString()} but expected ${initialBlockTimestamp.toString()}!`,
        );

        // Move offer half way through
        let timestamp = initialDhState.paymentTimestamp;
        timestamp = timestamp.sub(holdingTimeInMinutes.muln(60).divn(2));
        await holdingStorage.setHolderPaymentTimestamp(offerId, DH_identity, timestamp);

        // Initiate litigation for data number 5
        let res = await litigation.initiateLitigation(
            offerId,
            DH_identity,
            DC_identity,
            new BN(0),
            new BN(5),
            [hashes[4], hash_GH, hash_ABCD],
            { from: DC_wallet },
        );

        // Instead of answering litigation
        // move the litigation timestamp in order to simulate lack of answer
        timestamp = await litigationStorage.getLitigationTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await litigationStorage.setLitigationTimestamp(offerId, DH_identity, timestamp);
        // Move the offer time as well
        timestamp = await holdingStorage.getHolderPaymentTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await holdingStorage.setHolderPaymentTimestamp(offerId, DH_identity, timestamp);

        // Complete litigation
        res = await litigation.completeLitigation(
            offerId,
            DH_identity,
            DC_identity,
            hashes[5],
            new BN(5),
            { from: DC_wallet, gasLimit: 6000000 },
        );


        const finalDcState = await profileStorage.profile.call(DC_identity);
        const finalDhState = await holdingStorage.holder.call(offerId, DH_identity);
        const finalLitigationState = await litigationStorage.litigation.call(offerId, DH_identity);

        // Verify previous holder paid amount
        const holderPaidAmount =
            await holdingStorage.getHolderPaidAmount.call(offerId, DH_identity);

        assert(
            holderPaidAmount.gt(tokenAmountPerHolder.divn(2).subn(5)) &&
                holderPaidAmount.lt(tokenAmountPerHolder.divn(2).addn(5)),
            'Incorrect paid amount for DH after litigation completion!' +
            ` Got ${res.toString()} but expected ${tokenAmountPerHolder.divn(2).toString()}`,
        );

        assert(
            finalLitigationState.status.eq(new BN(4)),
            `Final litigation status differs from expected! Got ${finalLitigationState.status.toString()} but expected 4!`,
        );
        assert(
            finalDhState.stakedAmount.eq(initialOfferState.tokenAmountPerHolder),
            `Initial holder staked amount differs from expected! Got ${finalDhState.stakedAmount.toString()} but expected ${initialOfferState.tokenAmountPerHolder.toString()}!`,
        );
        assert(
            finalDhState.paidAmount.eq(holderPaidAmount),
            `Initial holder paid amount differs from expected! Got ${finalDhState.paidAmount.toString()} but expected ${holderPaidAmount.toString()}!`,
        );

        assert(
            // eslint-disable-next-line max-len
            finalDcState.stakeReserved.eq(initialDcState.stakeReserved.sub(initialOfferState.tokenAmountPerHolder)),
            `Initial creator reserved amount differs from expected! Got ${finalDcState.stakeReserved.toString()} but expected ${(initialDcState.stakeReserved.sub(initialOfferState.tokenAmountPerHolder)).toString()}!`,
        );

        assert(
            // eslint-disable-next-line max-len
            finalDcState.stake.eq(initialDcState.stake.sub(holderPaidAmount).add(tokenAmountPerHolder.sub(holderPaidAmount))),
            `Initial creator amount differs from expected! Got ${finalDcState.stake.toString()} but expected ${initialDcState.stake.sub(holderPaidAmount).add(tokenAmountPerHolder.sub(holderPaidAmount)).toString()}!`,
        );
    });

    // eslint-disable-next-line no-undef
    it('Litigation completion should block DH from payout', async () => {
        // Get initial litigation values
        let res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Move offer half way through
        let timestamp = await holdingStorage.getHolderPaymentTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(holdingTimeInMinutes.muln(60).divn(2));
        await holdingStorage.setHolderPaymentTimestamp(offerId, DH_identity, timestamp);

        // Initiate litigation
        res = await litigation.initiateLitigation(
            offerId,
            DH_identity,
            DC_identity,
            new BN(0),
            new BN(0),
            [hashes[1], hash_CD, hash_EFGH],
            { from: DC_wallet },
        );

        // Instead of answering litigation
        // move the litigation timestamp in order to simulate lack of answer
        timestamp = await litigationStorage.getLitigationTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await litigationStorage.setLitigationTimestamp(offerId, DH_identity, timestamp);
        timestamp = await holdingStorage.getHolderPaymentTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await holdingStorage.setHolderPaymentTimestamp(offerId, DH_identity, timestamp);

        // Complete litigation
        await litigation.completeLitigation(
            offerId,
            DH_identity,
            DC_identity,
            hashes[0],
            new BN(0),
            { from: DC_wallet, gasLimit: 6000000 },
        );

        let failed = false;
        try {
            await holding.payOut(identities[0], offerId);
        } catch (err) {
            failed = true;
        } finally {
            assert(failed, 'Expected payout to fail');
        }
    });

    // eslint-disable-next-line no-undef
    it('Inactive DC should enable DH to payout some time after answering', async () => {
        // Get initial litigation values
        let res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Initiate litigation
        res = await litigation.initiateLitigation(
            offerId,
            identities[0],
            DC_identity,
            new BN(0),
            new BN(0),
            [hashes[1], hash_CD, hash_EFGH],
            { from: DC_wallet },
        );

        let timestamp = await holdingStorage.getHolderPaymentTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(new BN(80));
        await holdingStorage.setHolderPaymentTimestamp.call(offerId, DH_identity, timestamp);

        await litigation.answerLitigation(offerId, identities[0], hashes[0]);

        res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Instead of completing litigation
        // move the litigation timestamp in order to simulate lack of answer
        timestamp = await litigationStorage.getLitigationTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await litigationStorage.setLitigationTimestamp(offerId, DH_identity, timestamp);
        timestamp = await holdingStorage.getHolderPaymentTimestamp.call(offerId, DH_identity);
        timestamp = timestamp.sub(litigationIntervalInMinutes.muln(60).addn(1));
        await holdingStorage.setHolderPaymentTimestamp(offerId, DH_identity, timestamp);

        let failed = false;
        try {
            await holding.payOut(identities[0], offerId);
        } catch (err) {
            console.log(err);
            failed = true;
        } finally {
            assert(!failed, 'Expected payout failed');
        }
    });

    // eslint-disable-next-line no-undef
    it('Inactive DC should enable DH to payout some time after answering', async () => {
        // Get initial litigation values
        let res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Initiate litigation
        res = await litigation.initiateLitigation(
            offerId,
            identities[0],
            DC_identity,
            new BN(0),
            new BN(0),
            [hashes[1], hash_CD, hash_EFGH],
            { from: DC_wallet },
        );

        let timestamp = await holdingStorage.getOfferStartTime.call(offerId);
        timestamp = timestamp.sub(new BN(80));
        await holdingStorage.setOfferStartTime(offerId, timestamp);

        // answerLitigation(bytes32 offerId, address holderIdentity, bytes32 requestedData)
        await litigation.answerLitigation(offerId, identities[0], hashes[0]);

        res = await litigationStorage.litigation.call(offerId, identities[0]);

        timestamp = await litigationStorage.getLitigationTimestamp.call(offerId, identities[0]);
        timestamp = timestamp.sub(new BN(80));
        await litigationStorage.setLitigationTimestamp(offerId, identities[0], timestamp);

        let failed = false;
        try {
            await holding.payOut(identities[0], offerId);
        } catch (err) {
            console.log(err);
            failed = true;
        } finally {
            assert(!failed, 'Expected payout failed');
        }
    });

    // eslint-disable-next-line no-undef
    it('DH answered correctly, DC Completes', async () => {
        // Get initial litigation values
        let res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Initiate litigation
        res = await litigation.initiateLitigation(
            offerId,
            identities[0],
            DC_identity,
            new BN(0),
            new BN(0),
            [hashes[1], hash_CD, hash_EFGH],
            { from: DC_wallet },
        );
        console.log(`\t Gas used for initiating litigation: ${res.receipt.gasUsed}`);

        const requestedData = requested_data[0];

        res = await litigation.answerLitigation(offerId, identities[0], requestedData);

        // Complete litigation
        res = await litigation.completeLitigation(
            offerId,
            identities[0],
            DC_identity,
            hashes[0],
            new BN(0),
            { from: DC_wallet, gasLimit: 6000000 },
        );

        res = await litigationStorage.litigation.call(offerId, identities[0]);
        assert(res.status.toString('hex') === '0');
    });

    // eslint-disable-next-line no-undef
    it('DH did not answer, DC inactive', async () => {
        // Get initial litigation values
        let res = await litigationStorage.litigation.call(offerId, identities[0]);

        // Initiate litigation
        res = await litigation.initiateLitigation(
            offerId,
            identities[0],
            DC_identity,
            new BN(0),
            new BN(0),
            [hashes[1], hash_CD, hash_EFGH],
            { from: DC_wallet },
        );
        console.log(`\t Gas used for initiating litigation: ${res.receipt.gasUsed}`);

        const requestedData = requested_data[0];

        // DH does not answer
        // DC is inactive,
        // Expire offer holding period
        // Expire litigation period

        let timestamp = await holdingStorage.getOfferStartTime.call(offerId);
        timestamp = timestamp.sub(new BN((parseInt(holdingTimeInMinutes, 10) * 60) + 1));
        await holdingStorage.setOfferStartTime(offerId, timestamp);
        timestamp = await litigationStorage.getLitigationTimestamp.call(offerId, identities[0]);
        timestamp = timestamp.sub(new BN(1000));
        await litigationStorage.setLitigationTimestamp(offerId, identities[0], timestamp);

        try {
            await holding.payOut(identities[0], offerId);
        } catch (err) {
            console.log(err);
            assert(false, 'DH should successfully complete the payout');
        }
    });
});
