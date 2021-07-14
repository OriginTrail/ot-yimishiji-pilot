const path = require('path');
const fs = require('fs');
const pjson = require('../../package.json');
const constants = require('../constants');
const RestAPIValidator = require('../validator/rest-api-validator');
const Utilities = require('../Utilities');
const Models = require('../../models');
const Blockchain = require('../Blockchain');

class RestAPIServiceV2 {
    constructor(ctx) {
        this.ctx = ctx;
        this.config = ctx.config;
        this.logger = ctx.logger;
        this.apiUtilities = ctx.apiUtilities;
        this.emitter = ctx.emitter;
        this.commandExecutor = ctx.commandExecutor;
        this.epcisOtJsonTranspiler = ctx.epcisOtJsonTranspiler;
        this.wotOtJsonTranspiler = ctx.wotOtJsonTranspiler;

        this.dcController = ctx.dcController;
        this.dhController = ctx.dhController;
        this.dvController = ctx.dvController;
        this.infoController = ctx.infoController;

        this.exportController = ctx.exportController;
        this.remoteControl = ctx.remoteControl;

        this.graphStorage = ctx.graphStorage;
        this.importService = ctx.importService;

        this.version_id = 'v2.1';
        this.stanards = ['OT-JSON', 'GS1-EPCIS', 'GRAPH', 'WOT'];
        this.graphStorage = ctx.graphStorage;
        this.mapping_standards_for_event = new Map();
        this.mapping_standards_for_event.set('ot-json', 'ot-json');
        this.mapping_standards_for_event.set('gs1-epcis', 'gs1');
        this.mapping_standards_for_event.set('graph', 'ot-json');
        this.mapping_standards_for_event.set('wot', 'wot');
    }

