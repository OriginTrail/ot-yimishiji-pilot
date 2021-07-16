const Web3Implementation = require('../Web3Implementation');
const path = require('path');
const axios = require('axios');
const constants = require('../../constants');


const coinGeckoLink = 'https://api.coingecko.com/api/v3/simple/price?ids=origintrail&vs_currencies=usd';
const gasBlockscoutLink = 'https://blockscout.com/xdai/mainnet/api/v1/gas-price-oracle';

class XDai extends Web3Implementation {
    /**
     * Initializing XDai blockchain connector
     */
    constructor({ config, emitter, logger }, configuration) {
        super({
            config,
            emitter,
            logger,
            contractPath: path.join(__dirname, 'abi'),
        }, configuration);

        this.logger.info(`[${this.getBlockchainId()}] Selected blockchain: xDai`);
    }

    async getRelativeTracPrice() {
        const response = await axios.get(coinGeckoLink);
        if (response) {
            return response.data.origintrail.usd;
        }
        return undefined;
    }

    async getGasPrice(urgent = false) {
        const gasPrice = await this.calculateGasPrice();
        if (gasPrice > this.config.max_allowed_gas_price && !urgent) {
            throw new Error(`[${this.getBlockchainId()}] Gas price higher than maximum allowed price`);
        } else {
            return gasPrice;
        }
    }

    async calculateGasPrice() {
        const now = new Date().getTime();

        if (process.env.NODE_ENV !== 'mainnet' || (this.config.gas_price_last_update_timestamp
            + constants.GAS_PRICE_VALIDITY_TIME_IN_MILLS > now)) {
            this.logger.trace(`[${this.getBlockchainId()}] Using default gas price from `
                + `configuration: ${this.config.gas_price}`);

            return this.config.gas_price;
        }

        let gasBlockscoutPrice = await this.getGasStationGasPrice()
            .catch((err) => { this.logger.warn(err); }) * constants.AVERAGE_GAS_PRICE_MULTIPLIER;
        gasBlockscoutPrice = Math.round(gasBlockscoutPrice);

        if (gasBlockscoutPrice) {
            this.logger.trace(`[${this.getBlockchainId()}] Using gas price from Blockscout service: ${gasBlockscoutPrice}`);

            this.saveNewGasPriceAndTime(gasBlockscoutPrice);
            return gasBlockscoutPrice;
        }

        this.logger.trace(`[${this.getBlockchainId()}] Using gas price from configuration: `
            + `${this.config.gas_price}`);

        return this.config.gas_price;
    }

    async getGasBlockscoutPrice() {
        const response = await axios.get(gasBlockscoutLink)
            .catch((err) => {
                this.logger.warn(err);
                return undefined;
            });
        if (response) {
            return response.average * 100000000;
        }
        return undefined;
    }

    saveNewGasPriceAndTime(gasPrice) {
        this.config.gas_price = gasPrice;
        this.config.gas_price_last_update_timestamp = new Date().getTime();
    }
}

module.exports = XDai;
