const fs = require('fs');
const BN = require('bn.js');
const uuidv4 = require('uuid/v4');
const ethereumAbi = require('ethereumjs-abi');
const Op = require('sequelize/lib/operators');
const Web3 = require('web3');

const Transactions = require('./Transactions');
const Utilities = require('../../Utilities');
const Models = require('../../../models');
const path = require('path');
const constants = require('../../constants');


/**
 * Abstract class for all web3 based blockchain implementations
 */
class Web3Implementation {
    /**
     * Initializing Web3 based blockchain connector
     */
    constructor({
        config, emitter, logger, contractPath,
    }, configuration) {
        this.contractsLoaded = false;
        this.initialized = false;


        if (process.env.RPC_SERVER_URL) {
            configuration.rpc_server_url = process.env.RPC_SERVER_URL;
        }

        if (!configuration.rpc_server_url) {
            console.error('Please provide a valid RPC server URL.\n' +
                'Add it to the blockchain section. For example:\n' +
                '   "blockchain": {\n' +
                '       "rpc_server_url": "http://your.server.url/"\n' +
                '   }');
            return;
        }

        // Loading Web3
        this.emitter = emitter;
        this.web3 = new Web3(new Web3.providers.HttpProvider(configuration.rpc_server_url));
        this.logger = logger;
        this.contractPath = contractPath;

        this.config = configuration;
        this.config.appDataPath = config.appDataPath;

        if (!this.config.node_wallet || !this.config.node_private_key) {
            console.error('Please provide valid operational wallet.');
            return;
        }

        if (!this.config.management_wallet) {
            console.error('Please provide valid management wallet.');
            return;
        }

        const identityObject = Utilities.loadJsonFromFile(
            this.config.appDataPath,
            this.config.identity_filepath,
        );

        if (identityObject) {
            this.config.identity = identityObject.identity;
        }

        this.transactions = new Transactions(
            this.web3,
            this.config.node_wallet,
            this.config.node_private_key,
        );

        // Loading contracts
        this.hubContractAddress = this.config.hub_contract_address;

        const hubAbiFile = fs.readFileSync(path.join(this.contractPath, 'hub.json'));
        this.hubContractAbi = JSON.parse(hubAbiFile);
        this.hubContract = new this.web3.eth.Contract(this.hubContractAbi, this.hubContractAddress);
    }