    /**
     * API Routes
     */
    _exposeAPIRoutes(server) {
        const {
            transport, emitter, blockchain, config,
        } = this.ctx;

        server.get(`/api/${this.version_id}/health_check`, (req, res) => {
            res.status(200);
            res.send({
            });
        });

        server.get(`/api/${this.version_id}/info`, async (req, res) => {
            await this.infoController.getNodeInfo(req, res);
        });

        server.post(`/api/${this.version_id}/node_data`, async (req, res) => {
            await this.infoController.getNodeData(req, res);
        });

        server.post(`/api/${this.version_id}/import`, async (req, res) => {
            await this._importDataset(req, res);
        });

        server.get(`/api/${this.version_id}/import/result/:handler_id`, async (req, res) => {
            await this._checkForHandlerStatus(req, res);
        });

        server.post(`/api/${this.version_id}/replicate`, async (req, res) => {
            await this.dcController.handleReplicateRequest(req, res);
        });

        server.get(`/api/${this.version_id}/replicate/result/:handler_id`, async (req, res) => {
            await this._checkForReplicationHandlerStatus(req, res);
        });

        server.post(`/api/${this.version_id}/export`, async (req, res) => {
            await this.exportController.exportDataset(req, res);
        });

        server.get(`/api/${this.version_id}/export/result/:handler_id`, async (req, res) => {
            await this.exportController.checkForHandlerStatus(req, res);
        });

        server.get(`/api/${this.version_id}/standards`, async (req, res) => {
            this._getStandards(req, res);
        });

        server.get(`/api/${this.version_id}/blockchains`, async (req, res) => {
            await this.infoController.getBlockchains(req, res);
        });

        server.get(`/api/${this.version_id}/get_element_issuer_identity/:element_id`, async (req, res) => {
            await this._getElementIssuerIdentity(req, res);
        });

        server.get(`/api/${this.version_id}/get_connection_types/:standard_id`, async (req, res) => {
            await this._getConnectionTypes(req, res);
        });

        server.get(`/api/${this.version_id}/get_dataset_info/:dataset_id`, async (req, res) => {
            await this.infoController.getDatasetInfo(req, res);
        });

        server.post(`/api/${this.version_id}/trail`, async (req, res) => {
            await this.dhController.getTrail(req, res);
        });

        server.post(`/api/${this.version_id}/trail/lookup`, async (req, res) => {
            await this.dhController.lookupTrail(req, res);
        });

        server.post(`/api/${this.version_id}/trail/find`, async (req, res) => {
            await this.dhController.findTrail(req, res);
        });

        server.get(`/api/${this.version_id}/trail/find/result/:handler_id`, async (req, res) => {
            await this.dhController.findTrailResult(req, res);
        });

        server.post(`/api/${this.version_id}/get_merkle_proofs`, async (req, res) => {
            await this._getMerkleProofs(req, res);
        });

        server.post(`/api/${this.version_id}/network/query`, async (req, res) => {
            await this._networkQuery(req, res);
        });

        server.get(`/api/${this.version_id}/network/query/result/:query_id`, async (req, res) => {
            await this._networkQueryStatus(req, res);
        });

        server.get(`/api/${this.version_id}/network/query/responses/:query_id`, async (req, res) => {
            await this._networkQueryResponses(req, res);
        });

        server.post(`/api/${this.version_id}/network/read`, async (req, res) => {
            await this._readNetwork(req, res);
        });

        server.get(`/api/${this.version_id}/network/read/result/:handler_id`, async (req, res) => {
            await this._checkForHandlerStatus(req, res);
        });

        server.post(`/api/${this.version_id}/network/permissioned_data/read`, async (req, res) => {
            await this.dvController.handlePermissionedDataReadRequest(req, res);
        });

        server.get(`/api/${this.version_id}/network/permissioned_data/read/result/:handler_id`, async (req, res) => {
            await this._checkForHandlerStatus(req, res);
        });

        server.post(`/api/${this.version_id}/permissioned_data/whitelist_viewer`, async (req, res) => {
            await this.dhController.whitelistViewer(req, res);
        });

        server.post(`/api/${this.version_id}/permissioned_data/remove`, async (req, res) => {
            await this.dcController.removePermissionedData(req, res);
        });

        server.post(`/api/${this.version_id}/network/read_export`, async (req, res) => {
            await this.dvController.handleDataReadExportRequest(req, res);
        });

        server.get(`/api/${this.version_id}/network/read_export/result/:handler_id`, async (req, res) => {
            await this.exportController.checkForHandlerStatus(req, res);
        });

        server.post(`/api/${this.version_id}/challenges`, async (req, res) => {
            await this._getChallenges(req, res);
        });

        if (process.env.NODE_ENV !== 'mainnet') {
            server.post(`/api/${this.version_id}/network/permissioned_data/purchase`, async (req, res) => {
                await this.dvController.sendNetworkPurchase(req, res);
            });

            server.get(`/api/${this.version_id}/network/permissioned_data/purchase/result/:handler_id`, async (req, res) => {
                await this._checkForHandlerStatus(req, res);
            });
            server.get(`/api/${this.version_id}/permissioned_data/available`, async (req, res) => {
                await this.dvController.getPermissionedDataAvailable(req, res);
            });


            server.get(`/api/${this.version_id}/permissioned_data/owned`, async (req, res) => {
                await this.dcController.getPermissionedDataOwned(req, res);
            });

            server.post(`/api/${this.version_id}/network/permissioned_data/get_price`, async (req, res) => {
                await this.dvController.getPermissionedDataPrice(req, res);
            });

            server.post(`/api/${this.version_id}/permissioned_data/update_price`, async (req, res) => {
                await this.dcController.updatePermissionedDataPrice(req, res);
            });

            server.get(`/api/${this.version_id}/network/permissioned_data/get_price/result/:handler_id`, async (req, res) => {
                await this._checkForHandlerStatus(req, res);
            });

            server.get(`/api/${this.version_id}/permissioned_data/trading_info/:type`, async (req, res) => {
                await this.dvController.getTradingData(req, res);
            });
        }

        server.post(`/api/${this.version_id}/query/local`, async (req, res, next) => {
            await this.dcController.queryLocal(req, res);
        });

        /** Network related routes */
        server.get(`/api/${this.version_id}/network/get-contact/:node_id`, async (req, res) => {
            const nodeId = req.params.node_id;
            this.logger.api(`Get contact node ID ${nodeId}`);

            const result = await transport.getContact(nodeId);
            const body = {};

            if (result) {
                Object.assign(body, result);
            }
            res.status(200);
            res.send(body);
        });

        server.get(`/api/${this.version_id}/network/find/:node_id`, async (req, res) => {
            const nodeId = req.params.node_id;
            this.logger.api(`Find node ID ${nodeId}`);

            const result = await transport.findNode(nodeId);
            const body = {};

            if (result) {
                Object.assign(body, result);
            }
            res.status(200);
            res.send(body);
        });

        /**
         * Temporary route used for HTTP network prototype
         */
        server.post(`/api/${this.version_id}/network/send`, (req, res) => {
            this.logger.api('P2P request received');

            const { type } = req.body;
            emitter.emit(type, req, res);
        });

        server.get(`/api/${this.version_id}/query/local/import/:data_set_id`, (req, res) => {
            this.logger.api('GET: Local import request received.');

            if (!req.params.data_set_id) {
                res.status(400);
                res.send({
                    message: 'Param required.',
                });
                return;
            }

            emitter.emit('api-query-local-import', {
                data_set_id: req.params.data_set_id,
                format: ((req.query && req.query.format) || 'otjson'),
                encryption: req.query.encryption,
                request: req,
                response: res,
            });
        });


        server.get(`/api/${this.version_id}/consensus/:sender_id`, (req, res) => {
            this.logger.api('GET: Consensus check events request received.');

            if (req.params.sender_id == null) {
                res.status(400);
                res.send({ message: 'Bad request' });
            }

            emitter.emit('api-consensus-events', {
                sender_id: req.params.sender_id,
                response: res,
            });
        });

        /**
         * Payout route
         * @param Query params: data_set_id
         */
        server.get(`/api/${this.version_id}/payout`, (req, res) => {
            this.logger.api('GET: Payout request received.');

            if (!req.query.offer_id) {
                res.status(400);
                res.send({
                    message: 'Param offer_id is required.',
                });
                return;
            }

            emitter.emit('api-payout', {
                offerId: req.query.offer_id,
                blockchain_id: req.query.blockchain_id,
                response: res,
            });
        });

        /** Get root hash for provided data query
         * @param Query params: data_set_id
         */
        server.get(`/api/${this.version_id}/fingerprint/:dataset_id`, async (req, res) => {
            await this.dvController.handleGetFingerprint(req, res);
        });

        server.get(`/api/${this.version_id}/import_info`, async (req, res) => {
            this.logger.api('GET: import_info.');

            const queryObject = req.query;
            if (queryObject.data_set_id == null) {
                res.send({ status: 400, message: 'Missing parameter!', data: [] });
                return;
            }

            this.emitter.emit('api-import-info', {
                dataSetId: queryObject.data_set_id,
                responseFormat: queryObject.format || 'otjson',
                response: res,
            });
        });

        server.get(`/api/${this.version_id}/balance`, async (req, res) => {
            this.logger.api('Get balance.');

            try {
                const humanReadable = req.query.humanReadable === 'true';

                const blockchains = this.infoController.getBlockchainInfo();
                const promises = [];
                for (const blockchain_info of blockchains) {
                    const {
                        blockchain_id, blockchain_title, node_wallet, identity,
                    } = blockchain_info;

                    // eslint-disable-next-line no-loop-func
                    promises.push(new Promise(async (resolve, reject) => {
                        try {
                            const walletBaseBalance = await blockchain
                                .getWalletBaseBalance(node_wallet, blockchain_id).response;
                            let walletTokenBalance;
                            if (blockchain_title !==
                                constants.BLOCKCHAIN_TITLE.OriginTrailParachain) {
                                walletTokenBalance = await blockchain
                                    .getWalletTokenBalance(node_wallet, blockchain_id).response;
                            }

                            const profile =
                                await blockchain.getProfile(identity, blockchain_id).response;
                            const profileMinimalStake =
                                await blockchain.getProfileMinimumStake(blockchain_id).response;

                            const body = {
                                blockchain_id,
                                blockchain_title,
                                wallet: {
                                    address: node_wallet,
                                    baseBalance: humanReadable ? Blockchain.fromWei(blockchain_title, walletBaseBalance, 'ether') : walletBaseBalance,
                                },
                                profile: {
                                    address: identity,
                                    staked: humanReadable ? Blockchain.fromWei(blockchain_title, profile.stake, 'ether') : profile.stake,
                                    reserved: humanReadable ? Blockchain.fromWei(blockchain_title, profile.stakeReserved, 'ether') : profile.stakeReserved,
                                    minimalStake: humanReadable ? Blockchain.fromWei(blockchain_title, profileMinimalStake, 'ether') : profileMinimalStake,
                                },
                            };

                            if (walletTokenBalance) {
                                body.wallet.tokenBalance = humanReadable
                                    ? Blockchain.fromWei(blockchain_title, walletTokenBalance, 'ether')
                                    : walletTokenBalance;
                            }

                            resolve(body);
                        } catch (error) {
                            reject(error);
                        }
                    }));
                }

                const result = await Promise.all(promises);

                res.status(200);
                res.send(result);
            } catch (error) {
                this.logger.error(`Failed to get balance. ${error.message}.`);
                res.status(503);
                res.send({});
            }
        });

        server.get(`/api/${this.version_id}/imports_info`, (req, res) => {
            this.logger.api('GET: List imports request received.');

            emitter.emit('api-imports-info', {
                response: res,
            });
        });

        server.get(`/api/${this.version_id}/dump/rt`, (req, res) => {
            this.logger.api('Dumping routing table');
            const message = transport.dumpContacts();

            res.status(200);
            res.send({
                message,
            });
        });
    }

