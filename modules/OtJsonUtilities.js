const Utilities = require('./Utilities');
const { sha3_256 } = require('js-sha3');

if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    process.env.NODE_ENV = 'testnet';
}
const environment = process.env.NODE_ENV === 'mariner' ? 'mainnet' : process.env.NODE_ENV;
if (['mainnet', 'testnet', 'development'].indexOf(environment) < 0) {
    throw Error(`Unsupported node environment ${environment}`);
}
const defaultConfig = require('../config/config')[environment];


class OtJsonUtilities {
    /**
     * Used for OT-JSON version 1.0
     *
     * Function for sorting a graph by the @id parameter and every graph element's identifier and
     * relation arrays by the hash value of the array element
     * @param graph
     * @returns undefined
     */
    static sortGraphRelationsAndIdentifiers(graph) {
        graph.forEach((el) => {
            if (el.relations) {
                el.relations.sort((r1, r2) => sha3_256(Utilities.sortedStringify(r1))
                    .localeCompare(sha3_256(Utilities.sortedStringify(r2))));
            }

            if (el.identifiers) {
                el.identifiers.sort((r1, r2) => sha3_256(Utilities.sortedStringify(r1))
                    .localeCompare(sha3_256(Utilities.sortedStringify(r2))));
            }
        });
        graph.sort((e1, e2) => (Object.keys(e1['@id']).length > 0 ? e1['@id'].localeCompare(e2['@id']) : 0));
    }

    /**
     * Function for extracting the OT-JSON version of the dataset
     * Throws an error if the field (or a parent field) could not be found
     *
     * @param dataset - Dataset in OT-JSON format, containing the OTJSONVersion in the datasetHeader
     * @returns String - Version of the OT-JSON dataset
     * @private
     */
    static _getDatasetVersion(dataset) {
        if (!dataset || !dataset.datasetHeader ||
            !dataset.datasetHeader.OTJSONVersion) {
            return '1.2';
            // throw new Error('Could not determine dataset ot-json version!');
        }
        return dataset.datasetHeader.OTJSONVersion;
    }

    static _repackDataset(dataset) {
        const config = {};
        config.blockchain = OtJsonUtilities._extractBlockchainData(dataset.datasetHeader);
        // eslint-disable-next-line global-require
        const header = require('./ImportUtilities').createDatasetHeader(
            config, null,
            config.blockchain,
            dataset.datasetHeader.datasetTags,
            dataset.datasetHeader.datasetTitle,
            dataset.datasetHeader.datasetDescription,
            dataset.datasetHeader.OTJSONVersion,
        );
        header.datasetCreationTimestamp = dataset.datasetHeader.datasetCreationTimestamp;
        header.dataIntegrity.proofs[0].proofValue =
            dataset.datasetHeader.dataIntegrity.proofs[0].proofValue;

        const graph = JSON.parse(Utilities.sortedStringify(dataset['@graph'], false));
        return {
            '@id': dataset['@id'],
            '@type': dataset['@type'],
            datasetHeader: header,
            '@graph': graph,
            signature: dataset.signature,
        };
    }

    static _extractBlockchainData(datasetHeader) {
        const result = [];
        for (const creatorId of datasetHeader.dataCreator.identifiers) {
            const identity = creatorId.identifierValue;
            const validationSchemaName = creatorId.validationSchema.replace('/schemas/', '');

            // Added to overwrite the previous ambiguous blockchain_id of Ethereum
            let blockchain_id;
            if (datasetHeader.validationSchemas[validationSchemaName].networkId === 'mainnet' ||
                datasetHeader.validationSchemas[validationSchemaName].networkId === 'rinkeby') {
                blockchain_id = defaultConfig.blockchain.implementations[0].network_id;
            } else {
                blockchain_id = datasetHeader.validationSchemas[validationSchemaName].networkId;
            }

            const schemaPostfix = creatorId.validationSchema.split('erc725-main').pop();
            const schemaEndpoint = `merkleRoot${schemaPostfix}`;
            const hub_contract_address =
                datasetHeader.validationSchemas[schemaEndpoint].hubContractAddress;

            result.push({
                blockchain_id,
                identity,
                hub_contract_address,
            });
        }
        result.sort((a, b) => a.blockchain_id.localeCompare(b.blockchain_id));

        return result;
    }