    /**
     * Loads contracts for Blockchain provider (get contract addresses, etc.)
     * @returns {Promise<void>}
     */
    async loadContracts() {
        // Holding contract data
        const holdingAbiFile = fs.readFileSync(path.join(this.contractPath, 'holding.json'));
        this.holdingContractAddress = await this._getHoldingContractAddress();
        this.holdingContractAbi = JSON.parse(holdingAbiFile);
        this.holdingContract = new this.web3.eth
            .Contract(this.holdingContractAbi, this.holdingContractAddress);

        // Old Holding contract data
        const oldHoldingAbiFile = fs.readFileSync(path.join(this.contractPath, 'old-holding.json'));
        this.oldHoldingContractAddress = await this._getOldHoldingContractAddress();
        if (!Utilities.isZeroHash(this.oldHoldingContractAddress)) {
            this.oldHoldingContractAbi = JSON.parse(oldHoldingAbiFile);
            this.oldHoldingContract = new this.web3.eth
                .Contract(this.oldHoldingContractAbi, this.oldHoldingContractAddress);
        }

        // Token contract data
        const tokenAbiFile = fs.readFileSync(path.join(this.contractPath, 'token.json'));
        this.tokenContractAddress = await this._getTokenContractAddress();
        this.tokenContractAbi = JSON.parse(tokenAbiFile);
        this.tokenContract = new this.web3.eth.Contract(
            this.tokenContractAbi,
            this.tokenContractAddress,
        );

        // Profile contract data
        const profileAbiFile = fs.readFileSync(path.join(this.contractPath, 'profile.json'));
        this.profileContractAddress = await this._getProfileContractAddress();
        this.profileContractAbi = JSON.parse(profileAbiFile);
        this.profileContract = new this.web3.eth.Contract(
            this.profileContractAbi,
            this.profileContractAddress,
        );

        // Approval contract data
        const approvalAbiFile = fs.readFileSync(path.join(this.contractPath, 'approval.json'));
        this.approvalContractAddress = await this._getApprovalContractAddress();
        this.approvalContractAbi = JSON.parse(approvalAbiFile);
        this.approvalContract = new this.web3.eth.Contract(
            this.approvalContractAbi,
            this.approvalContractAddress,
        );

        // Profile storage contract data
        const profileStorageAbiFile = fs.readFileSync(path.join(this.contractPath, 'profile-storage.json'));
        this.profileStorageContractAddress = await this._getProfileStorageContractAddress();
        this.profileStorageContractAbi = JSON.parse(profileStorageAbiFile);
        this.profileStorageContract = new this.web3.eth.Contract(
            this.profileStorageContractAbi,
            this.profileStorageContractAddress,
        );

        // Holding storage contract data
        const holdingStorageAbiFile = fs.readFileSync(path.join(this.contractPath, 'holding-storage.json'));
        this.holdingStorageContractAddress = await this._getHoldingStorageContractAddress();
        this.holdingStorageContractAbi = JSON.parse(holdingStorageAbiFile);
        this.holdingStorageContract = new this.web3.eth.Contract(
            this.holdingStorageContractAbi,
            this.holdingStorageContractAddress,
        );

        // Old Holding storage contract data
        const oldHoldingStorageAbiFile = fs.readFileSync(path.join(this.contractPath, 'holding-storage.json'));
        this.oldHoldingStorageContractAddress = await this._getOldHoldingStorageContractAddress();
        if (!Utilities.isZeroHash(this.oldHoldingStorageContractAddress)) {
            this.oldHoldingStorageContractAbi = JSON.parse(oldHoldingStorageAbiFile);
            this.oldHoldingStorageContract = new this.web3.eth.Contract(
                this.oldHoldingStorageContractAbi,
                this.oldHoldingStorageContractAddress,
            );
        }

        // Litigation contract data
        const litigationAbiFile = fs.readFileSync(path.join(this.contractPath, 'litigation.json'));
        this.litigationContractAddress = await this._getLitigationContractAddress();
        this.litigationContractAbi = JSON.parse(litigationAbiFile);
        this.litigationContract = new this.web3.eth.Contract(
            this.litigationContractAbi,
            this.litigationContractAddress,
        );

        // Litigation storage contract data
        const litigationStorageAbiFile = fs.readFileSync(path.join(this.contractPath, 'litigation-storage.json'));
        this.litigationStorageContractAddress = await this._getLitigationStorageContractAddress();
        this.litigationStorageContractAbi = JSON.parse(litigationStorageAbiFile);
        this.litigationStorageContract = new this.web3.eth.Contract(
            this.litigationStorageContractAbi,
            this.litigationStorageContractAddress,
        );

        // Marketplace contract data
        const marketplaceAbiFile = fs.readFileSync(path.join(this.contractPath, 'marketplace.json'));
        this.marketplaceContractAddress = await this._getMarketplaceContractAddress();
        this.marketplaceContractAbi = JSON.parse(marketplaceAbiFile);
        this.marketplaceContract = new this.web3.eth.Contract(
            this.marketplaceContractAbi,
            this.marketplaceContractAddress,
        );

        // Marketplace storage contract data
        const marketplaceStorageAbiFile = fs.readFileSync(path.join(this.contractPath, 'marketplace-storage.json'));
        this.marketplaceStorageContractAddress = await this._getMarketplaceStorageContractAddress();
        this.marketplaceStorageContractAbi = JSON.parse(marketplaceStorageAbiFile);
        this.marketplaceStorageContract = new this.web3.eth.Contract(
            this.marketplaceStorageContractAbi,
            this.marketplaceStorageContractAddress,
        );

        // Litigation contract data
        const replacementAbiFile = fs.readFileSync(path.join(this.contractPath, 'replacement.json'));
        this.replacementContractAddress = await this._getReplacementContractAddress();
        this.replacementContractAbi = JSON.parse(replacementAbiFile);
        this.replacementContract = new this.web3.eth.Contract(
            this.replacementContractAbi,
            this.replacementContractAddress,
        );

        // ERC725 identity contract data. Every user has own instance.
        const erc725IdentityAbiFile = fs.readFileSync(path.join(this.contractPath, 'erc725.json'));
        this.erc725IdentityContractAbi = JSON.parse(erc725IdentityAbiFile);

        this.contractsByName = {
            HUB_CONTRACT: this.hubContract,
            HOLDING_CONTRACT: this.holdingContract,
            OLD_HOLDING_CONTRACT: this.oldHoldingContract, // TODO remove after successful migration
            PROFILE_CONTRACT: this.profileContract,
            APPROVAL_CONTRACT: this.approvalContract,
            LITIGATION_CONTRACT: this.litigationContract,
            MARKETPLACE_CONTRACT: this.marketplaceContract,
            REPLACEMENT_CONTRACT: this.replacementContract,
        };

        if (this.oldHoldingContract) {
            this.contractsByName.OLD_HOLDING_CONTRACT = this.oldHoldingContract;
        }

        this.contractsLoaded = true;

        this.logger.info(`[${this.getBlockchainId()}] Smart contract instances initialized.`);
    }

    initialize() {
        this.initialized = true;
    }

