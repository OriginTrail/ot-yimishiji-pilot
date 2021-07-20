const path = require('path');

const Utilities = require('../../Utilities');
const Web3Implementation = require('../Web3Implementation');

const IdentityContractBytecode = require('./bytecode/identity').bytecode;

const Web3 = require('web3');


class OriginTrailParachain extends Web3Implementation {
    /**
     * Initializing OriginTrail Parachain blockchain connector
     */
    constructor({ config, emitter, logger }, configuration) {
        super({
            config,
            emitter,
            logger,
            contractPath: path.join(__dirname, 'abi'),
        }, configuration);
        this.web3 = new Web3(this.config.rpc_server_url);
        this.logger.info(`[${this.getBlockchainId()}] Selected blockchain: OriginTrail Parachain`);
    }

    async getRelativeTracPrice() {
        return '1';
    }

    async calculateGasPrice() {
        // TODO Add logic for pricing mechanism based on Parachain
        return this.config.gas_price;
    }

    async getGasPrice() {
        // TODO Add logic for pricing mechanism based on Parachain
        return this.config.gas_price;
    }

    async createIdentity(managementWallet) {
        const parameters = this.web3.eth.abi.encodeParameters(
            ['address'],
            [managementWallet],
        ).slice(2);

        const createTransaction = await this.web3.eth.accounts.signTransaction({
            from: this.config.node_wallet,
            data: `${IdentityContractBytecode}${parameters}`,
            value: '0x00',
            gas: this.config.gas_limit,
            gasPrice: this.getGasPrice(),
            chainId: this.config.blockchain_id,
        }, this.config.node_private_key);

        const createReceipt =
            await this.web3.eth.sendSignedTransaction(createTransaction.rawTransaction);

        return createReceipt;
    }

    /**
     * Creates node profile on the Profile contract
     * @param managementWallet - Management wallet
     * @param profileNodeId - Network node ID
     * @param {Object<BigNumber>} initialBalance - Initial profile balance
     * @param {Boolean} hasERC725 - Does sender already have an ERC 725 identity?
     * @param blockchainIdentity - ERC 725 identity (empty if there is none)
     * @return {Promise<any>}
     */
    async createProfile(
        managementWallet,
        profileNodeId,
        initialBalance,
        hasERC725,
        blockchainIdentity,
    ) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            value: initialBalance.toString(16),
            to: this.profileContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] CreateProfile(${managementWallet}, ${profileNodeId}, ${blockchainIdentity}), value ${initialBalance}`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'createProfile',
            [managementWallet, Utilities.normalizeHex(profileNodeId), blockchainIdentity],
            options,
        );
    }
}

module.exports = OriginTrailParachain;
