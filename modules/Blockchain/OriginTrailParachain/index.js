const path = require('path');

const Utilities = require('../../Utilities');
const Web3Implementation = require('../Web3Implementation');

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

        this.logger.info(`[${this.getBlockchainId()}] Selected blockchain: OriginTrail Parachain`);
    }

    async getRelativeTracPrice() {
        return '1';
    }

    async calculateGasPrice() {
        return this.config.gas_price;
    }

    async getGasPrice() {
        return this.config.gas_price;
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
        this.logger.trace(`[${this.getBlockchainId()}] CreateProfile(${managementWallet}, ${profileNodeId}, ${hasERC725}, ${blockchainIdentity}), value ${initialBalance}`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'createProfile',
            [
                managementWallet, Utilities.normalizeHex(profileNodeId),
                hasERC725, blockchainIdentity,
            ], options,
        );
    }
}

module.exports = OriginTrailParachain;