    /**
     * Gets Holding contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getHoldingContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Holding contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Holding').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Holding contract address is ${address}`);
        return address;
    }

    /**
     * Gets old Holding contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getOldHoldingContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for old Holding contract address...`);
        const address = await this.hubContract.methods.getContractAddress('OldHolding').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Old Holding contract address is ${address}`);
        return address;
    }

    /**
     * Gets Token contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getTokenContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Token contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Token').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Token contract address is ${address}`);
        return address;
    }

    /**
     * Gets Reading contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getReadingContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Reading contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Reading').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Reading contract address is ${address}`);
        return address;
    }

    /**
     * Gets Profile contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getProfileContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Profile contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Profile').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Profile contract address is ${address}`);
        return address;
    }

    /**
     * Gets Approval contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getApprovalContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Approval contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Approval').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Approval contract address is ${address}`);
        return address;
    }

    /**
     * Gets Profile storage contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getProfileStorageContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for ProfileStorage contract address...`);
        const address = await this.hubContract.methods.getContractAddress('ProfileStorage').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] ProfileStorage contract address is ${address}`);
        return address;
    }

    /**
     * Gets Holding storage contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getHoldingStorageContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for HoldingStorage contract address...`);
        const address = await this.hubContract.methods.getContractAddress('HoldingStorage').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] HoldingStorage contract address is ${address}`);
        return address;
    }

    /**
     * Gets old Holding storage contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getOldHoldingStorageContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for old HoldingStorage contract address...`);
        const address = await this.hubContract.methods.getContractAddress('OldHoldingStorage').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Old HoldingStorage contract address is ${address}`);
        return address;
    }

    /**
     * Gets Litigation contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getLitigationContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Litigation contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Litigation').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Litigation contract address is ${address}`);
        return address;
    }

    /**
     * Gets Marketplace contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getMarketplaceContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Marketplace contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Marketplace').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Marketplace contract address is ${address}`);
        return address;
    }

    /**
     * Gets Replacement contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getReplacementContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for Replacement contract address...`);
        const address = await this.hubContract.methods.getContractAddress('Replacement').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] Replacement contract address is ${address}`);
        return address;
    }

    /**
     * Gets Litigation storage contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getLitigationStorageContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for LitigationStorage contract address...`);
        const address = await this.hubContract.methods.getContractAddress('LitigationStorage').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] LitigationStorage contract address is ${address}`);
        return address;
    }

    /**
     * Gets Marketplace storage contract address from Hub
     * @returns {Promise<any>}
     * @private
     */
    async _getMarketplaceStorageContractAddress() {
        this.logger.trace(`[${this.getBlockchainId()}] Asking Hub for MarketplaceStorage contract address...`);
        const address = await this.hubContract.methods.getContractAddress('MarketplaceStorage').call({
            from: this.config.node_wallet,
        });
        this.logger.trace(`[${this.getBlockchainId()}] MarketplaceStorage contract address is ${address}`);
        return address;
    }

    /**
     * Gets root hash for import
     * @param dataSetId Data set ID
     * @return {Promise<any>}
     */
    async getRootHash(dataSetId) {
        this.logger.trace(`[${this.getBlockchainId()}] Fetching root hash for data set ${dataSetId}`);
        const rootHash = await this.holdingStorageContract.methods.fingerprint(dataSetId).call();
        if (Utilities.isZeroHash(rootHash) && this.oldHoldingStorageContract) {
            return this.oldHoldingStorageContract.methods.fingerprint(dataSetId).call();
        }
        return rootHash;
    }

    /**
     * Gets TRAC balance by wallet
     * @param wallet
     * @returns {Promise}
     */
    getWalletTokenBalance(wallet) {
        return new Promise((resolve, reject) => {
            this.logger.trace(`[${this.getBlockchainId()}] Getting TRAC balance by wallet ${wallet}`);
            this.tokenContract.methods.balanceOf(wallet).call()
                .then((res) => {
                    resolve(res);
                }).catch((e) => {
                    reject(e);
                });
        });
    }

