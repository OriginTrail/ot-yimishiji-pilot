process.env.NODE_ENV = 'mainnet';

const {
    describe, before, beforeEach, it,
} = require('mocha');
const PricingService = require('../../../modules/service/pricing-service');
const awilix = require('awilix');
const defaultConfig = require('../../../config/config.json').mainnet;
const rc = require('rc');
const pjson = require('../../../package.json');
const logger = require('../../../modules/logger');
const { assert, expect } = require('chai');
const constants = require('../../../modules/constants');
const Blockchain = require('../../../modules/Blockchain');
const EventEmitter = require('../../../modules/EventEmitter');
const Product = require('../../../modules/Product');
const GraphStorage = require('../../../modules/Database/GraphStorage');
const BlockchainPluginService = require('../../../modules/Blockchain/plugin/blockchain-plugin-service');

const log = require('../../../modules/logger');

let pricingService;
let gasStationService;
let web3ServiceMock;
let tracPriceService;

const defaultConfigGasPrice = 20000000000;
const defaultGasStationGasPrice = 20000000000;
const defaultWeb3GasPrice = 20000000000;

const dataSizeInBytes = 1000;
const bigDataSizeInBytes = 100000;
const holdingTimeInMinutes = 60;
const longHoldingTimeInMinutes = 60000000;
const defaultPriceFactor = 2;
let config;
let blockchain;

class GasStationServiceMock {
    constructor(logger) {
        this.logger = logger;
        this.gasPrice = defaultGasStationGasPrice;
        this.logger.debug('Gas station service mock initialized');
    }

    async getGasPrice() {
        this.logger.debug('Returning axios service gas price');
        return this.gasPrice;
    }
}

class Web3Mock {
    constructor(logger) {
        this.logger = logger;
        this.eth = {
            gasPrice: defaultWeb3GasPrice,
            async getGasPrice() {
                return this.gasPrice;
            },
        };
    }
}

