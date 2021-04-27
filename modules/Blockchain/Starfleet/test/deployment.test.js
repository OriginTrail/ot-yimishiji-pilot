const { assert, expect } = require('chai');

var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef
var TracToken = artifacts.require('TracToken'); // eslint-disable-line no-undef

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef

var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Holding = artifacts.require('Holding'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef
var Reading = artifacts.require('Reading'); // eslint-disable-line no-undef

var Web3 = require('web3');

// eslint-disable-next-line no-undef
contract('Deployment tests', async () => {
    // eslint-disable-next-line no-undef
    it('Should get Hub contract', async () => {
        await Hub.deployed()
            .catch((err) => {
                assert(false, 'Hub contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get TracToken contract and verify its value in the hub contract', async () => {
        const hub = await Hub.deployed();
        const res = await hub.tokenAddress.call();
        assert.notEqual(
            res,
            '0x0000000000000000000000000000000000000000',
            'TracToken contract address in Hub is not set!',
        );
        await TracToken.deployed()
            .then((instance) => {
                assert.equal(
                    instance.address,
                    res,
                    'Deployed instance address and address in hub contract do not match!',
                );
            })
            .catch((err) => {
                assert(false, 'TracToken contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get Profile contract and verify its value in the hub contract', async () => {
        const hub = await Hub.deployed();
        const res = await hub.getContractAddress.call('Profile');
        assert.notEqual(
            res,
            '0x0000000000000000000000000000000000000000',
            'Profile contract address in Hub is not set!',
        );
        await Profile.deployed()
            .then((instance) => {
                assert.equal(
                    instance.address,
                    res,
                    'Deployed instance address and address in hub contract do not match!',
                );
            })
            .catch((err) => {
                assert(false, 'Profile contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get Holding contract and verify its value in the hub contract', async () => {
        const hub = await Hub.deployed();
        const res = await hub.getContractAddress.call('Holding');
        assert.notEqual(
            res,
            '0x0000000000000000000000000000000000000000',
            'Holding contract address in Hub is not set!',
        );
        await Holding.deployed()
            .then((instance) => {
                assert.equal(
                    instance.address,
                    res,
                    'Deployed instance address and address in hub contract do not match!',
                );
            })
            .catch((err) => {
                assert(false, 'Holding contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get ProfileStorage contract and verify its value in the hub contract', async () => {
        const hub = await Hub.deployed();
        const res = await hub.getContractAddress.call('ProfileStorage');
        assert.notEqual(
            res,
            '0x0000000000000000000000000000000000000000',
            'ProfileStorage contract address in Hub is not set!',
        );
        await ProfileStorage.deployed()
            .then((instance) => {
                assert.equal(
                    instance.address,
                    res,
                    'Deployed instance address and address in hub contract do not match!',
                );
            })
            .catch((err) => {
                assert(false, 'ProfileStorage contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get HoldingStorage contract and verify its value in the hub contract', async () => {
        const hub = await Hub.deployed();
        const res = await hub.getContractAddress.call('HoldingStorage');
        assert.notEqual(
            res,
            '0x0000000000000000000000000000000000000000',
            'HoldingStorage contract address in Hub is not set!',
        );
        await HoldingStorage.deployed()
            .then((instance) => {
                assert.equal(
                    instance.address,
                    res,
                    'Deployed instance address and address in hub contract do not match!',
                );
            })
            .catch((err) => {
                assert(false, 'HoldingStorage contract is not deployed!');
            });
    });

    // eslint-disable-next-line no-undef
    it('Should get TestingUtilities contract', async () => {
        await TestingUtilities.deployed()
            .catch((err) => {
                assert(false, 'TestingUtilities contract is not deployed!');
            });
    });
});