    /**
     * Formats the dataset graph hash so that the graph hash can be calculated properly for that
     * OT-JSON version
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForGeneratingGraphHash(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            datasetCopy['@graph'] = JSON.parse(Utilities.sortedStringify(datasetCopy['@graph'], true));
            return datasetCopy;
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset graph hash so that the graph Merkle root hash can be calculated properly
     * for that OT-JSON version
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForGeneratingRootHash(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return datasetCopy;
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset for export
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForDatabaseRead(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return datasetCopy;
        case '1.1':
            datasetCopy = Utilities.copyObject(dataset);
            if (datasetCopy.datasetHeader.transpilationInfo) {
                return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
            }
            return this._repackDataset(datasetCopy);
        case '1.2':
            datasetCopy = Utilities.copyObject(dataset);
            return JSON.parse(Utilities.sortObjectRecursively(datasetCopy));
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the signature can be generated properly
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForGeneratingSignature(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset for proper generating of the litigation proof
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the
     *                              dataset it already formatted
     */
    static prepareDatasetForGeneratingLitigationProof(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            datasetCopy['@graph'] = JSON.parse(Utilities.sortedStringify(datasetCopy['@graph'], true));
            return datasetCopy;
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset for proper generating of Merkle proofs for ot-objects
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the
     *                              dataset it already formatted
     */
    static prepareDatasetForGeneratingMerkleProofs(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return datasetCopy;
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the dataset can be read and imported by a Data Viewer
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForDataRead(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the dataset can be imported to the graph database as old otJson
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForOldImport(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the dataset can be imported to the graph database as new otJson
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForNewImport(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            return undefined;
        case '1.1':
            datasetCopy = Utilities.copyObject(dataset);
            if (datasetCopy.datasetHeader.transpilationInfo) {
                return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
            }
            return this._repackDataset(datasetCopy);
        case '1.2':
            datasetCopy = Utilities.copyObject(dataset);
            return JSON.parse(Utilities.sortObjectRecursively(datasetCopy));
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the dataset can be exported and validated in old OT-JSON format
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForOldExport(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            datasetCopy = Utilities.copyObject(dataset);
            OtJsonUtilities.sortGraphRelationsAndIdentifiers(datasetCopy['@graph']);
            return datasetCopy;
        case '1.1':
        case '1.2':
            return undefined;
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset so that the dataset can be exported and validated in new OT-JSON format
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForNewExport(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            return undefined;
        case '1.1':
            datasetCopy = Utilities.copyObject(dataset);
            if (datasetCopy.datasetHeader.transpilationInfo) {
                return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
            }
            return this._repackDataset(datasetCopy);
        case '1.2':
            datasetCopy = Utilities.copyObject(dataset);
            return JSON.parse(Utilities.sortObjectRecursively(datasetCopy));
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }

    /**
     * Formats the dataset for replication import
     *
     * @param dataset
     * @returns {any}|undefined -   A formatted copy of the dataset, or undefined if the dataset is
     *                              already formatted
     */
    static prepareDatasetForNewReplication(dataset) {
        const version = OtJsonUtilities._getDatasetVersion(dataset);

        let datasetCopy;

        switch (version) {
        case '1.0':
            return undefined;
        case '1.1':
            datasetCopy = Utilities.copyObject(dataset);
            if (datasetCopy.datasetHeader.transpilationInfo) {
                return JSON.parse(Utilities.sortedStringify(datasetCopy, false));
            }
            return this._repackDataset(datasetCopy);
        case '1.2':
            datasetCopy = Utilities.copyObject(dataset);
            return JSON.parse(Utilities.sortObjectRecursively(datasetCopy));
        default:
            throw new Error('Unsupported ot-json version!');
        }
    }
}

module.exports = OtJsonUtilities;
