const EpcisOtJsonTranspiler = require('.././transpiler/epcis/epcis-otjson-transpiler');
const WotOtJsonTranspiler = require('.././transpiler/wot/wot-otjson-transpiler');
const path = require('path');
const Utilities = require('../Utilities');
const ImportUtilities = require('../ImportUtilities');
const OtJsonUtilities = require('../OtJsonUtilities');
const fs = require('fs');

if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    process.env.NODE_ENV = 'testnet';
}
const environment = process.env.NODE_ENV === 'mariner' ? 'mainnet' : process.env.NODE_ENV;
if (['mainnet', 'testnet', 'development'].indexOf(environment) < 0) {
    throw Error(`Unsupported node environment ${environment}`);
}
const defaultConfig = require('../../config/config')[environment];

process.on('message', async (data) => {
    const {
        datasetId, standardId, handlerId, config,
    } = JSON.parse(data);

    const cacheDirectory = path.join(config.appDataPath, 'export_cache');
    const documentPath = path.join(cacheDirectory, handlerId);

    let document = JSON.parse(fs.readFileSync(documentPath, { encoding: 'utf-8' }));

    try {
        if (!document['@id']) {
            const {
                vertices,
                edges,
                metadata,
            } = document;

            document = {
                '@id': datasetId,
                '@type': 'Dataset',
                '@graph': await ImportUtilities.createDocumentGraph(vertices, edges),
            };

            document.datasetHeader = metadata.datasetHeader;
            document.signature = metadata.signature;

            const sortedDataset = OtJsonUtilities.prepareDatasetForNewExport(document);
            if (sortedDataset) {
                document = sortedDataset;
            }
        }

        const dc_node_wallets = ImportUtilities.extractDatasetSigners(document);
        const data_creator = Utilities.copyObject(document.datasetHeader.dataCreator);

        if (data_creator.identifiers && Array.isArray(data_creator.identifiers)
            && data_creator.identifiers.length > 0) {
            for (const identifierObject of data_creator.identifiers) {
                const identifierSchemaName = identifierObject.validationSchema;

                const schemas = document.datasetHeader.validationSchemas;
                let schemaObject;
                for (const headerSchemaName in schemas) {
                    if (Object.prototype.hasOwnProperty.call(schemas, headerSchemaName) &&
                        identifierSchemaName.includes(headerSchemaName)) {
                        schemaObject = schemas[headerSchemaName];
                    }
                }
                if (schemaObject) {
                    // Added to overwrite the previous ambiguous blockchain_id of Ethereum
                    let blockchain_id;
                    if (schemaObject.networkId === 'mainnet' ||
                        schemaObject.networkId === 'rinkeby') {
                        blockchain_id = defaultConfig.blockchain.implementations[0].network_id;
                    } else {
                        blockchain_id = schemaObject.networkId;
                    }

                    identifierObject.blockchain_id = blockchain_id;
                } else {
                    throw new Error(`Could not find validationSchema for ${identifierSchemaName}`);
                }
            }
        }

        let dataset;
        switch (standardId) {
        case 'gs1': {
            const transpiler = new EpcisOtJsonTranspiler({ config });
            dataset = transpiler.convertFromOTJson(document);
            break;
        }
        case 'wot': {
            const transpiler = new WotOtJsonTranspiler({ config });
            dataset = JSON.stringify(transpiler.convertFromOTJson(document));
            break;
        }
        case 'ot-json': {
            let sortedDataset = OtJsonUtilities.prepareDatasetForOldExport(document);
            if (!sortedDataset) {
                sortedDataset = document;
            }
            dataset = JSON.stringify(sortedDataset);
            break;
        }
        default:
            throw new Error('Export for unsupported standard');
        }

        const cacheDirectory = path.join(config.appDataPath, 'export_cache');

        try {
            await Utilities.writeContentsToFile(
                cacheDirectory,
                handlerId,
                JSON.stringify({ formatted_dataset: dataset, dc_node_wallets, data_creator }),
            );
        } catch (e) {
            const filePath = path.join(cacheDirectory, handlerId);

            if (fs.existsSync(filePath)) {
                await Utilities.deleteDirectory(filePath);
            }
            throw new Error(`Error when creating export cache file for handler_id ${handlerId}. ${e.message}`);
        }
        process.send({ status: 'COMPLETED' });
    } catch (error) {
        const filePath = path.join(cacheDirectory, handlerId);
        if (fs.existsSync(filePath)) {
            await Utilities.deleteDirectory(filePath);
        }
        process.send({ error: `${error.message}` });
    }
});