    /**
     * Gets ETH balance by wallet
     * @param wallet
     * @returns {Promise}
     */
    getWalletBaseBalance(wallet) {
        return new Promise((resolve, reject) => {
            this.logger.trace(`[${this.getBlockchainId()}] Getting base balance by wallet ${wallet}`);
            this.web3.eth.getBalance(wallet)
                .then((res) => {
                    resolve(res);
                }).catch((e) => {
                    reject(e);
                });
        });
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
            to: this.profileContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] CreateProfile(${managementWallet}, ${profileNodeId}, ${initialBalance}, ${hasERC725}, ${blockchainIdentity})`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'createProfile',
            [
                managementWallet,
                Utilities.normalizeHex(profileNodeId),
                initialBalance, hasERC725, blockchainIdentity,
            ], options,
        );
    }

    /**
     * Increase token approval for profile
     * @param {number} tokenAmountIncrease
     * @returns {Promise}
     */
    async increaseProfileApproval(tokenAmountIncrease) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.tokenContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] increaseProfileApproval(amount=${tokenAmountIncrease})`);
        return this.transactions.queueTransaction(this.tokenContractAbi, 'increaseApproval', [this.profileContractAddress, tokenAmountIncrease], options);
    }

    /**
     * Start token withdrawal operation
     * @param blockchainIdentity
     * @param amount
     * @return {Promise<any>}
     */
    async startTokenWithdrawal(blockchainIdentity, amount) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.profileContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] startTokenWithdrawal(blockchainIdentity=${blockchainIdentity}, amount=${amount}`);
        return this.transactions.queueTransaction(this.profileContractAbi, 'startTokenWithdrawal', [blockchainIdentity, amount], options);
    }

    /**
     * Start token withdrawal operation
     * @param blockchainIdentity
     * @return {Promise<any>}
     */
    async withdrawTokens(blockchainIdentity) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.profileContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] withdrawTokens(blockchainIdentity=${blockchainIdentity}`);
        return this.transactions.queueTransaction(this.profileContractAbi, 'withdrawTokens', [blockchainIdentity], options);
    }

    /**
     * Answers litigation from DH side
     * @param offerId - Offer ID
     * @param holderIdentity - DH identity
     * @param answer - Litigation answer
     * @param urgent - Whether maximum gas price should be used
     * @return {Promise<any>}
     */
    async answerLitigation(offerId, holderIdentity, answer, urgent) {
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(constants.ANSWER_LITIGATION_GAS_LIMIT),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.litigationContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] answerLitigation (offerId=${offerId}, holderIdentity=${holderIdentity}, answer=${answer})`);
        return this.transactions.queueTransaction(
            this.litigationContractAbi,
            'answerLitigation',
            [
                offerId,
                holderIdentity,
                answer,
            ],
            options,
        );
    }

    /**
     * Pay out tokens
     * @param blockchainIdentity
     * @param offerId
     * @param urgent
     * @returns {Promise}
     */
    async payOut(blockchainIdentity, offerId, urgent) {
        let contractAddress = this.holdingContractAddress;

        const offer = await this.getOffer(offerId);
        if (Utilities.isZeroHash(offer['0']) && this.oldHoldingContract) {
            contractAddress = this.oldHoldingContractAddress;
        }
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: contractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] payOut(blockchainIdentity=${blockchainIdentity}, offerId=${offerId}`);
        return this.transactions.queueTransaction(this.holdingContractAbi, 'payOut', [blockchainIdentity, offerId], options);
    }

    /**
     * PayOut for multiple offers.
     * @returns {Promise<any>}
     */
    async payOutMultiple(
        blockchainIdentity,
        offerIds,
    ) {
        const gasLimit = offerIds.length * 200000;
        const gasPrice = await this.getGasPrice(true);
        const options = {
            gasLimit: this.web3.utils.toHex(gasLimit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.oldHoldingContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] payOutMultiple (identity=${blockchainIdentity}, offerIds=${offerIds}`);
        return this.transactions.queueTransaction(
            this.oldHoldingContractAbi, 'payOutMultiple',
            [
                blockchainIdentity,
                offerIds,
            ],
            options,
        );
    }

    /**
     * Creates offer for the data storing on the Ethereum blockchain.
     * @returns {Promise<any>} Return choose start-time.
     */
    async createOffer(
        blockchainIdentity,
        dataSetId,
        dataRootHash,
        redLitigationHash,
        greenLitigationHash,
        blueLitigationHash,
        dcNodeId,
        holdingTimeInMinutes,
        tokenAmountPerHolder,
        dataSizeInBytes,
        litigationIntervalInMinutes,
        urgent,
    ) {
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.holdingContractAddress,
        };
        this.logger.trace(`[${this.getBlockchainId()}] createOffer (${blockchainIdentity}, ${dataSetId}, ${dataRootHash}, ${redLitigationHash}, ${greenLitigationHash}, ${blueLitigationHash}, ${dcNodeId}, ${holdingTimeInMinutes}, ${tokenAmountPerHolder}, ${dataSizeInBytes}, ${litigationIntervalInMinutes})`);
        return this.transactions.queueTransaction(
            this.holdingContractAbi, 'createOffer',
            [
                blockchainIdentity,
                dataSetId,
                dataRootHash,
                redLitigationHash,
                greenLitigationHash,
                blueLitigationHash,
                dcNodeId,
                holdingTimeInMinutes,
                tokenAmountPerHolder,
                dataSizeInBytes,
                litigationIntervalInMinutes,
            ],
            options,
        );
    }

    /**
     * Finalizes offer on Blockchain
     * @returns {Promise<any>}
     */
    async finalizeOffer(
        blockchainIdentity,
        offerId,
        shift,
        confirmation1,
        confirmation2,
        confirmation3,
        encryptionType,
        holders,
        parentIdentity,
        urgent,
    ) {
        let contractAddress = this.holdingContractAddress;

        const offer = await this.getOffer(offerId);
        if (Utilities.isZeroHash(offer['0'])) {
            contractAddress = this.oldHoldingContractAddress;
        }
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: contractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] finalizeOffer (${blockchainIdentity}, ${offerId}, ${shift}, ${confirmation1}, ${confirmation2}, ${confirmation3}, ${encryptionType}, ${holders}), ${parentIdentity}`);
        return this.transactions.queueTransaction(
            this.holdingContractAbi, 'finalizeOffer',
            [
                blockchainIdentity,
                offerId,
                shift,
                confirmation1,
                confirmation2,
                confirmation3,
                encryptionType,
                holders,
                parentIdentity,
            ],
            options,
        );
    }

    /**
     * Replaces holder
     * @returns {Promise<any>}
     */
    async replaceHolder(
        offerId,
        holderIdentity,
        litigatorIdentity,
        shift,
        confirmation1,
        confirmation2,
        confirmation3,
        holders,
    ) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.replacementContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] replaceHolder (${offerId}, ${holderIdentity}, ${litigatorIdentity}, ${shift}, ${confirmation1}, ${confirmation2}, ${confirmation3}, ${holders})`);
        return this.transactions.queueTransaction(
            this.replacementContractAbi, 'replaceHolder',
            [
                offerId,
                holderIdentity,
                litigatorIdentity,
                shift,
                confirmation1,
                confirmation2,
                confirmation3,
                holders,
            ],
            options,
        );
    }

    /**
     * Gets the current block if one wasn't retrieved in the last 10 seconds
     * @returns {int}
     */
    async getCurrentBlock() {
        const timeout = 10000;
        if (this.lastBlockCheck == null || this.lastBlockCheck + timeout < Date.now()) {
            this.lastBlock = await this.web3.eth.getBlockNumber();
            this.lastBlockCheck = Date.now();
        }

        return this.lastBlock;
    }

    /**
     * Gets the version variable from a contract, might throw an error if the variable doesn't exist
     * @param contractName
     * @returns {Promise<String>}
     */
    async getContractVersion(contractName) {
        this.logger.trace(`[${this.getBlockchainId()}] Reading ${contractName} contract version.`);
        const contract = this.contractsByName[contractName];

        if (!contract || Utilities.isZeroHash(contract._address)) {
            return;
        }

        const code = await this.web3.eth.getCode(contract._address);

        const signature = 'version()';
        const hash = this.web3.eth.abi.encodeFunctionSignature(signature);

        if (code.indexOf(hash.slice(2, hash.length)) > 0) {
            return contract.methods.version().call();
        }
        throw Error('Contract does not have version variable');
    }

    /**
     * Gets all past events for the contract
     * @param contractName
     * @param fromBlock
     */
    async getAllPastEvents(contractName, fromBlock) {
        try {
            const contract = this.contractsByName[contractName];
            if (!contract || Utilities.isZeroHash(contract._address)) {
                return;
            }

            const events = await contract.getPastEvents('allEvents', {
                fromBlock,
                toBlock: 'latest',
            });

            return events;
        } catch (error) {
            if (error.msg && error.msg.includes('Invalid JSON RPC response')) {
                this.logger.warn(`[${this.getBlockchainId()}] Node failed to communicate with blockchain provider. Check internet connection`);
            } else {
                this.logger.trace(`[${this.getBlockchainId()}] Failed to get all passed events. ${error}.`);
            }
        }
    }

    /**
    * Subscribes to blockchain events
    * @param event
    * @param importId
    * @param filterFn
    * @param endMs
    * @param endCallback
    */
    subscribeToEvent(event, importId, endMs = 5 * 60 * 1000, endCallback, filterFn) {
        return new Promise((resolve, reject) => {
            let clearToken;
            const token = setInterval(() => {
                const where = {
                    event,
                    finished: 0,
                };
                if (importId) {
                    where.import_id = importId;
                }
                Models.events.findAll({
                    where,
                }).then((events) => {
                    for (const eventData of events) {
                        const parsedData = JSON.parse(eventData.dataValues.data);

                        let ok = true;
                        if (filterFn) {
                            ok = filterFn(parsedData);
                        }
                        if (!ok) {
                            // eslint-disable-next-line
                            continue;
                        }
                        eventData.finished = 1;
                        // eslint-disable-next-line no-loop-func
                        eventData.save().then(() => {
                            clearTimeout(clearToken);
                            clearInterval(token);
                            resolve(parsedData);
                        }).catch((err) => {
                            this.logger.error(`[${this.getBlockchainId()}] Failed to update event ${event}. ${err}`);
                            reject(err);
                        });
                        break;
                    }
                });
            }, 2000);
            clearToken = setTimeout(() => {
                if (endCallback) {
                    endCallback();
                }
                clearInterval(token);
                resolve(null);
            }, endMs);
        });
    }

    /**
     * Deposit tokens to profile
     * @param blockchainIdentity
     * @param amount
     * @returns {Promise<any>}
     */
    async depositTokens(blockchainIdentity, amount) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.profileContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] Calling - depositToken(${amount.toString()})`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'depositTokens',
            [blockchainIdentity, amount], options,
        );
    }

    async getPurchase(purchaseId) {
        this.logger.trace(`[${this.getBlockchainId()}] Asking for purchase with id [${purchaseId}].`);
        return this.marketplaceStorageContract.methods.purchase(purchaseId).call();
    }

    async getPurchaseStatus(purchaseId) {
        this.logger.trace(`[${this.getBlockchainId()}] Asking for purchase with id [${purchaseId}].`);
        return this.marketplaceStorageContract.methods.getStage(purchaseId).call();
    }

    async getPaymentStageInterval() {
        this.logger.trace(`[${this.getBlockchainId()}] Reading payment stage interval from blockchain.`);
        return this.marketplaceContract.methods.paymentStageInterval().call();
    }


    async initiatePurchase(
        sellerIdentity, buyerIdentity,
        tokenAmount,
        originalDataRootHash, encodedDataRootHash,
    ) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.marketplaceContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] initiatePurchase (${sellerIdentity}, ${buyerIdentity}, ${tokenAmount}, ${originalDataRootHash}, ${encodedDataRootHash})`);
        return this.transactions.queueTransaction(
            this.marketplaceContractAbi, 'initiatePurchase',
            [
                sellerIdentity,
                buyerIdentity,
                tokenAmount,
                originalDataRootHash,
                encodedDataRootHash,
            ], options,
        );
    }

    /**
     * Decodes offer task event data from offer creation event
     * @param result Blockchain transaction receipt
     * @returns {Object<any>}
     */
    decodePurchaseInitiatedEventFromTransaction(result) {
        let purchaseInitiatedEventInputs;
        const purchaseInitiatedEventAbi = this.marketplaceContractAbi.find(element => element.name === 'PurchaseInitiated');
        if (purchaseInitiatedEventAbi) {
            purchaseInitiatedEventInputs = purchaseInitiatedEventAbi.inputs;
        } else {
            throw Error(`[${this.getBlockchainId()}] Could not find OfferTask event interface in Holding contract abi`);
        }

        return this.web3.eth.abi.decodeLog(
            purchaseInitiatedEventInputs,
            result.logs[0].data,
            result.logs[0].topics,
        );
    }

    async depositKey(purchaseId, key) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.marketplaceContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] depositKey(${purchaseId}, ${key})`);
        return this.transactions.queueTransaction(
            this.marketplaceContractAbi, 'depositKey',
            [purchaseId, key], options,
        );
    }

    async takePayment(purchaseId) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.marketplaceContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] takePayment(${purchaseId})`);
        return this.transactions.queueTransaction(
            this.marketplaceContractAbi, 'takePayment',
            [purchaseId], options,
        );
    }

    async complainAboutNode(
        purchaseId, outputIndex, inputIndexLeft, encodedOutput, encodedInputLeft,
        proofOfEncodedOutput, proofOfEncodedInputLeft, urgent,
    ) {
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.marketplaceContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] complainAboutNode(${purchaseId},${outputIndex},${inputIndexLeft},` +
            `${encodedOutput},${encodedInputLeft},${proofOfEncodedOutput},${proofOfEncodedInputLeft})`);
        return this.transactions.queueTransaction(
            this.marketplaceContractAbi, 'complainAboutNode',
            [purchaseId, outputIndex, inputIndexLeft, encodedOutput, encodedInputLeft,
                proofOfEncodedOutput, proofOfEncodedInputLeft], options,
        );
    }

    async complainAboutRoot(
        purchaseId, encodedRootHash, proofOfEncodedRootHash, rootHashIndex,
        urgent,
    ) {
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.marketplaceContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] complainAboutRoot(${purchaseId},${encodedRootHash},${proofOfEncodedRootHash},${rootHashIndex})`);
        return this.transactions.queueTransaction(
            this.marketplaceContractAbi, 'complainAboutRoot',
            [purchaseId, encodedRootHash, proofOfEncodedRootHash, rootHashIndex], options,
        );
    }

    /**
     * Get Profile minimum stake
     */
    async getProfileMinimumStake() {
        this.logger.trace(`[${this.getBlockchainId()}] Get minimum stake from blockchain`);
        return this.profileContract.methods.minimalStake().call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Get withdrawal time
     * @return {Promise<any>}
     */
    async getProfileWithdrawalTime() {
        this.logger.trace(`[${this.getBlockchainId()}] Get withdrawal time from blockchain`);
        return this.profileContract.methods.withdrawalTime().call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Get profile by wallet
     * @param identity
     */
    async getProfile(identity) {
        this.logger.trace(`[${this.getBlockchainId()}] Get profile by identity ${identity}`);
        return this.profileStorageContract.methods.profile(identity).call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Set node ID
     * @param identity
     * @param nodeId
     */
    async setNodeId(identity, nodeId) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.profileContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] Calling - setNodeId(${identity}, ${nodeId})`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'setNodeId',
            [identity, nodeId], options,
        );
    }

    /**
     * Get difficulty for the particular offer
     */
    async getOfferDifficulty(offerId) {
        this.logger.trace(`[${this.getBlockchainId()}] getOfferDifficulty(offer=${offerId})`);
        return this.holdingStorageContract.methods.getOfferDifficulty(offerId).call({
            from: this.config.node_wallet,
        });
    }


    /**
     * Token contract address getter
     * @return {any|*}
     */
    getTokenContractAddress() {
        return this.tokenContractAddress;
    }

    /**
     * Returns purposes of the wallet.
     * @param erc725Identity {string}
     * @param wallet {string}
     * @return {Promise<[]>}
     */
    async getWalletPurposes(erc725Identity, wallet) {
        const erc725IdentityContract = new this.web3.eth.Contract(
            this.erc725IdentityContractAbi,
            erc725Identity,
        );

        const key = ethereumAbi.soliditySHA3(['address'], [wallet]).toString('hex');
        return erc725IdentityContract.methods.getKeyPurposes(Utilities.normalizeHex(key)).call();
    }

    /**
     * Transfers identity to new address.
     * @param erc725identity {string}
     * @param managementWallet {string}
     */
    async transferProfile(erc725identity, managementWallet) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.profileContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] transferProfile (${erc725identity}, ${managementWallet})`);
        return this.transactions.queueTransaction(
            this.profileContractAbi, 'transferProfile',
            [erc725identity, managementWallet], options,
        );
    }

    /**
     * Returns true if ERC725 contract is older version.
     * @param address {string} address of ERC725 identity.
     * @return {Promise<boolean>}
     */
    async isErc725IdentityOld(address) {
        const erc725IdentityContract = new this.web3.eth.Contract(
            this.erc725IdentityContractAbi,
            address,
        );

        try {
            await erc725IdentityContract.methods.otVersion().call();
            return false;
        } catch (error) {
            if (error.toString().includes('Couldn\'t decode uint256 from ABI: 0x')) {
                return true;
            }
            throw error;
        }
    }

    /**
     * Get offer by offer ID
     * @param offerId - Offer ID
     * @return {Promise<any>}
     */
    async getOffer(offerId) {
        this.logger.trace(`[${this.getBlockchainId()}] getOffer(offerId=${offerId})`);
        return this.holdingStorageContract.methods.offer(offerId).call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Get holders for offer ID
     * @param offerId - Offer ID
     * @param holderIdentity - Holder identity
     * @return {Promise<any>}
     */
    async getHolder(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getHolder(offerId=${offerId}, holderIdentity=${holderIdentity})`);
        return this.holdingStorageContract.methods.holder(offerId, holderIdentity).call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Initiate litigation for the particular DH
     * @param offerId - Offer ID
     * @param holderIdentity - DH identity
     * @param litigatorIdentity - Litigator identity
     * @param requestedObjectIndex - Order number of the object from the OT-dataset
     * @param requestedBlockIndex - Order number of the block inside the sorted object
     * @param hashArray - Merkle proof
     * @return {Promise<any>}
     */
    async initiateLitigation(
        offerId, holderIdentity, litigatorIdentity,
        requestedObjectIndex, requestedBlockIndex, hashArray,
    ) {
        const gasPrice = await this.getGasPrice();
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.litigationContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] initiateLitigation (offerId=${offerId}, holderIdentity=${holderIdentity}, litigatorIdentity=${litigatorIdentity}, requestedObjectIndex=${requestedObjectIndex}, requestedBlockIndex=${requestedBlockIndex}, hashArray=${hashArray})`);
        return this.transactions.queueTransaction(
            this.litigationContractAbi, 'initiateLitigation',
            [
                offerId,
                holderIdentity,
                litigatorIdentity,
                requestedObjectIndex,
                requestedBlockIndex,
                hashArray,
            ], options,
        );
    }

    /**
     * Completes litigation for the particular DH
     * @param offerId - Offer ID
     * @param holderIdentity - DH identity
     * @param challengerIdentity - DC identity
     * @param proofData - answer
     * @param leafIndex - the number of the block in the lowest level of the merkle tree
     * @param urgent - Whether max gas price should be used or not
     * @return {Promise<void>}
     */
    async completeLitigation(
        offerId,
        holderIdentity,
        challengerIdentity,
        proofData,
        leafIndex,
        urgent,
    ) {
        const gasPrice = await this.getGasPrice(urgent);
        const options = {
            gasLimit: this.web3.utils.toHex(this.config.gas_limit),
            gasPrice: this.web3.utils.toHex(gasPrice),
            to: this.litigationContractAddress,
        };

        this.logger.trace(`[${this.getBlockchainId()}] completeLitigation (offerId=${offerId}, holderIdentity=${holderIdentity}, challengerIdentity=${challengerIdentity}, proofData=${proofData}, leafIndex=${leafIndex})`);
        return this.transactions.queueTransaction(
            this.litigationContractAbi, 'completeLitigation',
            [offerId, holderIdentity, challengerIdentity, proofData, leafIndex], options,
        );
    }

    /**
     * Gets litigation information for the holder
     * @param offerId - Offer ID
     * @param holderIdentity - Holder identity
     * @return {Promise<any>}
     */
    async getLitigation(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getLitigation(offerId=${offerId}, holderIdentity=${holderIdentity})`);
        return this.litigationStorageContract
            .methods.litigation(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Gets last litigation timestamp for the holder
     * @param offerId - Offer ID
     * @param holderIdentity - Holder identity
     * @return {Promise<any>}
     */
    async getLitigationTimestamp(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getLitigationTimestamp(offerId=${offerId}, holderIdentity=${holderIdentity})`);
        return this.litigationStorageContract
            .methods.getLitigationTimestamp(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Gets last litigation difficulty
     * @param offerId - Offer ID
     * @param holderIdentity - Holder identity
     * @return {Promise<any>}
     */
    async getLitigationDifficulty(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getLitigationDifficulty(offerId=${offerId}, holderIdentity=${holderIdentity})`);
        return this.litigationStorageContract
            .methods.getLitigationReplacementDifficulty(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Gets last litigation replacement task
     * @param offerId - Offer ID
     * @param holderIdentity - Holder identity
     * @return {Promise<any>}
     */
    async getLitigationReplacementTask(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getLitigationReplacementTask(offerId=${offerId}, holderIdentity=${holderIdentity})`);
        return this.litigationStorageContract
            .methods.getLitigationReplacementTask(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Get staked amount for the holder
     */
    async getHolderStakedAmount(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getHolderStakedAmount(offer=${offerId}, holderIdentity=${holderIdentity})`);
        return this.holdingStorageContract.methods
            .getHolderStakedAmount(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Get paid amount for the holder
     */
    async getHolderPaidAmount(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getHolderPaidAmount(offer=${offerId}, holderIdentity=${holderIdentity})`);
        return this.holdingStorageContract.methods
            .getHolderPaidAmount(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    /**
     * Check that the identity key has a specific purpose
     * @param identity - ERC-725 identity address
     * @param key - identity key
     * @param purpose - purpose to verify
     * @return {Promise<any>}
     */
    async keyHasPurpose(identity, key, purpose) {
        // Get contract instance
        const identityContract = new this.web3.eth.Contract(
            this.erc725IdentityContractAbi,
            identity,
        );

        key = Utilities.normalizeHex(key);

        this.logger.trace(`[${this.getBlockchainId()}] identity=${identity} keyHasPurpose(key=${key}, purpose=${purpose.toString()})`);

        return identityContract.methods.keyHasPurpose(key, purpose).call({
            from: this.config.node_wallet,
        });
    }

    /**
     * Get litigation encryption type
     */
    async getHolderLitigationEncryptionType(offerId, holderIdentity) {
        this.logger.trace(`[${this.getBlockchainId()}] getHolderLitigationEncryptionType(offer=${offerId}, holderIdentity=${holderIdentity})`);
        return this.holdingStorageContract.methods
            .getHolderLitigationEncryptionType(offerId, holderIdentity).call({
                from: this.config.node_wallet,
            });
    }

    async getTotalPayouts(identity) {
        const totalAmount = new BN(0);

        const events = await this.contractsByName.HOLDING_CONTRACT.getPastEvents('PaidOut', {
            fromBlock: 0,
            toBlock: 'latest',
        });
        events.forEach((event) => {
            if (Utilities.compareHexStrings(
                event.returnValues.holder,
                identity,
            )) {
                totalAmount.iadd(new BN(event.returnValues.amount));
            }
        });
        return totalAmount.toString();
    }

    /**
     * Check how many events were emitted in a transaction from the transaction receipt
     * @param receipt - the json object returned as a result of the transaction
     * @return {Number | undefined} - Returns undefined if the receipt does not have a logs field
     */
    numberOfEventsEmitted(receipt) {
        if (!receipt || !receipt.logs || !Array.isArray(receipt.logs)) {
            return undefined;
        }
        return receipt.logs.length;
    }

    /**
     * Returns identity from configuration
     */
    getIdentity() {
        return this.config.identity;
    }

    /**
     * Returns wallet from configuration
     */
    getWallet() {
        return {
            node_wallet: this.config.node_wallet,
            node_private_key: this.config.node_private_key,
            management_wallet: this.config.management_wallet,
        };
    }

    /**
     * Returns blockchain title from configuration
     */
    getBlockchainTitle() {
        return this.config.blockchain_title;
    }

    /**
     * Returns price factors from configuration
     */

    getPriceFactors() {
        return {
            dc_price_factor: this.config.dc_price_factor,
            dh_price_factor: this.config.dh_price_factor,
        };
    }

    async getGasPrice() {
        throw new TypeError('There is no getGasPrice function '
            + `implemented for ${this.config.network_id} blockchain.`);
    }

    async getRelativeTracPrice() {
        throw new TypeError('There is no getRelativeTracPrice function'
            + ` implemented for ${this.config.network_id} blockchain.`);
    }

    async getTracPrice() {
        if (process.env.NODE_ENV !== 'mainnet') {
            this.logger.trace(`[${this.getBlockchainId()}] Using default trac price in base currency from configuration: ${this.config.trac_price_in_base_currency}`);
            return this.config.trac_price_in_base_currency;
        }

        const now = new Date().getTime();
        if (this.config.trac_price_in_base_currency_last_update_timestamp
            + constants.TRAC_PRICE_IN_ETH_VALIDITY_TIME_IN_MILLS > now) {
            this.logger.trace(`[${this.getBlockchainId()}] Using trac price in base currency from configuration: ${this.config.trac_price_in_base_currency}`);
            return this.config.trac_price_in_base_currency;
        }

        let tracPriceInBaseCurrency = this.config.trac_price_in_base_currency;
        const response = await this.getRelativeTracPrice().catch((err) => {
            this.logger.warn(err);
        });
        if (response) {
            tracPriceInBaseCurrency = response;
        }
        if (tracPriceInBaseCurrency) {
            this._saveNewTracPriceInEth(tracPriceInBaseCurrency);
            this.logger.trace(`[${this.getBlockchainId()}] Using trac price in base currency from coingecko service: ${tracPriceInBaseCurrency}`);
        } else {
            tracPriceInBaseCurrency = this.config.trac_price_in_base_currency;
            this.logger.trace(`[${this.getBlockchainId()}] Using trac price in base currency from configuration: ${tracPriceInBaseCurrency}`);
        }
        return tracPriceInBaseCurrency;
    }

    _saveNewTracPriceInEth(tracePrice) {
        this.config.trac_price_in_base_currency = tracePrice;
        this.config.trac_price_in_base_currency_last_update_timestamp = new Date().getTime();
    }

    /**
     * Returns specific blockchain id
     * @returns {string}
     */
    getBlockchainId() {
        return this.config.network_id;
    }

    /**
     * Returns specific hub contract address
     * @returns {string}
     */
    getHubContractAddress() {
        return this.config.hub_contract_address;
    }

    static fromWei(balance, unit) {
        return Web3.utils.fromWei(balance, unit);
    }

    saveIdentity(identity) {
        this.config.identity = Utilities.normalizeHex(identity);

        const identityFilePath = path.join(
            this.config.appDataPath,
            this.config.identity_filepath,
        );

        fs.writeFileSync(identityFilePath, JSON.stringify({
            identity,
        }));
    }
}

module.exports = Web3Implementation;
