const Web3Implementation = require('../Web3Implementation');
const path = require('path');

class Starfleet extends Web3Implementation {
    /**
     * Initializing Starfleet blockchain connector
     */
    constructor({ config, emitter, logger }, configuration) {
        super({
            config,
            emitter,
            logger,
            contractPath: path.join(__dirname, 'abi'),
        }, configuration);

        this.logger.info(`[${this.getBlockchainId()}] Selected blockchain: Starfleet`);
    }

    async getRelativeTracPrice() {
        return undefined;
    }

    async calculateGasPrice() {
        return this.config.gas_price;
    }

    async getGasPrice() {
        return this.config.gas_price;
    }
}

module.exports = Starfleet;
