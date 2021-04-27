const fs = require('fs');
const path = require('path');

const Models = require('../../../models/index');
const Command = require('../command');
const ImportUtilities = require('../../ImportUtilities');
const Utilities = require('../../Utilities');
const OtJsonUtilities = require('../../OtJsonUtilities');

/**
 * Handles data read response for free.
 */
class DVDataReadResponseFreeCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.blockchain = ctx.blockchain;
        this.remoteControl = ctx.remoteControl;
        this.commandExecutor = ctx.commandExecutor;
        this.permissionedDataService = ctx.permissionedDataService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     * @param transaction
     */
    async execute(command, transaction) {
        const {
            message,
        } = command.data;


        /*
            message: {
                id: REPLY_ID
                wallet: DH_WALLET,
                data_provider_wallet: DC_WALLET,
                nodeId: KAD_ID
                agreementStatus: CONFIRMED/REJECTED,
                data: { … }
                importId: IMPORT_ID,        // Temporal. Remove it.
            },
         */

        // Is it the chosen one?
        const replyId = message.id;
        const {
            data_set_id: dataSetId,
            data_provider_wallets,
            wallet: dhWallet,
            replication_info: received_replication_info,
            handler_id,
        } = message;

        // Find the particular reply.
        const networkQueryResponse = await Models.network_query_responses.findOne({
            where: { reply_id: replyId },
        });

        if (!networkQueryResponse) {
            throw Error(`Didn't find query reply with ID ${replyId}.`);
        }

        const networkQuery = await Models.network_queries.findOne({
            where: { id: networkQueryResponse.query_id },
        });

        if (message.agreementStatus !== 'CONFIRMED') {
            networkQuery.status = 'REJECTED';
            await networkQuery.save({ fields: ['status'] });
            throw Error('Read not confirmed');
        }

        const { document, permissionedData } = message;
        // Calculate root hash and check is it the same on the SC
        const rootHash = ImportUtilities.calculateDatasetRootHash(document);

        const signerArray = ImportUtilities.extractDatasetSigners(document);
        const myBlockchains = this.blockchain.getAllWallets().map(e => e.blockchain_id);

        const availableBlockchains = [];
        const validationData = {
            fingerprints_exist: 0,
            fingerprints_match: 0,
        };
        for (const signerObject of signerArray) {
            if (myBlockchains.includes(signerObject.blockchain_id)) {
                // eslint-disable-next-line no-await-in-loop
                const fingerprint = await this.blockchain
                    .getRootHash(dataSetId, signerObject.blockchain_id).response;


                if (fingerprint && !Utilities.isZeroHash(fingerprint)) {
                    validationData.fingerprints_exist += 1;
                    if (fingerprint === rootHash) {
                        validationData.fingerprints_match += 1;
                        availableBlockchains.push(signerObject.blockchain_id);
                    } else {
                        this.logger.warn(`Fingerprint root hash for dataset ${dataSetId} does not match on blockchain ${signerObject.blockchain_id}. ` +
                            ` Calculated root hash ${rootHash} differs from received blockchain fingerprint ${fingerprint}`);
                    }
                }
            }
        }

        if (validationData.fingerprints_exist === 0) {
            const errorMessage = `Couldn't not find fingerprint for dataset_id ${dataSetId} on any chain to validate.`;
            this.logger.warn(errorMessage);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            throw errorMessage;
        }

        if (validationData.fingerprints_exist !== validationData.fingerprints_match) {
            const errorMessage = `Fingerprint root hash for dataset ${dataSetId} does not match with the fingerprint received from the blockchain.`;
            this.logger.warn(errorMessage);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            throw errorMessage;
        }

        this.permissionedDataService.attachPermissionedDataToGraph(
            document['@graph'],
            permissionedData,
        );

        const dataCreatorIdentities =
            ImportUtilities.extractDatasetIdentities(document.datasetHeader);

        let profilePromise;
        for (const identityObject of dataCreatorIdentities) {
            const { identity, blockchain_id } = identityObject;
            if (availableBlockchains.includes(blockchain_id)) {
                profilePromise = this.blockchain.getProfile(identity, blockchain_id).response;
                break;
            }
        }
        const profile = await profilePromise;
        await this.permissionedDataService.addMultipleDataSellerForPermissionedData(
            dataSetId,
            dataCreatorIdentities,
            availableBlockchains,
            undefined,
            profile.nodeId.toLowerCase().slice(0, 42),
            document['@graph'],
        );

        const handler = await Models.handler_ids.findOne({
            where: { handler_id },
        });
        const {
            data_set_id,
            standard_id,
            readExport,
        } = JSON.parse(handler.data);

        const replication_info = [];
        for (const replication of received_replication_info) {
            replication_info.push({
                origin: 'PURCHASED',
                offer_id: replication.offer_id,
                blockchain_id: replication.blockchain_id,
                offer_creation_transaction_hash: replication.offer_creation_transaction_hash,
            });
        }

        if (readExport) {
            let sortedDataset = OtJsonUtilities.prepareDatasetForDataRead(document);
            if (!sortedDataset) {
                sortedDataset = document;
            }
            const cacheDirectory = path.join(this.config.appDataPath, 'export_cache');

            try {
                await Utilities.writeContentsToFile(
                    cacheDirectory,
                    handler_id,
                    JSON.stringify(sortedDataset),
                );
            } catch (e) {
                const filePath = path.join(cacheDirectory, handler_id);

                if (fs.existsSync(filePath)) {
                    await Utilities.deleteDirectory(filePath);
                }
                this.handleError(handler_id, `Error when creating export cache file for handler_id ${handler_id}. ${e.message}`);
            }

            const handler = await Models.handler_ids.findOne({
                where: { handler_id },
            });

            const data = JSON.parse(handler.data);
            data.replication_info = replication_info;
            data.data_creator = document.datasetHeader.dataCreator;
            data.signature = document.signature;
            data.root_hash = rootHash;
            handler.data = JSON.stringify(data);

            await Models.handler_ids.update(
                { data: handler.data },
                {
                    where: {
                        handler_id,
                    },
                },
            );

            await this.commandExecutor.add({
                name: 'exportWorkerCommand',
                transactional: false,
                data: {
                    handlerId: handler.handler_id,
                    datasetId: data_set_id,
                    standardId: standard_id,
                },
            });
        }

        try {
            const cacheDirectory = path.join(this.config.appDataPath, 'import_cache');

            await Utilities.writeContentsToFile(
                cacheDirectory,
                handler_id,
                JSON.stringify(document),
            );

            const commandData = {
                documentPath: path.join(cacheDirectory, handler_id),
                handler_id,
                data_provider_wallets,
                purchased: true,
            };

            const commandSequence = [
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
        } catch (error) {
            this.logger.warn(`Failed to import JSON. ${error}.`);
            networkQuery.status = 'FAILED';
            await networkQuery.save({ fields: ['status'] });
            return Command.empty();
        }

        // Store holding information and generate keys for eventual data replication.
        const promises = [];
        for (const replication of replication_info) {
            promises.push(Models.purchased_data.create({
                data_set_id: dataSetId,
                transaction_hash: replication.offer_creation_transaction_hash,
                offer_id: replication.offer_id,
                blockchain_id: replication.blockchain_id,
            }));
        }
        await Promise.all(promises);

        this.logger.info(`Data set ID ${dataSetId} import started.`);
        this.logger.trace(`DataSet ${dataSetId} purchased for query ID ${networkQueryResponse.query_id}, ` +
            `reply ID ${replyId}.`);
        this.remoteControl.readNotification({
            dataSetId,
            queryId: networkQueryResponse.query_id,
            replyId: networkQueryResponse.reply_id,
        });

        return Command.empty();
    }

    async handleError(handlerId, error) {
        this.logger.error(`Export failed for export handler_id: ${handlerId}, error: ${error}`);

        const handler = await Models.handler_ids.findOne({
            where: { handler_id: handlerId },
        });

        const data = JSON.parse(handler.data);
        data.export_status = 'FAILED';
        handler.status = data.import_status === 'PENDING' ? 'PENDING' : 'FAILED';
        handler.data = JSON.stringify(data);

        await Models.handler_ids.update(
            handler,
            {
                where: {
                    handler_id: handlerId,
                },
            },
        );
    }

    /**
     * Builds default DVDataReadResponseFreeCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dvDataReadResponseFreeCommand',
            delay: 0,
            deadline_at: Date.now() + (5 * 60 * 1000),
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DVDataReadResponseFreeCommand;
