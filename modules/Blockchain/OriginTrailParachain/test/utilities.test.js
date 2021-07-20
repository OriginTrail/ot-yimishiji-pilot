var BN = require('bn.js'); // eslint-disable-line no-undef
const { assert } = require('chai');

var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef

var Web3 = require('web3');

var web3;

// Helper variables
var tokensToTransfer = (new BN(100)).mul(new BN(10).pow(new BN(18)));
const gasPrice = new BN(1000000000); // 1 Gwei

// Contracts used in test
var util;

// eslint-disable-next-line no-undef
contract('Utilities testing', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        // Get contracts used in hook
        util = await TestingUtilities.deployed();

        // Generate web3 and set provider
        web3 = new Web3('http://127.0.0.1:7545');
    });

    // eslint-disable-next-line no-undef
    it('Should test basic token transfer', async () => {
        let initialBalanceReceiver = await web3.eth.getBalance(accounts[2]);
        let initialBalanceSender = await web3.eth.getBalance(accounts[0]);

        const res = await util.transfer(
            accounts[2],
            { from: accounts[0], value: tokensToTransfer, gasPrice },
        );

        const gasUsed = res.receipt.cumulativeGasUsed;
        const transactionCost = (new BN(gasUsed, 10)).mul(new BN(gasPrice));

        let finalBalanceReceiver = await web3.eth.getBalance(accounts[2]);
        let finalBalanceSender = await web3.eth.getBalance(accounts[0]);

        initialBalanceReceiver = new BN(initialBalanceReceiver, 10);
        initialBalanceSender = new BN(initialBalanceSender, 10);
        finalBalanceReceiver = new BN(finalBalanceReceiver, 10);
        finalBalanceSender = new BN(finalBalanceSender, 10);

        const expectedFinalBalanceReceiver = initialBalanceReceiver.add(tokensToTransfer);
        assert(
            expectedFinalBalanceReceiver.eq(finalBalanceReceiver),
            'Incorrect balance of receiver:' +
            `\n\tExpected: ${expectedFinalBalanceReceiver.toString()}` +
            `\n\tActual: ${finalBalanceReceiver.toString()}`,
        );

        const expectedFinalBalanceSender =
            initialBalanceSender.sub(tokensToTransfer).sub(transactionCost);
        assert(
            expectedFinalBalanceSender.eq(finalBalanceSender),
            'Incorrect balance of receiver:' +
            ` \n\tExpected: ${expectedFinalBalanceSender.toString()}`
            + `\n\tActual: ${finalBalanceSender.toString()}`,
        );
    });
});
