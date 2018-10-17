const BN = require('bn.js');
const d3 = require('d3-format');
const Queue = require('better-queue');
const ethAbi = require('ethereumjs-abi');
const crypto = require('crypto');
const Op = require('sequelize/lib/operators');

const Models = require('../../models');
const Utilities = require('../Utilities');

const Graph = require('../Graph');
const Challenge = require('../Challenge');
const Encryption = require('../Encryption');
const ImportUtilities = require('../ImportUtilities');
const ObjectValidator = require('../validator/object-validator');

class DHService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.commandExecutor = ctx.commandExecutor;
        this.importer = ctx.importer;
        this.blockchain = ctx.blockchain;
        this.transport = ctx.transport;
        this.web3 = ctx.web3;
        this.graphStorage = ctx.graphStorage;
        this.remoteControl = ctx.remoteControl;
        this.notifyError = ctx.notifyError;

        const that = this;
        this.queue = new Queue((async (args, cb) => {
            const {
                offerId,
                dcNodeId,
                dataSetSizeInBytes,
                holdingTimeInMinutes,
                litigationIntervalInMinutes,
                tokenAmountPerHolder,
                dataSetId,
                future,
            } = args;
            try {
                await that._handleOffer(
                    offerId,
                    dcNodeId,
                    dataSetSizeInBytes,
                    holdingTimeInMinutes,
                    litigationIntervalInMinutes,
                    tokenAmountPerHolder,
                    dataSetId,
                );
                future.resolve();
            } catch (e) {
                future.reject(e);
            }
            cb();
        }), { concurrent: 1 });
    }

    handleOffer(
        offerId, dcNodeId,
        dataSetSizeInBytes, holdingTimeInMinutes, litigationIntervalInMinutes,
        tokenAmountPerHolder, dataSetId,
    ) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                offerId,
                dcNodeId,
                dataSetSizeInBytes,
                holdingTimeInMinutes,
                litigationIntervalInMinutes,
                tokenAmountPerHolder,
                dataSetId,
                future: {
                    resolve, reject,
                },
            });
        });
    }

    /**
     * Handle one offer
     * @returns {Promise<void>}
     */
    async _handleOffer(
        offerId, dcNodeId,
        dataSetSizeInBytes, holdingTimeInMinutes, litigationIntervalInMinutes,
        tokenAmountPerHolder, dataSetId,
    ) {
        if (dcNodeId.startsWith(Utilities.normalizeHex(this.config.identity))) {
            return; // the offer is mine
        }
        dcNodeId = dcNodeId.substring(2, 42);
        const dcContact = await this.transport.getContact(dcNodeId, true);
        if (dcContact == null || dcContact.hostname == null) {
            return; // wait until peers are synced
        }

        // use LIKE because of some SC related issues
        const dataInfo = await Models.data_info.findOne({
            where: { data_set_id: { [Op.like]: `${Utilities.normalizeHex(dataSetId.toString('hex'))}%`} },
        });
        if (dataInfo) {
            this.logger.trace(`I've already stored data for data set ${dataSetId}. Ignoring.`);
            return;
        }

        let bid = await Models.bids.findOne({
            where: { offer_id: offerId },
        });
        if (bid) {
            this.logger.trace(`I've already added bid for offer ${offerId}. Ignoring.`);
            return;
        }

        this.logger.info(`New offer has been created by ${dcNodeId}. Offer ID ${offerId}.`);

        const format = d3.formatPrefix(',.6~s', 1e6);
        const dhMinTokenPrice = new BN(this.config.dh_min_token_price, 10);
        const dhMaxHoldingTimeInMinutes = new BN(this.config.dh_max_holding_time_in_minutes, 10);
        const dhMinLitigationIntervalInMinutes =
            new BN(this.config.dh_min_litigation_interval_in_minutes, 10);

        const formatMaxPrice = format(tokenAmountPerHolder);
        const formatMyPrice = format(this.config.dh_min_token_price);

        if (dhMinTokenPrice.gt(new BN(tokenAmountPerHolder, 10))) {
            this.logger.info(`Offer ${offerId} too cheap for me.`);
            this.logger.info(`Maximum price offered ${formatMaxPrice}[mATRAC] per byte/min`);
            this.logger.info(`My price ${formatMyPrice}[mATRAC] per byte/min`);
            return;
        }

        if (dhMaxHoldingTimeInMinutes.lt(new BN(holdingTimeInMinutes, 10))) {
            this.logger.info(`Holding time for the offer ${offerId} is greater than my holding time defined.`);
            return;
        }

        if (dhMinLitigationIntervalInMinutes.gt(new BN(litigationIntervalInMinutes, 10))) {
            this.logger.info(`Litigation interval for the offer ${offerId} is lesser than the one defined in the config.`);
            return;
        }

        bid = await Models.bids.create({
            offer_id: offerId,
            dc_node_id: dcNodeId,
            data_size_in_bytes: dataSetSizeInBytes,
            litigation_interval_in_minutes: litigationIntervalInMinutes,
            token_amount: tokenAmountPerHolder,
            deposited: false,
            status: 'PENDING',
        });

        const remainder = await this._calculatePessimisticMinimumDeposit(
            bid.id,
            tokenAmountPerHolder,
        );

        const data = {
            offerId,
            dcNodeId,
            dataSetSizeInBytes,
            holdingTimeInMinutes,
            litigationIntervalInMinutes,
            tokenAmountPerHolder,
        };

        if (remainder) {
            bid.deposit = remainder.toString();
            await bid.save({ fields: ['deposit'] });

            this.logger.warn(`Not enough tokens for offer ${offerId}. OT-node will automatically deposit enough tokens.`);

            Object.assign(data, {
                amount: remainder.toString(),
            });
            await this.commandExecutor.add({
                name: 'profileApprovalIncreaseCommand',
                sequence: ['depositTokensCommand', 'dhOfferHandleCommand'],
                delay: 15000,
                data,
                transactional: false,
            });
        } else {
            await this.commandExecutor.add({
                name: 'dhOfferHandleCommand',
                delay: 15000,
                data,
                transactional: false,
            });
        }
    }

    /**
     * Calculates possible minimum amount to deposit (pessimistically)
     * @param bidId
     * @param tokenAmountPerHolder
     * @return {Promise<*>}
     * @private
     */
    async _calculatePessimisticMinimumDeposit(bidId, tokenAmountPerHolder) {
        const profile = await this.blockchain.getProfile(this.config.erc725Identity);
        const profileStake = new BN(profile.stake, 10);
        const profileStakeReserved = new BN(profile.stakeReserved, 10);
        const profileMinStake = new BN(await this.blockchain.getProfileMinimumStake(), 10);

        const offerStake = new BN(tokenAmountPerHolder, 10);

        const bids = await Models.bids.findAll({
            where: {
                id: {
                    [Op.ne]: bidId,
                },
                status: {
                    [Op.in]: ['PENDING', 'SENT'],
                },
                deposit: {
                    [Op.ne]: null,
                },
            },
        });

        const currentDeposits = bids
            .map(pb => new BN(pb.deposit, 10))
            .reduce((acc, amount) => acc.add(amount), new BN(0, 10));

        let remainder = null;
        if (profileStake.sub(profileStakeReserved).sub(currentDeposits).lt(offerStake)) {
            remainder = offerStake.sub(profileStake.sub(profileStakeReserved).sub(currentDeposits));
        }

        if (profileStake
            .sub(profileStakeReserved)
            .sub(offerStake)
            .sub(currentDeposits)
            .lt(profileMinStake)) {
            const stakeRemainder = profileMinStake
                .sub(profileStake
                    .sub(profileStakeReserved)
                    .sub(offerStake)
                    .sub(currentDeposits));
            if (!remainder || (remainder && remainder.lt(stakeRemainder))) {
                remainder = stakeRemainder;
            }
        }
        return remainder;
    }

    /**
     * Handle one replication payload
     * @param offerId   - Offer ID
     * @param dataSetId - Data set ID
     * @param litigationVertices  - Encrypted import vertices
     * @param edges     - Import edges
     * @param dcWallet  - DC wallet
     * @param litigationPublicKey - Litigation decryption key
     * @param distributionPublicKey - Distribution decryption key
     * @param distributionPrivateKey - Distribution encryption key
     * @param distributionEpkChecksum - Distribution decryption key checksum
     * @param dcNodeId  - DC node ID
     * @param litigationRootHash - Litigation hash
     * @param distributionRootHash - Distribution hash
     * @param transactionHash - Transaction hash of the import
     * @param distributionEpk - Distribution EPK
     * @param distributionSignature - Distribution parameters check
     * @returns {Promise<void>}
     */
    async handleReplicationImport(
        offerId,
        dataSetId,
        dcNodeId,
        dcWallet,
        edges,
        litigationVertices,
        litigationPublicKey,
        distributionPublicKey,
        distributionPrivateKey,
        distributionEpkChecksum,
        litigationRootHash,
        distributionRootHash,
        distributionEpk,
        distributionSignature,
        transactionHash,
    ) {
        const bid = await Models.bids.findOne({
            where: { offer_id: offerId },
        });
        if (!bid) {
            this.logger.trace(`Request for replication import came for unknown offer ${offerId}. Ignoring.`);
            return;
        }

        await this.commandExecutor.add({
            name: 'dhReplicationImportCommand',
            data: {
                offerId,
                dataSetId,
                dcNodeId,
                dcWallet,
                edges,
                litigationVertices,
                litigationPublicKey,
                distributionPublicKey,
                distributionPrivateKey,
                distributionEpkChecksum,
                litigationRootHash,
                distributionRootHash,
                distributionEpk,
                distributionSignature,
                transactionHash,
            },
            transactional: false,
        });
    }

    /**
     * Handle one read request (checks whether node satisfies query)
     * @param msgId       - Message ID
     * @param msgNodeId   - Message node ID
     * @param msgWallet   - Message wallet
     * @param msgQuery    - Message query
     * @returns {Promise<void>}
     */
    async handleDataLocationRequest(msgId, msgNodeId, msgWallet, msgQuery) {
        await this.commandExecutor.add({
            name: 'dhReadDataLocationRequestCommand',
            transactional: false,
            data: {
                msgId,
                msgNodeId,
                msgWallet,
                msgQuery,
            },
        });
    }

    /**
     * Sends dhDataReadRequestFreeCommand to the queue.
     * @param message Message received from network
     * @returns {Promise<void>}
     */
    async handleDataReadRequestFree(message) {
        await this.commandExecutor.add({
            name: 'dhDataReadRequestFreeCommand',
            transactional: false,
            data: {
                message,
            },
        });
    }

    /**
     * Handles data read request from Kademlia
     * @return {Promise<void>}
     */
    async handleDataReadRequest(message) {
        /*
            message: {
                id: REPLY_ID,
                import_id: IMPORT_ID,
                wallet: DH_WALLET,
                nodeId: KAD_ID
            }
        */

        // TODO in order to avoid getting a different import.
        const {
            nodeId, wallet, id, import_id,
        } = message;
        try {
            // Check is it mine offer.
            const networkReplyModel = await Models.network_replies.find({ where: { id } });
            if (!networkReplyModel) {
                throw Error(`Couldn't find reply with ID ${id}.`);
            }

            const offer = networkReplyModel.data;

            if (networkReplyModel.receiver_wallet !== wallet &&
                networkReplyModel.receiver_identity) {
                throw Error('Sorry not your read request');
            }

            // TODO: Only one import ID used. Later we'll support replication from multiple imports.
            // eslint-disable-next-line
            const importId = import_id;

            const verticesPromise = this.graphStorage.findVerticesByImportId(importId);
            const edgesPromise = this.graphStorage.findEdgesByImportId(importId);

            const values = await Promise.all([verticesPromise, edgesPromise]);
            const vertices = values[0];
            const edges = values[1];

            ImportUtilities.unpackKeys(vertices, edges);

            // Get replication key and then encrypt data.
            const holdingDataModel = await Models.holding_data.find({ where: { id: importId } });

            if (!holdingDataModel) {
                throw Error(`Didn't find import with ID. ${importId}`);
            }

            ImportUtilities.deleteInternal(edges);
            ImportUtilities.deleteInternal(vertices);
            const holdingData = holdingDataModel.get({ plain: true });
            const dataPublicKey = holdingData.data_public_key;
            const replicationPrivateKey = holdingData.distribution_private_key;

            Graph.decryptVertices(
                vertices.filter(vertex => vertex.vertex_type !== 'CLASS'),
                dataPublicKey,
            );

            Graph.encryptVertices(
                vertices.filter(vertex => vertex.vertex_type !== 'CLASS'),
                replicationPrivateKey,
            );

            // Make sure we have enough token balance before DV makes a purchase.
            // From smart contract:
            // require(DH_balance > stake_amount && DV_balance > token_amount.add(stake_amount));
            const condition = new BN(offer.dataPrice).mul(new BN(offer.stakeFactor));
            const profileBalance =
                new BN((await this.blockchain.getProfile(this.config.node_wallet)).balance, 10);

            if (profileBalance.lt(condition)) {
                await this.blockchain.increaseBiddingApproval(condition.sub(profileBalance));
                await this.blockchain.depositTokens(condition.sub(profileBalance));
            }

            /*
            dataReadResponseObject = {
                message: {
                    id: REPLY_ID
                    wallet: DH_WALLET,
                    nodeId: KAD_ID
                    agreementStatus: CONFIRMED/REJECTED,
                    data_provider_wallet,
                    encryptedData: { … }
                },
                messageSignature: {
                    c: …,
                    r: …,
                    s: …
               }
            }
             */

            const dataInfo = await Models.data_info.findOne({
                where: {
                    import_id: importId,
                },
            });

            if (!dataInfo) {
                throw Error(`Failed to get data info for import ID ${importId}.`);
            }

            const replyMessage = {
                id,
                wallet: this.config.node_wallet,
                nodeId: this.config.identity,
                data_provider_wallet: dataInfo.data_provider_wallet,
                agreementStatus: 'CONFIRMED',
                encryptedData: {
                    vertices,
                    edges,
                },
                import_id: importId, // TODO: Temporal. Remove it.
            };
            const dataReadResponseObject = {
                message: replyMessage,
                messageSignature: Utilities.generateRsvSignature(
                    JSON.stringify(replyMessage),
                    this.web3,
                    this.config.node_private_key,
                ),
            };

            await this.transport.sendDataReadResponse(dataReadResponseObject, nodeId);
            await this.listenPurchaseInititation(
                importId, wallet, offer, networkReplyModel,
                holdingData, nodeId, id,
            );
        } catch (e) {
            const errorMessage = `Failed to process data read request. ${e}.`;
            this.logger.warn(errorMessage);
            this.notifyError(e);
            await this.transport.sendDataReadResponse({
                status: 'FAIL',
                message: errorMessage,
            }, nodeId);
        }
    }

    /**
     * Wait for purchase
     * @return {Promise<void>}
     */
    async listenPurchaseInititation(
        importId, wallet, offer,
        networkReplyModel, holdingData, nodeId, messageId,
    ) {
        // Wait for event from blockchain.
        await this.blockchain.subscribeToEvent('PurchaseInitiated', importId, 20 * 60 * 1000);

        // purchase[DH_wallet][msg.sender][import_id]
        const purchase = await this.blockchain.getPurchase(
            this.config.node_wallet,
            networkReplyModel.receiver_wallet,
            importId,
        );

        if (!purchase) {
            const errorMessage = `Failed to get purchase for: DH ${this.config.node_wallet}, DV ${networkReplyModel.receiver_wallet} and import ID ${importId}.`;
            this.logger.error(errorMessage);
            throw errorMessage;
        }

        // Check the conditions.
        const purchaseTokenAmount = new BN(purchase.token_amount);
        const purchaseStakeFactor = new BN(purchase.stake_factor);
        const myPrice = new BN(offer.dataPrice);
        const myStakeFactor = new BN(offer.stakeFactor);

        if (!purchaseTokenAmount.eq(myPrice) || !purchaseStakeFactor.eq(myStakeFactor)) {
            const errorMessage = `Whoa, we didn't agree on this. Purchase price and stake factor: ${purchaseTokenAmount} and ${purchaseStakeFactor}, my price and stake factor: ${myPrice} and ${myStakeFactor}.`;
            this.logger.error(errorMessage);
            throw errorMessage;
        }

        this.logger.info(`Purchase for import ${importId} seems just fine. Sending comm to contract.`);

        // bool commitment_proof = this_purchase.commitment ==
        // keccak256(checksum_left, checksum_right, checksum_hash,
        //          random_number_1, random_number_2, decryption_key, block_index);

        // Fetch epk from db.
        if (!holdingData) {
            this.logger.error(`Cannot find holding data info for import ID ${importId}`);
            throw Error('Internal error');
        }
        const { epk } = holdingData;

        const {
            m1,
            m2,
            selectedBlockNumber,
            selectedBlock,
        } = Encryption.randomDataSplit(epk);

        const r1 = Utilities.getRandomInt(100000);
        const r2 = Utilities.getRandomInt(100000);

        const m1Checksum = Utilities.normalizeHex(Encryption.calculateDataChecksum(m1, r1, r2));
        const m2Checksum = Utilities.normalizeHex(Encryption.calculateDataChecksum(
            m2,
            r1, r2, selectedBlockNumber + 1,
        ));
        const epkChecksum = Utilities.normalizeHex(Encryption.calculateDataChecksum(epk, r1, r2));
        const epkChecksumHash =
            Utilities.normalizeHex(ethAbi.soliditySHA3(
                ['uint256'],
                [epkChecksum],
            ).toString('hex'));
        const e = crypto.randomBytes(32); // 256bits.
        const eHex = Utilities.normalizeHex(e.toString('hex'));
        // For litigation we'll need: Encryption.xor(selectedBlock, e);

        // From smart contract:
        // keccak256(checksum_left, checksum_right, checksum_hash,
        //           random_number_1, random_number_2, decryption_key, block_index);
        const commitmentHash = Utilities.normalizeHex(ethAbi.soliditySHA3(
            ['uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256'],
            [m1Checksum, m2Checksum, epkChecksumHash, r1, r2, eHex, selectedBlockNumber],
        ).toString('hex'));

        // store block number and block in db because of litigation.

        await this.blockchain.sendCommitment(
            importId,
            networkReplyModel.receiver_wallet,
            commitmentHash,
        );

        await Models.data_holders.create({
            import_id: importId,
            dh_wallet: this.config.node_wallet,
            dh_kademlia_id: this.config.identity,
            m1,
            m2,
            e: eHex,
            sd: epkChecksum,
            r1,
            r2,
            block_number: selectedBlockNumber,
            block: selectedBlock,
        });

        // Send data to DV.
        const encryptedPaddedKeyObject = {
            message: {
                id: messageId,
                wallet: this.config.node_wallet,
                nodeId: this.config.identifiers,
                m1,
                m2,
                e: eHex,
                r1,
                r2,
                sd: epkChecksum,
                blockNumber: selectedBlockNumber,
                import_id: importId,
            },
        };
        encryptedPaddedKeyObject.messageSignature = Utilities.generateRsvSignature(
            JSON.stringify(encryptedPaddedKeyObject.message),
            this.web3,
            this.config.node_private_key,
        );

        await this.transport.sendEncryptedKey(encryptedPaddedKeyObject, nodeId);

        this.listenPurchaseDispute(
            importId, wallet, m2Checksum,
            epkChecksumHash, selectedBlockNumber,
            m1Checksum, r1, r2, e,
        ).then(() => this.logger.info('Purchase dispute completed'));

        this.listenPurchaseConfirmation(
            importId, wallet, networkReplyModel,
            selectedBlock, eHex,
        ).then(() => this.logger.important('Purchase confirmation completed'));
    }

    /**
     * Wait and process purchase confirmation
     * @return {Promise<void>}
     */
    async listenPurchaseConfirmation(importId, wallet, networkReplyModel, selectedBlock, eHex) {
        const eventData = await this.blockchain.subscribeToEvent('PurchaseConfirmed', importId, 10 * 60 * 1000);
        if (!eventData) {
            // Everything is ok.
            this.logger.warn(`Purchase not confirmed for ${importId}.`);
            await this.blockchain.cancelPurchase(importId, wallet, true);
            this.logger.important(`Purchase for import ${importId} canceled.`);
            return;
        }

        this.logger.important(`[DH] Purchase confirmed for import ID ${importId}`);
        await this.blockchain.sendEncryptedBlock(
            importId,
            networkReplyModel.receiver_wallet,
            Utilities.normalizeHex(Encryption.xor(
                Buffer.from(selectedBlock, 'ascii').toString('hex'),
                Utilities.denormalizeHex(eHex),
            )),
        );
        this.logger.notify(`[DH] Encrypted block sent for import ID ${importId}`);
        this.blockchain.subscribeToEvent('PurchaseConfirmed', importId, 10 * 60 * 1000);

        // Call payOut() after 5 minutes. Requirement from contract.
        setTimeout(() => {
            this.blockchain.payOutForReading(importId, networkReplyModel.receiver_wallet)
                .then(() => this.logger.info(`[DH] Payout finished for import ID ${importId} and DV ${networkReplyModel.receiver_wallet}.`))
                .catch((error) => {
                    this.logger.info(`[DH] Payout failed for import ID ${importId} and DV ${networkReplyModel.receiver_wallet}. ${error}.`);
                    this.notifyError(error);
                });
        }, 5 * 60 * 1000);
    }

    /**
     * Monitor for litigation event. Just in case.
     * @return {Promise<void>}
     */
    async listenPurchaseDispute(
        importId, wallet, m2Checksum, epkChecksumHash,
        selectedBlockNumber, m1Checksum, r1, r2, e,
    ) {
        let eventData = await this.blockchain.subscribeToEvent('PurchaseDisputed', importId, 10 * 60 * 1000);
        if (!eventData) {
            // Everything is ok.
            this.logger.info(`No litigation process initiated for purchase for ${importId}.`);
            return;
        }

        await this.blockchain.sendProofData(
            importId, wallet, m1Checksum,
            m2Checksum, epkChecksumHash, r1, r2,
            Utilities.normalizeHex(e.toString('hex')), selectedBlockNumber,
        );

        // emit PurchaseDisputeCompleted(import_id, msg.sender, DV_wallet, false);
        eventData = this.blockchain.subscribeToEvent('PurchaseDisputeCompleted', importId, 10 * 60 * 1000);
        if (eventData.proof_was_correct) {
            this.logger.info(`Litigation process for purchase ${importId} was fortunate for me.`);
        } else {
            this.logger.info(`Litigation process for purchase ${importId} was unfortunate for me.`);
        }
    }

    /**
     * Handles litigation initiation from DC side
     * @param importId
     * @param dhWallet
     * @param blockId
     * @return {Promise<void>}
     */
    async litigationInitiated(importId, dhWallet, blockId) {
        if (dhWallet !== this.config.node_wallet) {
            return;
        }
        this.logger.debug(`Litigation initiated for import ${importId} and block ${blockId}`);

        let vertices = await this.graphStorage.findVerticesByImportId(importId);
        ImportUtilities.sort(vertices, '_dc_key');
        // filter CLASS vertices
        vertices = vertices.filter(vertex => vertex.vertex_type !== 'CLASS'); // Dump class objects.
        const answer = Challenge.answerTestQuestion(blockId, vertices, 32);

        this.logger.debug(`Answer litigation for import ${importId}. Answer for block ${blockId} is ${answer}`);
        await this.blockchain.answerLitigation(importId, answer);
    }

    async dataLocationQuery(queryId) {
        const networkQuery = await Models.network_queries.find({ where: { id: queryId } });
        const validationError = ObjectValidator.validateSearchQueryObject(networkQuery);
        if (validationError) {
            throw validationError;
        }
        if (networkQuery.status !== 'FINISHED') {
            throw Error('Query not finished.');
        }

        // Fetch the results.
        const importIds =
            await this.graphStorage.findImportIds(networkQuery.query);
        const decryptKeys = {};

        // Get decode keys.
        const holdingData = await Models.holding_data.findAll({
            where: {
                id: {
                    [Op.in]: importIds,
                },
            },
        });

        if (holdingData) {
            holdingData.forEach((data) => {
                decryptKeys[data.id] = data.data_public_key;
            });
        }

        const encodedVertices =
            await this.graphStorage.dataLocationQuery(networkQuery.query);
        const vertices = [];

        encodedVertices.forEach((encodedVertex) => {
            const foundIds =
                encodedVertex.imports.filter(value => importIds.indexOf(value) !== -1);

            switch (foundIds.length) {
            case 1:
                // Decrypt vertex.
                {
                    const decryptedVertex = Utilities.copyObject(encodedVertex);
                    decryptedVertex.data =
                        Encryption.decryptObject(
                            encodedVertex.data,
                            decryptKeys[foundIds[0]],
                        );
                    vertices.push(decryptedVertex);
                }
                break;
            case 0:
                // Vertex is not encrypted.
                vertices.push(Utilities.copyObject(encodedVertex));
                break;
            default:
                // Multiple keys founded. Temp solution.
                for (let i = 0; i < foundIds.length; i += 1) {
                    try {
                        const decryptedVertex = Utilities.copyObject(encodedVertex);
                        decryptedVertex.data =
                                Encryption.decryptObject(
                                    encodedVertex.data,
                                    decryptKeys[foundIds[i]],
                                );
                        vertices.push(decryptedVertex);
                        break; // Found the right key.
                    } catch (error) {
                        // Ignore.
                    }
                }
                break;
            }
        });

        return vertices;
    }

    /**
     * Returns given import's vertices and edges and decrypt them if needed.
     *
     * Method will return object in following format { vertices: [], edges: [] }.
     * @param importId ID of import.
     * @returns {Promise<*>}
     */
    async getImport(importId) {
        // Check if import came from DH replication or reading replication.
        const holdingData = await Models.holding_data.find({ where: { id: importId } });

        if (holdingData) {
            const verticesPromise = this.graphStorage.findVerticesByImportId(importId);
            const edgesPromise = this.graphStorage.findEdgesByImportId(importId);

            const values = await Promise.all([verticesPromise, edgesPromise]);

            const encodedVertices = values[0];
            const edges = values[1];
            const decryptKey = holdingData.data_public_key;
            const vertices = [];

            encodedVertices.forEach((encodedVertex) => {
                const decryptedVertex = Utilities.copyObject(encodedVertex);
                if (decryptedVertex.vertex_type !== 'CLASS') {
                    decryptedVertex.data =
                        Encryption.decryptObject(
                            encodedVertex.data,
                            decryptKey,
                        );
                }
                vertices.push(decryptedVertex);
            });

            return { vertices, edges };
        }

        // Check if import came from DC side.
        const dataInfo = await Models.data_info.find({ where: { import_id: importId } });

        if (dataInfo) {
            const verticesPromise = this.graphStorage.findVerticesByImportId(importId);
            const edgesPromise = this.graphStorage.findEdgesByImportId(importId);

            const values = await Promise.all([verticesPromise, edgesPromise]);

            return { vertices: values[0], edges: values[1] };
        }

        throw Error(`Cannot find import for import ID ${importId}.`);
    }

    async listenToBlockchainEvents() {
        this.blockchain.subscribeToEventPermanent([
            'AddedPredeterminedBid',
            'OfferCreated',
            'LitigationInitiated',
            'LitigationCompleted',
            'EscrowVerified',
        ]);
    }
}

module.exports = DHService;