describe('Pricing service test', () => {
    beforeEach('Setup container', async () => {
        // Create the container and set the injectionMode to PROXY (which is also the default).
        process.env.NODE_ENV = 'mainnet';
        const container = awilix.createContainer({
            injectionMode: awilix.InjectionMode.PROXY,
        });

        const appState = {};

        config = rc(pjson.name, defaultConfig);
        config.blockchain.implementations[0].gas_price = defaultConfigGasPrice;
        config.blockchain.implementations[0].gas_price_last_update_timestamp = 0;
        config.blockchain.implementations[0].rpc_server_url = 'http://localhost:7545/';
        gasStationService = new GasStationServiceMock(logger);
        web3ServiceMock = new Web3Mock(logger);
        container.register({
            config: awilix.asValue(config),
            gasStationService: awilix.asValue(gasStationService),
            web3: awilix.asValue(web3ServiceMock),
            blockchain: awilix.asClass(Blockchain).singleton(),
            graphStorage: awilix.asValue(new GraphStorage(config.database, log)),
            emitter: awilix.asValue({}),
            product: awilix.asClass(Product).singleton(),
            logger: awilix.asValue(log),
            appState: awilix.asValue(appState),
            blockchainPluginService: awilix.asClass(BlockchainPluginService).singleton(),
        });
        pricingService = new PricingService(container.cradle);
        blockchain = container.resolve('blockchain');

        blockchain.blockchain[0].initialized = true;
    });

    it('Get gas price - env is develop - expect default is returned', async () => {
        process.env.NODE_ENV = 'development';
        const gasPrice = await blockchain.getGasPrice().response;
        assert.equal(gasPrice, defaultConfigGasPrice, 'Gas price should be the same as in config');
    });

    // TODO Refactor in the next sprint
    it.skip('Get gas price - env is mainnet, all services return valid value - expect axios value is used', async () => {
        const gasPrice = await blockchain.getGasPrice().response;
        assert.equal(gasPrice, defaultGasStationGasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Returned gas price price should be the same as default axios gas price');
        assert.equal(blockchain.blockchain[0].config.gas_price, defaultGasStationGasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Configuration gas price should be the same as default axios gas price');
        const now = new Date().getTime();
        assert.closeTo(blockchain.blockchain[0].config.gas_price_last_update_timestamp, now, 1000, 'Now should be set as new timestamp');
    });

    it('Get gas price - env is mainnet, all services return valid value, timestamp is not older than 30 min - expect config value is used', async () => {
        const lastUpdateTimestamp = new Date().getTime() - (1000 * 25);
        blockchain.blockchain[0].config.gas_price_last_update_timestamp = lastUpdateTimestamp;
        pricingService.config = config;
        const gasPrice = await blockchain.getGasPrice().response;
        assert.equal(gasPrice, blockchain.blockchain[0].config.gas_price, 'Gas price should be the same as default config');
        assert.equal(blockchain.blockchain[0].config.gas_price_last_update_timestamp, lastUpdateTimestamp, 'Timestamp should not be changed');
    });

    // TODO Refactor in the next sprint
    it.skip('Get gas price - env is mainnet, axios returns undefined - expect web3 value is used', async () => {
        gasStationService.gasPrice = undefined;
        blockchain.blockchain[0].gasStationService = gasStationService;
        blockchain.blockchain[0].web3 = web3ServiceMock;
        const gasPrice = await blockchain.getGasPrice().response;
        const now = new Date().getTime();
        assert.equal(gasPrice, defaultWeb3GasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Gas price should be the same as default web3');
        assert.equal(blockchain.blockchain[0].config.gas_price, defaultWeb3GasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Gas price should be the same as default web3');
        assert.closeTo(blockchain.blockchain[0].config.gas_price_last_update_timestamp, now, 1000, 'Timestamp should not be changed');
    });

    // TODO Refactor in the next sprint
    it.skip('Get gas price - env is mainnet, web3 returns undefined - expect axios value is used', async () => {
        web3ServiceMock.eth.gasPrice = undefined;
        blockchain.blockchain[0].gasStationService = gasStationService;
        blockchain.blockchain[0].web3 = web3ServiceMock;
        const gasPrice = await blockchain.getGasPrice().response;
        const now = new Date().getTime();
        assert.equal(gasPrice, defaultGasStationGasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Gas price should be the same as default axios');
        assert.equal(blockchain.blockchain[0].config.gas_price, defaultGasStationGasPrice * constants.AVERAGE_GAS_PRICE_MULTIPLIER, 'Gas price should be the same as default axios');
        assert.closeTo(blockchain.blockchain[0].config.gas_price_last_update_timestamp, now, 1000, 'Timestamp should not be changed');
    });

    // TODO Refactor in the next sprint
    it.skip('Calculate offer price in trac - data size in bytes not provided - expect error', async () => {
        var message = '';
        try {
            await pricingService.calculateOfferPriceinTrac(
                null,
                holdingTimeInMinutes, defaultPriceFactor,
            );
            expect().to.throw();
        } catch (error) {
            // eslint-disable-next-line prefer-destructuring
            message = error.message;
        }
        assert.equal(message, 'Calculate offer price method called. Data size in bytes not defined!');
    });

    it('Calculate offer price in trac - holding time in minutes not provided - expect error', async () => {
        var message = '';
        try {
            await pricingService.calculateOfferPriceinTrac(
                dataSizeInBytes,
                null, defaultPriceFactor,
            );
            expect().to.throw();
        } catch (error) {
            // eslint-disable-next-line prefer-destructuring
            message = error.message;
        }
        assert.equal(message, 'Calculate offer price method called. Holding time in minutes not defined!');
    });

    it('Calculate offer price in trac - env is development, expect valid value is returned', async () => {
        process.env.NODE_ENV = 'development';
        const price = await pricingService
            .calculateOfferPriceinTrac(dataSizeInBytes, holdingTimeInMinutes, defaultPriceFactor);
        const bigDataPrice = await pricingService
            .calculateOfferPriceinTrac(
                bigDataSizeInBytes,
                holdingTimeInMinutes, defaultPriceFactor,
            );
        assert.isAbove(bigDataPrice.finalPrice, price.finalPrice);
        const longDataPrice = await pricingService
            .calculateOfferPriceinTrac(
                dataSizeInBytes,
                longHoldingTimeInMinutes, defaultPriceFactor,
            );
        assert.isAbove(longDataPrice.finalPrice, price.finalPrice);
    });
});
