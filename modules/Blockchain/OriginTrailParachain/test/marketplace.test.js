var BN = require('bn.js'); // eslint-disable-line no-undef
const { assert, expect } = require('chai');

var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef

var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Marketplace = artifacts.require('Marketplace'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var MarketplaceStorage = artifacts.require('MarketplaceStorage'); // eslint-disable-line no-undef

var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

var Web3 = require('web3');

var web3;

// Helper variables
var seller_identity;
var buyer_identity;
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
var profile;
var marketplace;
var marketplaceStorage;
var profileStorage;
var util;

// eslint-disable-next-line no-undef
contract('Marketplace testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        hub = await Hub.deployed();
        profile = await Profile.deployed();
        marketplace = await Marketplace.deployed();
        marketplaceStorage = await MarketplaceStorage.deployed();
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
        let res;
        // Generate profiles
        for (let i = 0; i < 10; i += 1) {
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
        seller_identity = identities[identities.length - 1];
    });

    // eslint-disable-next-line no-undef
    it('Should test one simple purchase', async () => {
        const rawA = `0x${(Buffer.from('A', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawB = `0x${(Buffer.from('B', 'utf8')).toString('hex').padStart(64, '0')}`;
        const hashAB = await util.keccakBytesBytes(rawA, rawB);
        const originalRootHash = hashAB;

        const key = '0x2cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

        // Generate encoded data
        const encoded_rawA = await util.decryptCiphertext(new BN(0, 10), key, rawA);
        const encoded_rawB = await util.decryptCiphertext(new BN(1, 10), key, rawB);
        const encoded_originalRootHash =
            await util.decryptCiphertext(new BN(2, 10), key, originalRootHash);


        const hashLevel1Index0 = await util.keccakBytesBytes(encoded_rawA, encoded_rawB);

        const hashLevel1Index1 =
            await util.keccakBytesBytes(encoded_originalRootHash, encoded_originalRootHash);

        const encodedDataRootHash = await util.keccakBytesBytes(hashLevel1Index0, hashLevel1Index1);


        // Set variables
        const seller_identity = identities[0];
        const seller_wallet = accounts[0];
        const buyer_identity = identities[1];
        const buyer_wallet = accounts[1];

        const sellerStartStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerStartStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerStartStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerStartStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        const price = new BN(10000, 10);

        let result = await marketplace.initiatePurchase(
            seller_identity,
            buyer_identity,
            price,
            originalRootHash,
            encodedDataRootHash,
            { from: buyer_wallet },
        );

        const { purchaseId } = result.logs[0].args;

        result = await profileStorage.getStakeReserved.call(buyer_identity);
        assert(buyerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for buyer account upon initialization! '
            + `Expected ${buyerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        result = await marketplace.depositKey(
            purchaseId,
            key,
            { from: seller_wallet },
        );

        result = await profileStorage.getStakeReserved.call(seller_identity);
        assert(sellerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for seller account upon key reveal! '
            + `Expected ${sellerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);


        await marketplace.complainAboutNode(
            purchaseId,
            2, 0,
            encoded_originalRootHash, encoded_rawA,
            [encoded_originalRootHash, hashLevel1Index0],
            [encoded_rawB, hashLevel1Index1],
            { from: buyer_wallet },
        );

        // Move the payment timestamp halfway through the offer
        let timestamp = await marketplaceStorage.getTimestamp(purchaseId);
        timestamp = timestamp.subn(3000);
        await marketplaceStorage.setTimestamp(purchaseId, timestamp);

        await marketplace.takePayment(purchaseId, { from: seller_wallet });

        const sellerEndStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerEndStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerEndStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerEndStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        assert(sellerStartStakeReserved.eq(sellerEndStakeReserved), 'Reserved stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStakeReserved.toString()}, but got ${sellerEndStakeReserved.toString()}!`);
        assert(buyerStartStakeReserved.eq(buyerEndStakeReserved), 'Reserved stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStakeReserved.toString()}, but got ${buyerEndStakeReserved.toString()}!`);


        assert(sellerStartStake.add(price).eq(sellerEndStake), 'Stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStake.add(price).toString()}, but got ${sellerEndStake.toString()}!`);
        assert(buyerStartStake.sub(price).eq(buyerEndStake), 'Stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStake.sub(price).toString()}, but got ${buyerEndStake.toString()}!`);
    });

    // eslint-disable-next-line no-undef
    it('Should test one complex purchase', async () => {
        const rawA = `0x${(Buffer.from('A', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawB = `0x${(Buffer.from('B', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawC = `0x${(Buffer.from('C', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawD = `0x${(Buffer.from('D', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawE = `0x${(Buffer.from('E', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawF = `0x${(Buffer.from('F', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawG = `0x${(Buffer.from('G', 'utf8')).toString('hex').padStart(64, '0')}`;

        const hashAB = await util.keccakBytesBytes(rawA, rawB);
        const hashCD = await util.keccakBytesBytes(rawC, rawD);
        const hashEF = await util.keccakBytesBytes(rawE, rawF);
        const hashGG = await util.keccakBytesBytes(rawG, rawG);
        const hashABCD = await util.keccakBytesBytes(hashAB, hashCD);
        const hashEFGG = await util.keccakBytesBytes(hashEF, hashGG);
        const originalRootHash = await util.keccakBytesBytes(hashABCD, hashEFGG);

        const key = '0x2cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

        // Generate encoded data
        let indexedKey = await util.keccakIndex(key, 0);
        const encoded_rawA = await util.xorBytes(rawA, indexedKey);
        indexedKey = await util.keccakIndex(key, 1);
        const encoded_rawB = await util.xorBytes(rawB, indexedKey);
        indexedKey = await util.keccakIndex(key, 2);
        const encoded_rawC = await util.xorBytes(rawC, indexedKey);
        indexedKey = await util.keccakIndex(key, 3);
        const encoded_rawD = await util.xorBytes(rawD, indexedKey);
        indexedKey = await util.keccakIndex(key, 4);
        const encoded_rawE = await util.xorBytes(rawE, indexedKey);
        indexedKey = await util.keccakIndex(key, 5);
        const encoded_rawF = await util.xorBytes(rawF, indexedKey);
        indexedKey = await util.keccakIndex(key, 6);
        const encoded_rawG = await util.xorBytes(rawG, indexedKey);
        indexedKey = await util.keccakIndex(key, 7);
        const encoded_hashAB = await util.xorBytes(hashAB, indexedKey);
        indexedKey = await util.keccakIndex(key, 8);
        const encoded_hashCD = await util.xorBytes(hashCD, indexedKey);
        indexedKey = await util.keccakIndex(key, 9);
        const encoded_hashEF = await util.xorBytes(hashEF, indexedKey);
        indexedKey = await util.keccakIndex(key, 10);
        const encoded_hashGG = await util.xorBytes(hashGG, indexedKey);
        indexedKey = await util.keccakIndex(key, 11);
        const encoded_hashABCD = await util.xorBytes(hashABCD, indexedKey);
        indexedKey = await util.keccakIndex(key, 12);
        const encoded_hashEFGG = await util.xorBytes(hashEFGG, indexedKey);
        indexedKey = await util.keccakIndex(key, 13);
        const encoded_originalRootHash = await util.xorBytes(originalRootHash, indexedKey);

        const hashLevel1Index0 = await util.keccakBytesBytes(encoded_rawA, encoded_rawB);
        const hashLevel1Index1 = await util.keccakBytesBytes(encoded_rawC, encoded_rawD);
        const hashLevel1Index2 = await util.keccakBytesBytes(encoded_rawE, encoded_rawF);
        const hashLevel1Index3 = await util.keccakBytesBytes(encoded_rawG, encoded_hashAB);
        const hashLevel1Index4 = await util.keccakBytesBytes(encoded_hashCD, encoded_hashEF);
        const hashLevel1Index5 = await util.keccakBytesBytes(encoded_hashGG, encoded_hashABCD);
        const hashLevel1Index6 =
            await util.keccakBytesBytes(encoded_hashEFGG, encoded_originalRootHash);

        const hashLevel2Index0 = await util.keccakBytesBytes(hashLevel1Index0, hashLevel1Index1);
        const hashLevel2Index1 = await util.keccakBytesBytes(hashLevel1Index2, hashLevel1Index3);
        const hashLevel2Index2 = await util.keccakBytesBytes(hashLevel1Index4, hashLevel1Index5);
        const hashLevel2Index3 = await util.keccakBytesBytes(hashLevel1Index6, hashLevel1Index6);

        const hashLevel3Index0 = await util.keccakBytesBytes(hashLevel2Index0, hashLevel2Index1);
        const hashLevel3Index1 = await util.keccakBytesBytes(hashLevel2Index2, hashLevel2Index3);

        const encodedDataRootHash = await util.keccakBytesBytes(hashLevel3Index0, hashLevel3Index1);

        // Set variables
        const seller_identity = identities[0];
        const seller_wallet = accounts[0];
        const buyer_identity = identities[1];
        const buyer_wallet = accounts[1];

        const sellerStartStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerStartStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerStartStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerStartStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        const price = new BN(10000, 10);

        let result = await marketplace.initiatePurchase(
            seller_identity,
            buyer_identity,
            price,
            originalRootHash,
            encodedDataRootHash,
            { from: buyer_wallet },
        );

        const { purchaseId } = result.logs[0].args;

        result = await marketplaceStorage.purchase.call(purchaseId);

        result = await profileStorage.getStakeReserved.call(buyer_identity);
        assert(buyerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for buyer account upon initialization! '
            + `Expected ${buyerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        result = await marketplace.depositKey(
            purchaseId,
            key,
            { from: seller_wallet },
        );

        result = await marketplaceStorage.purchase.call(purchaseId);

        result = await profileStorage.getStakeReserved.call(seller_identity);
        assert(sellerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for seller account upon key reveal! '
            + `Expected ${sellerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        await marketplace.complainAboutNode(
            purchaseId,
            7, 0,
            encoded_hashAB, encoded_rawA,
            [encoded_rawG, hashLevel1Index2, hashLevel2Index0, hashLevel3Index1],
            [encoded_rawB, hashLevel1Index1, hashLevel2Index1, hashLevel3Index1],
            { from: buyer_wallet },
        );

        // Move the payment timestamp halfway through the offer
        let timestamp = await marketplaceStorage.getTimestamp(purchaseId);
        timestamp = timestamp.subn(3000);
        await marketplaceStorage.setTimestamp(purchaseId, timestamp);

        await marketplace.takePayment(purchaseId, { from: seller_wallet });

        const sellerEndStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerEndStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerEndStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerEndStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        assert(sellerStartStakeReserved.eq(sellerEndStakeReserved), 'Reserved stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStakeReserved.toString()}, but got ${sellerEndStakeReserved.toString()}!`);
        assert(buyerStartStakeReserved.eq(buyerEndStakeReserved), 'Reserved stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStakeReserved.toString()}, but got ${buyerEndStakeReserved.toString()}!`);


        assert(sellerStartStake.add(price).eq(sellerEndStake), 'Stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStake.add(price).toString()}, but got ${sellerEndStake.toString()}!`);
        assert(buyerStartStake.sub(price).eq(buyerEndStake), 'Stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStake.sub(price).toString()}, but got ${buyerEndStake.toString()}!`);
    });

    // eslint-disable-next-line no-undef
    it('Should test one simple incorrect purchase', async () => {
        const rawA = `0x${(Buffer.from('A', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawB = `0x${(Buffer.from('B', 'utf8')).toString('hex').padStart(64, '0')}`;
        const hashAB = '0x0000000000000000000000000000000000000000000000000000000000012345';
        const originalRootHash = hashAB;

        const key = '0x2cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

        // Generate encoded data
        const encoded_rawA = await util.decryptCiphertext(new BN(0, 10), key, rawA);
        const encoded_rawB = await util.decryptCiphertext(new BN(1, 10), key, rawB);
        const encoded_originalRootHash =
            await util.decryptCiphertext(new BN(2, 10), key, originalRootHash);


        const hashLevel1Index0 = await util.keccakBytesBytes(encoded_rawA, encoded_rawB);
        const hashLevel1Index1 =
            await util.keccakBytesBytes(encoded_originalRootHash, encoded_originalRootHash);

        const encodedDataRootHash = await util.keccakBytesBytes(hashLevel1Index0, hashLevel1Index1);


        // Set variables
        const seller_identity = identities[0];
        const seller_wallet = accounts[0];
        const buyer_identity = identities[1];
        const buyer_wallet = accounts[1];

        const sellerStartStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerStartStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerStartStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerStartStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        const price = new BN(10000, 10);

        let result = await marketplace.initiatePurchase(
            seller_identity,
            buyer_identity,
            price,
            originalRootHash,
            encodedDataRootHash,
            { from: buyer_wallet },
        );

        const { purchaseId } = result.logs[0].args;

        result = await profileStorage.getStakeReserved.call(buyer_identity);
        assert(buyerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for buyer account upon initialization! '
            + `Expected ${buyerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        result = await marketplace.depositKey(
            purchaseId,
            key,
            { from: seller_wallet },
        );

        result = await profileStorage.getStakeReserved.call(seller_identity);
        assert(sellerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for seller account upon key reveal! '
            + `Expected ${sellerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);


        await marketplace.complainAboutNode(
            purchaseId,
            2, 0,
            encoded_originalRootHash, encoded_rawA,
            [encoded_originalRootHash, hashLevel1Index0],
            [encoded_rawB, hashLevel1Index1],
            { from: buyer_wallet },
        );

        // Move the payment timestamp halfway through the offer
        let timestamp = await marketplaceStorage.getTimestamp(purchaseId);
        timestamp = timestamp.subn(3000);
        await marketplaceStorage.setTimestamp(purchaseId, timestamp);


        result = await marketplaceStorage.purchase.call(purchaseId);
        let errored = false;
        try {
            await marketplace.takePayment(purchaseId, { from: seller_wallet });
        } catch (e) {
            const expectedMessage = 'Payment can only be taken in the KeyDeposited stage';
            if (e.message.toString().includes(expectedMessage)) {
                errored = true;
            } else {
                assert(false, `Incorrect error thrown! Expected ${expectedMessage} but got ${e.message.toString()}!`);
            }
        }


        const sellerEndStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerEndStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerEndStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerEndStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        assert(sellerStartStakeReserved.eq(sellerEndStakeReserved), 'Reserved stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStakeReserved.toString()}, but got ${sellerEndStakeReserved.toString()}!`);
        assert(buyerStartStakeReserved.eq(buyerEndStakeReserved), 'Reserved stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStakeReserved.toString()}, but got ${buyerEndStakeReserved.toString()}!`);


        assert(sellerStartStake.sub(price).eq(sellerEndStake), 'Stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStake.add(price).toString()}, but got ${sellerEndStake.toString()}!`);
        assert(buyerStartStake.add(price).eq(buyerEndStake), 'Stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStake.sub(price).toString()}, but got ${buyerEndStake.toString()}!`);

        assert(errored, 'Seller was not denied payment for invalid data!');
    });

    // eslint-disable-next-line no-undef
    it('Should test one incorrect purchase', async () => {
        const rawA = `0x${(Buffer.from('A', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawB = `0x${(Buffer.from('B', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawC = `0x${(Buffer.from('C', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawD = `0x${(Buffer.from('D', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawE = `0x${(Buffer.from('E', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawF = `0x${(Buffer.from('F', 'utf8')).toString('hex').padStart(64, '0')}`;
        const rawG = `0x${(Buffer.from('G', 'utf8')).toString('hex').padStart(64, '0')}`;

        const hashAB = await util.keccakBytesBytes(rawA, rawB);
        const hashCD = await util.keccakBytesBytes(rawC, rawD);
        const hashEF = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const hashGG = await util.keccakBytesBytes(rawG, rawG);
        const hashABCD = await util.keccakBytesBytes(hashAB, hashCD);
        const hashEFGG = await util.keccakBytesBytes(hashEF, hashGG);
        const originalRootHash = await util.keccakBytesBytes(hashABCD, hashEFGG);


        const key = '0x2cad6896887d99d70db8ce035d331ba2ade1a5e1161f38ff7fda76cf7c308cde';

        // Generate encoded data
        let indexedKey = await util.keccakIndex(key, 0);
        const encoded_rawA = await util.xorBytes(rawA, indexedKey);
        indexedKey = await util.keccakIndex(key, 1);
        const encoded_rawB = await util.xorBytes(rawB, indexedKey);
        indexedKey = await util.keccakIndex(key, 2);
        const encoded_rawC = await util.xorBytes(rawC, indexedKey);
        indexedKey = await util.keccakIndex(key, 3);
        const encoded_rawD = await util.xorBytes(rawD, indexedKey);
        indexedKey = await util.keccakIndex(key, 4);
        const encoded_rawE = await util.xorBytes(rawE, indexedKey);
        indexedKey = await util.keccakIndex(key, 5);
        const encoded_rawF = await util.xorBytes(rawF, indexedKey);
        indexedKey = await util.keccakIndex(key, 6);
        const encoded_rawG = await util.xorBytes(rawG, indexedKey);
        indexedKey = await util.keccakIndex(key, 7);
        const encoded_hashAB = await util.xorBytes(hashAB, indexedKey);
        indexedKey = await util.keccakIndex(key, 8);
        const encoded_hashCD = await util.xorBytes(hashCD, indexedKey);
        indexedKey = await util.keccakIndex(key, 9);
        const encoded_hashEF = await util.xorBytes(hashEF, indexedKey);
        indexedKey = await util.keccakIndex(key, 10);
        const encoded_hashGG = await util.xorBytes(hashGG, indexedKey);
        indexedKey = await util.keccakIndex(key, 11);
        const encoded_hashABCD = await util.xorBytes(hashABCD, indexedKey);
        indexedKey = await util.keccakIndex(key, 12);
        const encoded_hashEFGG = await util.xorBytes(hashEFGG, indexedKey);
        indexedKey = await util.keccakIndex(key, 13);
        const encoded_originalRootHash = await util.xorBytes(originalRootHash, indexedKey);

        const hashLevel1Index0 = await util.keccakBytesBytes(encoded_rawA, encoded_rawB);
        const hashLevel1Index1 = await util.keccakBytesBytes(encoded_rawC, encoded_rawD);
        const hashLevel1Index2 = await util.keccakBytesBytes(encoded_rawE, encoded_rawF);
        const hashLevel1Index3 = await util.keccakBytesBytes(encoded_rawG, encoded_hashAB);
        const hashLevel1Index4 = await util.keccakBytesBytes(encoded_hashCD, encoded_hashEF);
        const hashLevel1Index5 = await util.keccakBytesBytes(encoded_hashGG, encoded_hashABCD);
        const hashLevel1Index6 =
            await util.keccakBytesBytes(encoded_hashEFGG, encoded_originalRootHash);

        const hashLevel2Index0 = await util.keccakBytesBytes(hashLevel1Index0, hashLevel1Index1);
        const hashLevel2Index1 = await util.keccakBytesBytes(hashLevel1Index2, hashLevel1Index3);
        const hashLevel2Index2 = await util.keccakBytesBytes(hashLevel1Index4, hashLevel1Index5);
        const hashLevel2Index3 = await util.keccakBytesBytes(hashLevel1Index6, hashLevel1Index6);

        const hashLevel3Index0 = await util.keccakBytesBytes(hashLevel2Index0, hashLevel2Index1);
        const hashLevel3Index1 = await util.keccakBytesBytes(hashLevel2Index2, hashLevel2Index3);

        const encodedDataRootHash = await util.keccakBytesBytes(hashLevel3Index0, hashLevel3Index1);

        // Set variables
        const seller_identity = identities[0];
        const seller_wallet = accounts[0];
        const buyer_identity = identities[1];
        const buyer_wallet = accounts[1];

        const sellerStartStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerStartStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerStartStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerStartStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        const price = new BN(10000, 10);

        let result = await marketplace.initiatePurchase(
            seller_identity,
            buyer_identity,
            price,
            originalRootHash,
            encodedDataRootHash,
            { from: buyer_wallet },
        );

        const { purchaseId } = result.logs[0].args;

        result = await profileStorage.getStakeReserved.call(buyer_identity);
        assert(buyerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for buyer account upon initialization! '
            + `Expected ${buyerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        result = await marketplace.depositKey(
            purchaseId,
            key,
            { from: seller_wallet },
        );

        result = await profileStorage.getStakeReserved.call(seller_identity);
        assert(sellerStartStakeReserved.add(price).eq(result), 'Reserved stake amount incorrect for seller account upon key reveal! '
            + `Expected ${sellerStartStakeReserved.add(price).toString()}, but got ${result.toString()}!`);

        await marketplace.complainAboutNode(
            purchaseId,
            9, 4,
            encoded_hashEF, encoded_rawE,
            [encoded_hashCD, hashLevel1Index5, hashLevel2Index3, hashLevel3Index0],
            [encoded_rawF, hashLevel1Index3, hashLevel2Index0, hashLevel3Index1],
            { from: buyer_wallet },
        );

        // Move the payment timestamp halfway through the offer
        let timestamp = await marketplaceStorage.getTimestamp(purchaseId);
        timestamp = timestamp.subn(3000);
        await marketplaceStorage.setTimestamp(purchaseId, timestamp);


        result = await marketplaceStorage.purchase.call(purchaseId);
        let errored = false;
        try {
            await marketplace.takePayment(purchaseId, { from: seller_wallet });
        } catch (e) {
            const expectedMessage = 'Payment can only be taken in the KeyDeposited stage';
            if (e.message.toString().includes(expectedMessage)) {
                errored = true;
            } else {
                assert(false, `Incorrect error thrown! Expected ${expectedMessage} but got ${e.message.toString()}!`);
            }
        }


        const sellerEndStake =
            await profileStorage.getStake.call(seller_identity);
        const sellerEndStakeReserved =
            await profileStorage.getStakeReserved.call(seller_identity);
        const buyerEndStake =
            await profileStorage.getStake.call(buyer_identity);
        const buyerEndStakeReserved =
            await profileStorage.getStakeReserved.call(buyer_identity);

        assert(sellerStartStakeReserved.eq(sellerEndStakeReserved), 'Reserved stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStakeReserved.toString()}, but got ${sellerEndStakeReserved.toString()}!`);
        assert(buyerStartStakeReserved.eq(buyerEndStakeReserved), 'Reserved stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStakeReserved.toString()}, but got ${buyerEndStakeReserved.toString()}!`);


        assert(sellerStartStake.sub(price).eq(sellerEndStake), 'Stake amount incorrect for seller account upon purchase completion! '
            + `Expected ${sellerStartStake.add(price).toString()}, but got ${sellerEndStake.toString()}!`);
        assert(buyerStartStake.add(price).eq(buyerEndStake), 'Stake amount incorrect for buyer account upon purchase completion! '
            + `Expected ${buyerStartStake.sub(price).toString()}, but got ${buyerEndStake.toString()}!`);

        assert(errored, 'Seller was not denied payment for invalid data!');
    });
});
