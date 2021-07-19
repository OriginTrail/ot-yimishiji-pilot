const utilities = require('../Utilities');
const Models = require('../../models');
const Utilities = require('../Utilities');
const ImportUtilities = require('../ImportUtilities');
const constants = require('../constants');
const { QueryTypes } = require('sequelize');
const BN = require('bn.js');
const ObjectValidator = require('../validator/object-validator');

/**
 * DC related API controller
 */
class DCController {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.emitter = ctx.emitter;
        this.apiUtilities = ctx.apiUtilities;
        this.config = ctx.config;
        this.dcService = ctx.dcService;
        this.remoteControl = ctx.remoteControl;
        this.graphStorage = ctx.graphStorage;
        this.transport = ctx.transport;
        this.importService = ctx.importService;
        this.commandExecutor = ctx.commandExecutor;
        this.profileService = ctx.profileService;
        this.blockchain = ctx.blockchain;
        this.permissionedDataService = ctx.permissionedDataService;
        this.errorNotificationService = ctx.errorNotificationService;
    }

    /**
     * Validate create offer request and import
     *
     * @param req   HTTP request
     * @param res   HTTP response
     */
    async handleReplicateRequest(req, res) {
        this.logger.api('POST: Replicate request received.');
        if (req.body !== undefined && req.body.dataset_id !== undefined && typeof req.body.dataset_id === 'string' &&
            utilities.validateNumberParameter(req.body.holding_time_in_minutes) &&
            utilities.validateStringParameter(req.body.token_amount_per_holder) &&
            utilities.validateStringParameter(req.body.blockchain_id) &&
            utilities.validateNumberParameter(req.body.litigation_interval_in_minutes)) {
            var handlerId = null;
            var offerId = '';
            try {
                const dataset = await Models.data_info.findOne({
                    where: { data_set_id: req.body.dataset_id },
                });
                if (dataset == null) {
                    this.logger.info('Invalid request');
                    res.status(400);
                    res.send({
                        message: 'This data set does not exist in the database',
                    });
                    return;
                }

                const datasetMetadata = await this.importService
                    .getDatasetMetadata(req.body.dataset_id);

                const signatures = ImportUtilities
                    .extractDatasetIdentities(datasetMetadata.datasetHeader);

                let blockchain_id;
                if (req.body.blockchain_id) {
                    // eslint-disable-next-line prefer-destructuring
                    blockchain_id = req.body.blockchain_id;

                    if (!signatures.find(e => e.blockchain_id === blockchain_id)) {
                        this.logger.info(`Invalid request. There is no dataset signature for blockchain_id ${req.body.blockchain_id}`);
                        res.status(400);
                        res.send({
                            message: `There is no dataset signature for blockchain_id ${req.body.blockchain_id}`,
                        });
                        return;
                    }

                    try {
                        this.blockchain._getImplementationFromId(blockchain_id);
                    } catch (error) {
                        this.logger.info(`Invalid request. ${error.toString()}`);
                        res.status(400);
                        res.send({
                            message: `Invalid blockchain_id ${blockchain_id}`,
                        });
                        return;
                    }
                } else {
                    const defaultBlockchainId = this.blockchain.getDefaultBlockchainId();

                    if (signatures.find(e => e.blockchain_id === defaultBlockchainId)) {
                        blockchain_id = defaultBlockchainId;
                    } else {
                        const allMyBlockchainIds = this.blockchain.getAllBlockchainIds();

                        for (const my_blockchain_id of allMyBlockchainIds) {
                            if (signatures.find(e => e.blockchain_id === my_blockchain_id)) {
                                blockchain_id = my_blockchain_id;
                                break;
                            }
                        }
                    }

                    if (!blockchain_id) {
                        this.logger.info('Invalid request. Cannot choose valid blockchain_id for replication');
                        res.status(400);
                        res.send({
                            message: 'Cannot choose valid blockchain_id for replication',
                        });
                        return;
                    }
                }

                const inserted_object = await Models.handler_ids.create({
                    status: 'PENDING',
                });
                handlerId = inserted_object.dataValues.handler_id;

                res.status(200);
                res.send({
                    handler_id: handlerId,
                });
                const commandData = {
                    dataSetId: req.body.dataset_id,
                    dataRootHash: dataset.root_hash,
                    holdingTimeInMinutes: req.body.holding_time_in_minutes,
                    tokenAmountPerHolder: req.body.token_amount_per_holder,
                    dataSizeInBytes: dataset.otjson_size_in_bytes,
                    litigationIntervalInMinutes: req.body.litigation_interval_in_minutes,
                    handler_id: handlerId,
                    urgent: req.body.urgent,
                    blockchain_id,
                };
                const commandSequence = [
                    'dcOfferPrepareCommand',
                    'dcOfferCreateDbCommand',
                    'dcOfferCreateBcCommand',
                    'dcOfferTaskCommand',
                    'dcOfferChooseCommand'];

                await this.commandExecutor.add({
                    name: commandSequence[0],
                    sequence: commandSequence.slice(1),
                    delay: 0,
                    data: commandData,
                    transactional: false,
                });
            } catch (error) {
                this.logger.error(`Failed to create offer. ${error}.`);

                this.errorNotificationService.notifyError(
                    error,
                    {
                        offerId,
                        tokenAmountPerHolder: req.body.token_amount_per_holder,
                        datasetId: req.body.dataset_id,
                        holdingTimeInMinutes: req.body.holding_time_in_minutes,
                    },
                    constants.PROCESS_NAME.offerHandling,
                );

                if (handlerId) {
                    Models.handler_ids.update({
                        status: 'FAILED',
                    }, { where: { handler_id: handlerId } });
                }
                res.status(400);
                res.send({
                    message: `Failed to start offer. ${error}.`,
                });
                this.remoteControl.failedToCreateOffer(`Failed to start offer. ${error}.`);
            }
        } else {
            this.logger.error('Invalid request');
            res.status(400);
            res.send({
                message: 'Invalid parameters!',
            });
        }
    }

    async updatePermissionedDataPrice(req, res) {
        this.logger.api('POST: Set permissioned data price.');
        if (req.body == null
            || req.body.data_set_id == null
            || req.body.ot_object_ids == null) {
            res.status(400);
            res.send({ message: 'Params data_set_id and ot_object_ids are required.' });
            return;
        }

        const blockchain_ids = req.body.blockchain_id ?
            [req.body.blockchain_id] : this.blockchain.getAllBlockchainIds();

        const promises = [];
        req.body.ot_object_ids.forEach((ot_object) => {
            promises.push(new Promise(async (accept, reject) => {
                const condition = {
                    seller_node_id: this.config.identity,
                    data_set_id: req.body.data_set_id.toLowerCase(),
                    ot_json_object_id: ot_object.id,
                    blockchain_id: {
                        [Models.Sequelize.Op.in]: blockchain_ids,
                    },
                };

                const data = await Models.data_sellers.findAll({
                    where: condition,
                });

                if (data && Array.isArray(data) && data.length > 0) {
                    const promises = [];
                    for (const data_object of data) {
                        promises.push(Models.data_sellers.update(
                            { price: ot_object.price_in_trac },
                            { where: { id: data_object.id } },
                        ));
                    }
                    await Promise.all(promises);
                    accept();
                } else {
                    reject(Error(`Could not find a permissioned data object for ${ot_object.id} in dataset ${req.body.data_set_id}`
                   + ` replicated to blockchains: ${blockchain_ids}.`));
                }
            }));
        });
        await Promise.all(promises).then(() => {
            res.status(200);
            res.send({ status: 'COMPLETED' });
        }).catch((error) => {
            res.status(400);
            res.send({ status: error.toString() });
        });
    }

    async handlePermissionedDataReadRequest(message) {
        const {
            data_set_id, dv_erc725_identities, ot_object_ids, handler_id, nodeId,
        } = message;

        const privateDataPermissions = await Models.data_trades.findAll({
            where: {
                data_set_id,
                ot_json_object_id: {
                    [Models.Sequelize.Op.in]: ot_object_ids,
                },
                buyer_node_id: nodeId,
                status: 'COMPLETED',
            },
        });
        if (!privateDataPermissions || privateDataPermissions.length === 0) {
            throw Error('You don\'t have permission to view objectId: '
                + `${ot_object_ids} from dataset: ${data_set_id}`);
        }

        const { node_wallet, node_private_key } = this.blockchain.getWallet().response;

        let promises = [];
        privateDataPermissions.forEach((privateDataPermisssion) => {
            promises.push(this.graphStorage.findDocumentsByImportIdAndOtObjectId(
                data_set_id,
                privateDataPermisssion.dataValues.ot_json_object_id,
            ));
        });
        const otObjects = await Promise.all(promises);

        const supportedBlockchains = this.blockchain.getAllBlockchainIds();
        const filteredDVIdentities = dv_erc725_identities.filter(identityObject =>
            supportedBlockchains.includes(identityObject.blockchain_id));

        promises = [];
        for (const dataPermission of privateDataPermissions) {
            for (const blockchain_identity of filteredDVIdentities) {
                promises.push(Models.data_sellers.create({
                    data_set_id,
                    ot_json_object_id: dataPermission.ot_json_object_id,
                    seller_node_id: Utilities.denormalizeHex(nodeId),
                    seller_erc_id: Utilities.normalizeHex(blockchain_identity.response),
                    blockchain_id: blockchain_identity.blockchain_id,
                    price: 0,
                }));
            }
        }
        await Promise.all(promises);

        const replyMessage = {
            wallet: node_wallet,
            handler_id,
            supported_identities: filteredDVIdentities,
            ot_objects: otObjects,
        };

        const privateDataReadResponseObject = {
            message: replyMessage,
            messageSignature: Utilities.generateRsvSignature(
                replyMessage,
                node_private_key,
            ),
        };
        await this.transport.sendPermissionedDataReadResponse(
            privateDataReadResponseObject,
            nodeId,
        );
    }

    async handleNetworkPurchaseRequest(request) {
        const {
            data_set_id, dv_erc725_identity, handler_id,
            dv_node_id, ot_json_object_id, price, blockchain_id,
        } = request;

        // todo validate data in request

        const commandData = {
            data_set_id,
            dv_erc725_identity,
            handler_id,
            ot_json_object_id,
            price,
            blockchain_id,
            dv_node_id,
        };

        await this.commandExecutor.add({
            name: 'dhPurchaseRequestedCommand',
            delay: 0,
            data: commandData,
            transactional: false,
        });
    }

    async getPermissionedDataOwned(req, res) {
        this.logger.api('GET: Permissioned Data Owned.');

        const allMyIdentities = this.blockchain.getAllBlockchainIds()
            .map(id => this.profileService.getIdentity(id));
        const query =
            'SELECT ds.data_set_id, ds.ot_json_object_id, ds.price, ds.blockchain_id, ' +
            '( SELECT Count(*) FROM data_trades dt WHERE dt.seller_erc_id = ds.seller_erc_id ' +
            'AND ds.data_set_id = dt.data_set_id and ds.blockchain_id = dt.blockchain_id AND ' +
            'ds.ot_json_object_id = dt.ot_json_object_id AND dt.status = \'COMPLETED\') as sales ' +
            'FROM  data_sellers ds WHERE ds.seller_erc_id IN (:seller_ercs)';


        const data = await Models.sequelize.query(
            query,
            {
                replacements: { seller_ercs: allMyIdentities },
                type: QueryTypes.SELECT,
            },
        );

        const result = [];

        if (data.length > 0) {
            const owned_objects = {};
            const allDatasets = [];
            /*
               Creating a map of the following structure
               owned_objects: {
                    dataset_0x456: {
                        ot_objects: [ot_object_0x789, ...]
                        ...,
                    },
                    ...
               }
             */
            data.forEach((obj) => {
                if (owned_objects[obj.data_set_id]) {
                    const ot_object = owned_objects[obj.data_set_id]
                        .ot_objects.find(added_obj => added_obj.id === obj.ot_json_object_id);

                    if (ot_object) {
                        ot_object.prices.push({
                            blockchain_id: obj.blockchain_id,
                            price_in_trac: obj.price,
                        });
                        ot_object.sales = (new BN(ot_object.sales, 10))
                            .iadd(new BN(obj.sales, 10)).toString();
                        owned_objects[obj.data_set_id].total_sales.iadd(new BN(obj.sales, 10));
                    } else {
                        owned_objects[obj.data_set_id].ot_objects.push({
                            id: obj.ot_json_object_id,
                            prices: [{
                                blockchain_id: obj.blockchain_id,
                                price_in_trac: obj.price,
                            }],
                            sales: obj.sales,
                        });
                        owned_objects[obj.data_set_id].total_sales.iadd(new BN(obj.sales, 10));
                        owned_objects[obj.data_set_id].total_price.iadd(new BN(obj.price, 10));
                    }
                } else {
                    allDatasets.push(obj.data_set_id);
                    owned_objects[obj.data_set_id] = {};
                    owned_objects[obj.data_set_id].ot_objects = [{
                        id: obj.ot_json_object_id,
                        prices: [{
                            blockchain_id: obj.blockchain_id,
                            price_in_trac: obj.price,
                        }],
                        sales: obj.sales,
                    }];
                    owned_objects[obj.data_set_id].total_sales = new BN(obj.sales, 10);
                    owned_objects[obj.data_set_id].total_price = new BN(obj.price, 10);
                }
            });

            const allMetadata = await this.importService.getMultipleDatasetMetadata(allDatasets);

            const dataInfos = await Models.data_info.findAll({
                where: {
                    data_set_id: {
                        [Models.sequelize.Op.in]: allDatasets,
                    },
                },
                include: [
                    {
                        model: Models.data_provider_wallets,
                        attributes: ['wallet', 'blockchain_id'],
                    },
                ],
            });

            allDatasets.forEach((datasetId) => {
                const { datasetHeader } = allMetadata.find(metadata => metadata._key === datasetId);
                const dataInfo = dataInfos.find(info => info.data_set_id === datasetId);
                owned_objects[datasetId].metadata = {
                    datasetTitle: datasetHeader.datasetTitle,
                    datasetTags: datasetHeader.datasetTags,
                    datasetDescription: datasetHeader.datasetDescription,
                    timestamp: dataInfo.import_timestamp,
                };
            });

            for (const dataset in owned_objects) {
                result.push({
                    timestamp: (new Date(owned_objects[dataset].metadata.timestamp)).getTime(),
                    dataset: {
                        id: dataset,
                        name: owned_objects[dataset].metadata.datasetTitle,
                        description: owned_objects[dataset].metadata.datasetDescription || 'No description given',
                        tags: owned_objects[dataset].metadata.datasetTags,
                    },
                    ot_objects: owned_objects[dataset].ot_objects,
                    total_sales: owned_objects[dataset].total_sales.toString(),
                    total_price: owned_objects[dataset].total_price.toString(),
                });
            }
        }

        res.status(200);
        res.send(result);
    }

    async handleNetworkPriceRequest(request) {
        const {
            data_set_id, handler_id, dv_node_id, ot_json_object_id,
        } = request;

        const { node_wallet, node_private_key } = this.blockchain.getWallet().response;

        let response;
        const data = await Models.data_sellers.findAll({
            where: {
                seller_node_id: this.config.identity,
                data_set_id,
                ot_json_object_id,
            },
        });
        if (data && Array.isArray(data) && data.length > 0) {
            const prices = [];
            for (const price of data) {
                prices.push({
                    blockchain_id: price.blockchain_id,
                    seller_erc_id: this.profileService.getIdentity(price.blockchain_id),
                    price_in_trac: price.price,
                });
            }
            response = {
                handler_id,
                status: 'COMPLETED',
                wallet: node_wallet,
                prices,
            };
        } else {
            response = {
                handler_id,
                status: 'FAILED',
                wallet: node_wallet,
            };
        }


        const dataPriceResponseObject = {
            message: response,
            messageSignature: Utilities.generateRsvSignature(
                response,
                node_private_key,
            ),
        };

        await this.transport.sendPermissionedDataPriceResponse(
            dataPriceResponseObject,
            dv_node_id,
        );
    }


    async removePermissionedData(req, res) {
        this.logger.api('POST: Remove permissioned data request received.');
        if (req.body === undefined ||
            req.body.dataset_id === undefined ||
            req.body.identifier_value === undefined ||
            req.body.identifier_type === undefined
        ) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }

        const { dataset_id, identifier_value, identifier_type } = req.body;

        let status = await this.permissionedDataService.removePermissionedDataInDb(
            dataset_id,
            Utilities.keyFrom(identifier_type, identifier_value),
        );

        const allMyIdentities = this.blockchain.getAllBlockchainIds()
            .map(id => this.profileService.getIdentity(id));

        await Models.data_sellers.destroy({
            where: {
                data_set_id: dataset_id,
                seller_erc_id: {
                    [Models.Sequelize.Op.in]: allMyIdentities,
                },
                ot_json_object_id: identifier_value,
            },
        });

        let message;
        if (status) {
            status = 'COMPLETED';
            message = 'Permissioned data successfully removed';
        } else {
            status = 'FAILED';
            message = 'Permissioned data doesn\'t exist';
        }
        res.status(200);
        res.send({ status, message });
    }

    /**
     * Query local data
     * @param query Query
     * @returns {Promise<*>}
     */
    async queryLocal(req, res) {
        this.logger.api('POST: Query local request received.');
        if (!req.body) {
            res.status(400);
            res.send({
                message: 'Body is missing',
            });
            return;
        }

        const { query } = req.body;

        this.logger.info(`Local query handling triggered with ${JSON.stringify(query)}.`);
        const validationError = ObjectValidator.validateSearchQueryObject(query);
        if (validationError) {
            throw validationError;
        }

        const { path, value } = query[0];
        const valuesArray = Utilities.arrayze(value);

        const keys = [];

        for (let i = 0; i < valuesArray.length; i += 1) {
            keys.push(Utilities.keyFrom(path, valuesArray[i]));
        }

        const result = await this.graphStorage.findLocalQuery({
            identifierKeys: keys,
        });
        const response = this.importService.packLocalQueryData(result);
        for (let i = 0; i < response.length; i += 1) {
            let offer_id = null;

            // eslint-disable-next-line no-await-in-loop
            const offer = await Models.offers.findOne({
                where: { data_set_id: response[i].datasets[0], status: { [Models.Sequelize.Op.not]: 'FAILED' } },
            });

            if (offer) {
                // eslint-disable-next-line prefer-destructuring
                offer_id = offer.offer_id;
            } else {
                // eslint-disable-next-line no-await-in-loop
                const bid = await Models.bids.findOne({
                    where: { data_set_id: response[i].datasets[0], status: { [Models.Sequelize.Op.not]: 'FAILED' } },
                });

                    // eslint-disable-next-line prefer-destructuring
                if (bid) { offer_id = bid.offer_id; }
            }

            // eslint-disable-next-line prefer-destructuring
            response[i].dataset_id = response[i].datasets[0];
            response[i].offer_id = offer_id;
            delete response[i].datasets;
        }

        res.status(200);
        res.send(response);
    }

    async getMerkleProofs(req, res) {
        this.logger.api('POST: Get Merkle proofs request received.');

        if (req.body === undefined) {
            res.status(400);
            res.send({
                message: 'Bad request',
            });
            return;
        }


        if (!(req.body instanceof Array)) {
            req.body = Utilities.arrayze(req.body);
        }

        try {
            const promises = [];

            for (const obj of req.body) {
                if (obj.object_ids === undefined ||
                obj.dataset_id === undefined) {
                    res.status(400);
                    res.send({
                        message: 'Bad request',
                    });
                    return;
                }

                const { object_ids, dataset_id } = obj;
                promises.push(this.importService
                    .getMerkleProofs(Utilities.arrayze(object_ids), dataset_id));
            }


            let response = await Promise.all(promises);
            response = Array.prototype.concat.apply([], response);

            res.status(200);
            res.send(response);
        } catch (e) {
            res.status(404);
            res.send({
                message: 'Data not found',
            });
        }
    }
}

module.exports = DCController;

