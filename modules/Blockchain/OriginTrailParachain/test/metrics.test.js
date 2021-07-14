var BN = require('bn.js'); // eslint-disable-line no-undef
const { assert, expect } = require('chai');

var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef

var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Holding = artifacts.require('Holding'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef

var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

var Web3 = require('web3');

var web3;

// Helper variables
var errored = true;
var DC_identity;
var DC_wallet;
var offerId;
var tokensToDeposit = (new BN(100)).mul(new BN(10).pow(new BN(21)));
const emptyAddress = '0x0000000000000000000000000000000000000000';


// Offer variables
var dataSetId = '0x8cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';
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

var GasUsage = [];

function genHexString(len) {
    let output = '';
    for (let i = 0; i < len; i += 1) {
        output += (Math.floor(Math.random() * 16)).toString(16);
    }
    return output;
}

async function createOffer(accounts) {
    await holdingStorage.setDifficultyOverride(new BN(1));

    dataSetId = genHexString(64);
    dataSetId = `0x${dataSetId}`;
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
            color: new BN(1),
        },
        {
            identity: identities[1],
            privateKey: privateKeys[1],
            hash: hash2,
            color: new BN(2),
        },
        {
            identity: identities[2],
            privateKey: privateKeys[2],
            hash: hash3,
            color: new BN(3),
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
        promises[i] = util.keccakBytesAddressNumber
            .call(offerId, sortedIdentities[i].identity, sortedIdentities[i].color);
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
        [
            sortedIdentities[0].color,
            sortedIdentities[1].color,
            sortedIdentities[2].color,
        ],
        [
            sortedIdentities[0].identity,
            sortedIdentities[1].identity,
            sortedIdentities[2].identity,
        ],
        emptyAddress,
        { from: DC_wallet },
    );
    const secondOfferGasUsage = res.receipt.gasUsed;

    GasUsage.push({
        createOffer: firstOfferGasUsage,
        finalizeOffer: secondOfferGasUsage,
        total: firstOfferGasUsage + secondOfferGasUsage,
    });

    await holdingStorage.setDifficultyOverride(new BN(0));
}

// eslint-disable-next-line no-undef
contract('Metrics testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        hub = await Hub.deployed();
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

        // Generate eth_account, identities, and profiles
        var res;
        // Generate profiles
        for (let i = 0; i < accounts.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            res = await profile.createProfile(
                accounts[i],
                accounts[i],
                false,
                '0x7e9f99b7971cb3de779690a82fec5e2ceec74dd0',
                { from: accounts[i], value: tokensToDeposit },
            );
            identities[i] = res.logs[0].args.newIdentity;
        }

        DC_wallet = accounts[accounts.length - 1];
        DC_identity = identities[identities.length - 1];
    });

    // eslint-disable-next-line no-undef
    it.skip('Should create multiple offers to check offer gas usage', async () => {
        const promise = [];
        for (let i = 0; i < 3; i += 1) {
            promise.push(profileStorage.setStakeReserved(
                identities[i],
                tokensToDeposit.divn(1000),
            ));
        }
        await Promise.all(promise);
        await profileStorage.setStakeReserved(DC_identity, tokensToDeposit.divn(1000));


        let createTotal = 0;
        let finalizeTotal = 0;
        let grandTotal = 0;
        let currentLength = GasUsage.length;
        for (let i = 0; i < 100; i += 1) {
            console.log(`Running offer number ${i}`);
            try {
                // eslint-disable-next-line no-await-in-loop
                await createOffer(accounts);
                // if ()
                if (GasUsage.length > currentLength) {
                    currentLength = GasUsage.length;
                    createTotal += GasUsage[GasUsage.length - 1].createOffer;
                    finalizeTotal += GasUsage[GasUsage.length - 1].finalizeOffer;
                    grandTotal += GasUsage[GasUsage.length - 1].total;
                    console.log(JSON.stringify(GasUsage[GasUsage.length - 1], null, 4));
                }
            } catch (e) {
                console.log(e);
            }
        }

        const creationAverage = createTotal / GasUsage.length;
        const finalizeAverage = finalizeTotal / GasUsage.length;
        const totalAverage = grandTotal / GasUsage.length;

        console.log(`Calculated average for ${GasUsage.length} offers:`);
        console.log(`\t Offer creation average: ${creationAverage}`);
        console.log(`\t Offer finalization average: ${finalizeAverage}`);
        console.log(`\t Total offer average gas usage: ==== ${totalAverage} =====`);
    });
});