    async _getMerkleProofs(req, res) {
        this.logger.api('POST: Get Merkle proofs request received.');

        if (req.body === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }

        if (req.body.object_ids === undefined ||
            req.body.dataset_id === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }

        const { object_ids, dataset_id } = req.body;

        const response =
            await this.importService.getMerkleProofs(Utilities.arrayze(object_ids), dataset_id);

        res.status(200);
        res.send(response);
    }

    async _networkQuery(req, res) {
        this.logger.api('POST: Network query request received.');

        let error = RestAPIValidator.validateBodyRequired(req.body);
        if (error) {
            res.status(400);
            res.send({
                message: error.message,
            });
            return;
        }

        const { query } = req.body;
        error = RestAPIValidator.validateSearchQuery(query);
        if (error) {
            res.status(400);
            res.send({
                message: error.message,
            });
            return;
        }

        this.logger.info('Network-query handling triggered.');

        const queryId = await this.dvController.queryNetwork(query, res);

        if (queryId) {
            res.status(200);
            res.send({
                query_id: queryId,
            });
        }
    }

    async _networkQueryStatus(req, res) {
        this.logger.api('GET: Query for status request received.');

        if (!req.params.query_id) {
            res.status(400);
            res.send({
                message: 'Missing Query ID parameter.',
            });
            return;
        }

        await this.dvController.handleNetworkQueryStatus(req.params.query_id, res);
    }

