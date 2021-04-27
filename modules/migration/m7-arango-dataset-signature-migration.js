// eslint-disable-next-line import/no-extraneous-dependencies
const { Pool } = require('pg');

/**
 * Changes the arango password to a randomly generated one
 */
class M7ArangoDatasetSignatureMigration {
    constructor({ config, graphStorage }) {
        this.config = config;
        this.graphStorage = graphStorage;
    }

    /**
     * Run migration
     */
    async run() {
        const fetchDocumentsKeys = 'for dataset in ot_datasets return {key: dataset._key}';
        const keys = await this.graphStorage.runQuery(fetchDocumentsKeys);
        const blockchain_id = this.config.blockchain.implementations[0].network_id;
        for (let i = 0; i < keys.length; i += 1) {
            const { key } = keys[i];
            const fetchDocumentsQuery = 'RETURN DOCUMENT(\'ot_datasets\', @key)';
            // eslint-disable-next-line no-await-in-loop
            const documentArray = await this.graphStorage.runQuery(fetchDocumentsQuery, { key });
            const document = documentArray[0];
            if (!Array.isArray(document.signature)) {
                const newSignature = [{
                    type: document.signature.type,
                    proofValue: document.signature.value,
                    proofPurpose: 'assertionMethod',
                    created: document.datasetHeader.datasetCreationTimestamp,
                    domain: blockchain_id,
                }];
                document.signature = newSignature;
                // eslint-disable-next-line no-await-in-loop
                await this.graphStorage.updateDocument('ot_datasets', document);
            }
        }
    }
}

module.exports = M7ArangoDatasetSignatureMigration;
