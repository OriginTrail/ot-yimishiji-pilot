const Tx = require('ethereumjs-tx');
const { txutils } = require('eth-lightwallet');
const Queue = require('better-queue');
const sleep = require('sleep-async')().Promise;
const BN = require('bn.js');
const Utilities = require('../../Utilities.js');
const { TransactionFailedError } = require('../../errors');
const logger = require('../../logger');

class Transactions {
    /**
     * Initialize Transaction object
     * @param web3 Instance of the Web object
     * @param wallet Blockchain wallet represented in hex string in 0x format
     * @param walletKey Wallet's private in Hex string without 0x at beginning
     * @param log Standard logger object.
     */
    constructor(web3, wallet, walletKey, log = logger) {
        this.web3 = web3;
        this.privateKey = Buffer.from(walletKey, 'hex');
        this.walletAddress = wallet;
        this.logger = log;

        this.queue = new Queue((async (args, cb) => {
            const { transaction, future } = args;
            let transactionHash;
            let transactionHandled = false;
            try {
                for (let i = 0; i < 3; i += 1) {
                    try {
                        const { serializedTx, transactionHash: txHash } =
                            // eslint-disable-next-line no-await-in-loop
                            await this._getTransactionHash(transaction);
                        transactionHash = txHash;

                        // eslint-disable-next-line no-await-in-loop
                        const result = await this._sendTransaction(transaction, serializedTx);
                        if (result.status === '0x0') {
                            future.reject(result);
                        } else {
                            future.resolve(result);
                        }

                        transactionHandled = true;
                        break;
                    } catch (error) {
                        if (error.toString().includes('Failed to check for transaction receipt')) {
                            if (transactionHash && !Utilities.isZeroHash(transactionHash)) {
                                const transactionReceipt =
                                    // eslint-disable-next-line no-await-in-loop
                                    await this._fetchTransactionReceipt(transactionHash);

                                if (transactionReceipt.status) {
                                    future.resolve(transactionReceipt);
                                } else {
                                    future.reject(transactionReceipt);
                                }

                                transactionHandled = true;
                                break;
                            }
                        }

                        if (!error.toString().includes('nonce too low') && !error.toString().includes('underpriced') &&
                            // Ganache's version of nonce error.
                            error.name !== 'TXRejectedError' && !error.toString().includes('the tx doesn\'t have the correct nonce.')
                        ) {
                            throw new Error(error);
                        }

                        this.logger.trace(`Nonce too low / underpriced detected. Retrying. ${error.toString()}`);
                        // eslint-disable-next-line no-await-in-loop
                        await sleep.sleep(2000);
                    }
                }
            } catch (e) {
                future.reject(e);
                cb();
                return;
            }

            if (!transactionHandled) {
                future.reject(new TransactionFailedError('Transaction failed', transaction));
            }
            cb();
        }), { concurrent: 1 });
    }

    /**
     * Send transaction to Ethereum blockchain
     * @returns {PromiEvent<TransactionReceipt>}
     * @param newTransaction
     * @param serializedTx
     */
    async _sendTransaction(newTransaction, serializedTx) {
        const balance = await this.web3.eth.getBalance(this.walletAddress);
        const currentBalance = new BN(balance, 10);
        const requiredAmount =
            new BN(300000)
                .imul(new BN(Utilities.denormalizeHex(newTransaction.options.gasPrice), 16));
        const totalPriceBN =
            new BN(Utilities.denormalizeHex(newTransaction.options.gasPrice), 16)
                .imul(new BN(Utilities.denormalizeHex(newTransaction.options.gasLimit), 16));

        if (currentBalance.lt(totalPriceBN)) {
            throw Error(`ETH balance lower (${currentBalance.toString()}) than transaction cost (${totalPriceBN.toString()}).`);
        }
        // If current balance not enough for 300000 gas notify low ETH balance.
        if (currentBalance.lt(requiredAmount)) {
            this.logger.warn(`ETH balance running low! Your balance: ${currentBalance.toString()}  wei, while minimum required is: ${requiredAmount.toString()} wei`);
        }

        this.logger.trace(`Sending transaction to blockchain, nonce ${newTransaction.options.nonce}, balance is ${currentBalance.toString()}`);
        return this.web3.eth.sendSignedTransaction(serializedTx);
    }

    /**
     * Calculates the transaction hash for an Ethereum blockchain transaction object
     * @returns string - transactionHash
     * @param newTransaction
     */
    async _getTransactionHash(newTransaction) {
        if (!Utilities.isHexStrict(newTransaction.options.gasPrice)) {
            throw Error('Gas price has to be in hex format.');
        }

        if (!Utilities.isHexStrict(newTransaction.options.gasLimit)) {
            throw Error('Gas limit has to be in hex format.');
        }

        await this.web3.eth.getTransactionCount(this.walletAddress).then((nonce) => {
            newTransaction.options.nonce = nonce;
        });

        const rawTx = txutils.functionTx(
            newTransaction.contractAbi,
            newTransaction.method,
            newTransaction.args,
            newTransaction.options,
        );

        const transaction = new Tx(rawTx);

        transaction.sign(this.privateKey);

        const serializedTx = Utilities.normalizeHex(transaction.serialize().toString('hex'));

        return {
            serializedTx,
            transactionHash: this.web3.utils.sha3(serializedTx, { encoding: 'hex' }),
        };
    }

    async _fetchTransactionReceipt(transactionHash) {
        let receipt;
        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await Utilities.sleepForMilliseconds(5000);

            try {
                // eslint-disable-next-line no-await-in-loop
                receipt = await this.web3.eth.getTransactionReceipt(transactionHash);
                if (Object.keys(receipt).length > 0) {
                    break;
                }
                this.logger.warn(`Failed to fetch transaction receipt from empty response on attempt ${i + 1}.`);
            } catch (e) {
                this.logger.warn(`Failed to fetch transaction receipt. Error: ${e.toString()}`);
            }
        }

        return receipt;
    }

    /**
     * Adding new transaction in transaction queue
     * @param contractAbi
     * @param method
     * @param args
     * @param options
     * @returns {Promise<any>}
     */
    queueTransaction(contractAbi, method, args, options) {
        return new Promise((async (resolve, reject) => {
            const transaction = {
                contractAbi, method, args, options,
            };

            this.queue.push({
                transaction,
                future: {
                    resolve, reject,
                },
            });
        }));
    }
}

module.exports = Transactions;