    async _networkQueryResponses(req, res) {
        this.logger.api('GET: Local query responses request received.');

        if (!req.params.query_id) {
            res.status(400);
            res.send({
                message: 'Param query_id is required.',
            });
            return;
        }

        await this.dvController.getNetworkQueryResponses(req.params.query_id, res);
    }

    async _readNetwork(req, res) {
        this.logger.api('POST: Network read request received.');

        if (req.body == null || req.body.reply_id == null
            || req.body.data_set_id == null) {
            res.status(400);
            res.send({ message: 'Params reply_id and data_set_id are required.' });
            return;
        }
        const { reply_id, data_set_id } = req.body;

        await this.dvController.handleDataReadRequest(data_set_id, reply_id, res);
    }

    async _checkForReplicationHandlerStatus(req, res) {
        const handler_object = await Models.handler_ids.findOne({
            where: {
                handler_id: req.params.handler_id,
            },
        });

        if (handler_object == null) {
            this.logger.info('Invalid request');
            res.status(404);
            res.send({
                message: 'Unable to find data with given parameters!',
            });
            return;
        }
        const handlerData = JSON.parse(handler_object.data);
        let offerData;
        if (handlerData) {
            offerData = {
                status: handlerData.status,
                holders: handlerData.holders,
            };
            const offer = await Models.offers.findOne({
                where: {
                    [Models.Sequelize.Op.or]: [
                        {
                            offer_id: handlerData.offer_id,
                        },
                        {
                            id: handlerData.offer_id,
                        },
                    ],
                },
            });
            if (offer) {
                offerData.number_of_replications = offer.number_of_replications;
                offerData.number_of_verified_replications = offer.number_of_verified_replications;
                offerData.trac_in_base_currency_used_for_price_calculation =
                    offer.trac_in_base_currency_used_for_price_calculation;
                offerData.gas_price_used_for_price_calculation =
                    offer.gas_price_used_for_price_calculation;
                offerData.price_factor_used_for_price_calculation =
                    offer.price_factor_used_for_price_calculation;
                offerData.offer_create_transaction_hash = offer.transaction_hash;
                offerData.offer_finalize_transaction_hash = offer.offer_finalize_transaction_hash;
                offerData.offer_id = offer.offer_id;
                offerData.holding_time_in_minutes = offer.holding_time_in_minutes;
                offerData.token_amount_per_holder = offer.token_amount_per_holder;
                offerData.message = offer.message;
            }
            Object.keys(offerData).forEach(key =>
                (offerData[key] == null) && delete offerData[key]);
        } else {
            offerData = {};
        }
        res.status(200);
        res.send({
            data: offerData,
            status: handler_object.status,
        });
    }

    async _checkForHandlerStatus(req, res) {
        const handler_object = await Models.handler_ids.findOne({
            where: {
                handler_id: req.params.handler_id,
            },
        });

        if (handler_object == null) {
            this.logger.info('Invalid request');
            res.status(404);
            res.send({
                message: 'Unable to find data with given parameters!',
            });
            return;
        }

        const { data, status } = handler_object;

        res.status(200);
        res.send({
            data: JSON.parse(data),
            status,
        });
    }

    async _getChallenges(req, res) {
        if (req.body === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }

        // Check if import type is valid
        if (req.body.startDate === undefined ||
            req.body.endDate === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request startDate and endDate required!',
            });
            return;
        }

        const challenges = await Models.challenges.findAll({
            where: {
                start_time: {
                    [Models.Sequelize.Op.between]:
                        [(new Date(req.body.startDate)).getTime(),
                            (new Date(req.body.endDate)).getTime()],
                },
                status: {
                    [Models.Sequelize.Op.not]: 'PENDING',
                },
            },
            order: [
                ['start_time', 'ASC'],
            ],
        });
        const returnChallenges = [];
        challenges.forEach((challenge) => {
            const answered = !!challenge.answer;
            returnChallenges.push({
                offer_id: challenge.offer_id,
                start_time: challenge.start_time,
                status: challenge.status,
                answered,
            });
        });

        res.status(200);
        res.send(returnChallenges);
    }

    // This is hardcoded import in case it is needed to make new importer with this method
    async _importDataset(req, res) {
        this.logger.api('POST: Import of data request received.');

        if (req.body === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }

        // Check if import type is valid
        if (req.body.standard_id === undefined ||
            this.stanards.indexOf(req.body.standard_id) === -1) {
            res.status(400);
            res.send({
                message: 'Invalid import type',
            });
            return;
        }

        const standard_id =
            this.mapping_standards_for_event.get(req.body.standard_id.toLowerCase());

        let fileContent;
        if (req.files !== undefined && req.files.file !== undefined) {
            const inputFile = req.files.file.path;
            fileContent = await Utilities.fileContents(inputFile);
        } else if (req.body.file !== undefined) {
            fileContent = req.body.file;
        }

        if (fileContent) {
            try {
                const inserted_object = await Models.handler_ids.create({
                    status: 'PENDING',
                });

                const cacheDirectory = path.join(this.config.appDataPath, 'import_cache');

                try {
                    await Utilities.writeContentsToFile(
                        cacheDirectory,
                        inserted_object.dataValues.handler_id,
                        fileContent,
                    );
                } catch (e) {
                    const filePath =
                        path.join(cacheDirectory, inserted_object.dataValues.handler_id);

                    if (fs.existsSync(filePath)) {
                        await Utilities.deleteDirectory(filePath);
                    }
                    res.status(500);
                    res.send({
                        message: `Error when creating import cache file for handler_id ${inserted_object.dataValues.handler_id}. ${e.message}`,
                    });
                    return;
                }

                const commandData = {
                    standard_id,
                    documentPath: path.join(cacheDirectory, inserted_object.dataValues.handler_id),
                    handler_id: inserted_object.dataValues.handler_id,
                };
                const commandSequence = [
                    'dcConvertToOtJsonCommand',
                    'dcConvertToGraphCommand',
                    'dcWriteImportToGraphDbCommand',
                    'dcFinalizeImportCommand',
                ];

                await this.commandExecutor.add({
                    name: commandSequence[0],
                    sequence: commandSequence.slice(1),
                    delay: 0,
                    data: commandData,
                    transactional: false,
                });
                res.status(200);
                res.send({
                    handler_id: inserted_object.dataValues.handler_id,
                });
            } catch (e) {
                res.status(400);
                res.send({
                    message: 'No import data provided',
                });
            }
        } else {
            res.status(400);
            res.send({
                message: 'No import data provided',
            });
        }
    }

    /**
     * Get all supported standards
     * @param req
     * @param res
     * @private
     */
    _getStandards(req, res) {
        const msg = [];
        this.stanards.forEach(standard =>
            msg.push(standard));
        res.send({
            message: msg,
        });
    }

    _getConnectionTypes(req, res) {
        const standard_id = req.params.standard_id.toLocaleLowerCase();
        if (standard_id === 'gs1') {
            res.status(200);
            res.send({ connection_types: this.epcisOtJsonTranspiler.getConnectionTypes() });
        } else if (standard_id === 'wot') {
            res.status(200);
            res.send({ connection_types: this.wotOtJsonTranspiler.getConnectionTypes() });
        } else {
            res.status(400);
            res.send({
                message: 'Invalid type request',
            });
        }
    }

    /**
     * Returns element issuer identity
     * @param req
     * @param res
     * @returns {Promise<void>}
     * @private
     */
    async _getElementIssuerIdentity(req, res) {
        this.logger.api('GET: Element issuer identity request received.');
        const elementId = req.params.element_id;
        if (!elementId) {
            res.status(400);
            res.send({
                message: 'Param element_id is required.',
            });
            return;
        }
        const result = await this.graphStorage.findIssuerIdentityForElementId(elementId);
        if (result && result.length > 0) {
            res.status(200);
            res.send(result);
        } else {
            res.status(400);
            res.send({
                message: 'Unable to find requested data',
            });
        }
    }
}


module.exports = RestAPIServiceV2;
