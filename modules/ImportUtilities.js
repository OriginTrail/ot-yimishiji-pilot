const bytes = require('utf8-length');
const uuidv4 = require('uuid/v4');
const { sha3_256 } = require('js-sha3');

const constants = require('./constants');
const Utilities = require('./Utilities');
const MerkleTree = require('./Merkle');
const Graph = require('./Graph');
const Encryption = require('./RSAEncryption');
const { normalizeGraph } = require('./Database/graph-converter');
const Models = require('../models');
const OtJsonUtilities = require('./OtJsonUtilities');
const DataIntegrityResolver = require('./service/data-integrity/data-integrity-resolver');
// TODO Is this safe to read, IE will it always be the same,
//  (could the node somehow change this in runtime? )
if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    process.env.NODE_ENV = 'testnet';
}
const environment = process.env.NODE_ENV === 'mariner' ? 'mainnet' : process.env.NODE_ENV;
if (['mainnet', 'testnet', 'development'].indexOf(environment) < 0) {
    throw Error(`Unsupported node environment ${environment}`);
}
const defaultConfig = require('../config/config')[environment];

const data_constants = {
    vertexType: {
        entityObject: 'EntityObject',
        identifier: 'Identifier',
        data: 'Data',
        connector: 'Connector',
    },
    edgeType: {
        identifierRelation: 'IdentifierRelation',
        dataRelation: 'dataRelation',
        otRelation: 'otRelation',
        connectorRelation: 'ConnectorRelation',
    },
    objectType: {
        otObject: 'otObject',
        otConnector: 'otConnector',
    },
    relationType: {
        identifies: 'IDENTIFIES',
        identifiedBy: 'IDENTIFIED_BY',
        hasData: 'HAS_DATA',
        connectionDownstream: 'CONNECTION_DOWNSTREAM',
    },
};
Object.freeze(data_constants);

/**
 * Import related utilities
 */
class ImportUtilities {
    /**
     * Hides _key attributes
     * @param vertices
     * @param edges
     * @param color
     */
    static packKeys(vertices, edges, color) {
        for (const vertex of vertices) {
            if (!vertex._dc_key) {
                vertex._dc_key = vertex._key;
                vertex._key = uuidv4();
            }
            vertex.encrypted = color;
        }
        // map _from and _to
        const find = (key) => {
            const filtered = vertices.filter(v => v._dc_key === key);
            if (filtered.length > 0) {
                return filtered[0]._key;
            }
            return null;
        };
        for (const edge of edges) {
            const from = find(edge._from);
            if (from) {
                edge._from = from;
            }
            const to = find(edge._to);
            if (to) {
                edge._to = to;
            }

            edge.encrypted = color;
        }
        for (const edge of edges) {
            if (!edge._dc_key) {
                edge._dc_key = edge._key;
                edge._key = uuidv4();
            }
        }
    }

    /**
     * Restores _key attributes
     * @param vertices
     * @param edges
     */
    static unpackKeys(vertices, edges) {
        const mapping = {};
        for (const vertex of vertices) {
            if (vertex._dc_key) {
                mapping[vertex._key] = vertex._dc_key;
                vertex._key = vertex._dc_key;
                delete vertex._dc_key;
            }
            delete vertex.encrypted;
        }
        for (const edge of edges) {
            if (edge._dc_key) {
                edge._key = edge._dc_key;
                delete edge._dc_key;

                if (mapping[edge._from]) {
                    edge._from = mapping[edge._from];
                }
                if (mapping[edge._to]) {
                    edge._to = mapping[edge._to];
                }
            }
            delete edge.encrypted;
        }
    }

    /**
     * Format empty identifiers, properties and relations format from a graph.
     * @param graph
     */
    static formatGraph(graph) {
        graph.filter(vertex => vertex['@type'] === 'otObject').forEach((vertex) => {
            if (vertex.identifiers == null) {
                vertex.identifiers = [];
            }
            if (vertex.properties != null && Object.keys(vertex.properties).length === 0) {
                delete vertex.properties;
            }
            if (vertex.relations == null) {
                vertex.relations = [];
            } else {
                vertex.relations.forEach((relation) => {
                    if (relation.direction == null) {
                        relation.direction = 'direct';
                    }
                });
            }
        });
        return graph;
    }

    static prepareDataset(originalDocument, config, blockchain) {
        const datasetHeader = originalDocument.datasetHeader ? originalDocument.datasetHeader : {};
        ImportUtilities.calculateGraphPermissionedDataHashes(originalDocument['@graph']);

        const header = ImportUtilities.createDatasetHeader(
            config, null,
            blockchain,
            datasetHeader.datasetTags,
            datasetHeader.datasetTitle,
            datasetHeader.datasetDescription,
            datasetHeader.OTJSONVersion,
            datasetHeader.datasetCreationTimestamp,
        );
        const dataset = {
            '@id': '',
            '@type': 'Dataset',
            datasetHeader: header,
            '@graph': originalDocument['@graph'],
        };

        let document = OtJsonUtilities.prepareDatasetForNewImport(dataset, blockchain);
        if (!document) {
            document = dataset;
        }
        document['@id'] = ImportUtilities.calculateGraphPublicHash(document);

        const rootHash = ImportUtilities.calculateDatasetRootHash(document);
        ImportUtilities.attachDatasetRootHash(document.datasetHeader, rootHash);

        const signed = ImportUtilities.signDataset(document, blockchain);
        return signed;
    }

    /**
     * Add the permissioned data hash to each graph object with permissioned data
     * @param graph
     * @returns {null}
     */
    static calculateGraphPermissionedDataHashes(graph) {
        graph.forEach((object) => {
            ImportUtilities.calculateObjectPermissionedDataHash(object);
        });
    }

    /**
     * Add permissioned data hash to the permissioned_data object
     * @param ot_object
     * @returns {null}
     */
    static calculateObjectPermissionedDataHash(ot_object) {
        if (!ot_object || !ot_object.properties) {
            throw Error(`Cannot calculate permissioned data hash for invalid ot-json object ${ot_object}`);
        }
        const permissionedDataObject = ot_object.properties.permissioned_data;
        if (permissionedDataObject && permissionedDataObject.data) {
            const permissionedDataHash =
                ImportUtilities.calculatePermissionedDataHash(permissionedDataObject);
            permissionedDataObject.permissioned_data_hash = permissionedDataHash;
        }
    }

    /**
     * Calculates the merkle tree root hash of an object
     * The object is sliced to DEFAULT_CHALLENGE_BLOCK_SIZE_BYTES sized blocks (potentially padded)
     * The tree contains at least NUMBER_OF_PERMISSIONED_DATA_FIRST_LEVEL_BLOCKS
     * @param permissioned_object
     * @returns {null}
     */
    static calculatePermissionedDataHash(permissioned_object) {
        const merkleTree = ImportUtilities
            .calculatePermissionedDataMerkleTree(permissioned_object);
        return merkleTree.getRoot();
    }

    /**
     * Calculates the merkle tree of an object
     * The object is sliced to DEFAULT_CHALLENGE_BLOCK_SIZE_BYTES sized blocks (potentially padded)
     * The tree contains at least NUMBER_OF_PERMISSIONED_DATA_FIRST_LEVEL_BLOCKS
     * @param permissioned_object
     * @returns {null}
     */
    static calculatePermissionedDataMerkleTree(permissioned_object) {
        if (!permissioned_object || !permissioned_object.data) {
            throw Error('Cannot calculate root hash of an empty object');
        }
        const sorted_data = Utilities.sortedStringify(permissioned_object.data, true);
        const data = Buffer.from(sorted_data);

        const first_level_blocks = constants.NUMBER_OF_PERMISSIONED_DATA_FIRST_LEVEL_BLOCKS;
        const default_block_size = constants.DEFAULT_CHALLENGE_BLOCK_SIZE_BYTES;

        let block_size = Math.min(Math.round(data.length / first_level_blocks), default_block_size);
        block_size = block_size < 1 ? 1 : block_size;

        const blocks = [];
        for (let i = 0; i < data.length || blocks.length < first_level_blocks; i += block_size) {
            const block = data.slice(i, i + block_size).toString('hex');
            blocks.push(block.padStart(64, '0'));
        }

        const merkleTree = new MerkleTree(blocks, 'purchase', 'soliditySha3');
        return merkleTree;
    }

    /**
     * Decrypt encrypted OT-JSON dataset
     * @param dataset - OT-JSON dataset
     * @param decryptionKey - Decryption key
     * @param offerId - Replication identifier from which the dataset was received
     * @param encryptionColor - Encryption color
     * @returns Decrypted OTJson dataset
     */
    static decryptDataset(dataset, decryptionKey, offerId = null, encryptionColor = null) {
        const decryptedDataset = Utilities.copyObject(dataset);
        const encryptedMap = {};
        encryptedMap.objects = {};
        encryptedMap.relations = {};
        const colorMap = {
            0: 'red',
            1: 'green',
            2: 'blue',
        };

        for (const obj of decryptedDataset['@graph']) {
            if (obj.properties != null) {
                const encryptedProperties = obj.properties;
                obj.properties = Encryption.decryptObject(obj.properties, decryptionKey);
                if (encryptionColor != null) {
                    const encColor = colorMap[encryptionColor];
                    encryptedMap.objects[obj['@id']] = {};
                    encryptedMap.objects[obj['@id']][offerId] = {};
                    encryptedMap.objects[obj['@id']][offerId][encColor] = encryptedProperties;
                }
            }
            if (obj.relations != null) {
                encryptedMap.relations[obj['@id']] = {};
                for (const rel of obj.relations) {
                    if (rel.properties != null) {
                        const encryptedProperties = rel.properties;
                        rel.properties = Encryption.decryptObject(rel.properties, decryptionKey);
                        if (encryptionColor != null) {
                            const encColor = colorMap[encryptionColor];
                            const relationKey = sha3_256(Utilities.stringify(rel, 0));
                            encryptedMap.relations[obj['@id']][relationKey] = {};
                            encryptedMap.relations[obj['@id']][relationKey][offerId] = {};
                            encryptedMap.relations[obj['@id']][relationKey][offerId][encColor] =
                                encryptedProperties;
                        }
                    }
                }
            }
        }
        return {
            decryptedDataset,
            encryptedMap,
        };
    }


    static encryptDataset(dataset, encryptionKey) {
        const encryptedDataset = Utilities.copyObject(dataset);

        for (const obj of encryptedDataset['@graph']) {
            if (obj.properties != null) {
                const encryptedProperties = Encryption.encryptObject(obj.properties, encryptionKey);
                obj.properties = encryptedProperties;
            }
            if (obj.relations != null) {
                for (const rel of obj.relations) {
                    if (rel.properties != null) {
                        const encryptedProperties =
                            Encryption.encryptObject(rel.properties, encryptionKey);
                        rel.properties = encryptedProperties;
                    }
                }
            }
        }
        return encryptedDataset;
    }

    /**
     * Normalizes import (use just necessary data)
     * @param dataSetId - Dataset ID
     * @param vertices - Import vertices
     * @param edges - Import edges
     * @returns {{edges: *, vertices: *}}
     */
    static normalizeImport(dataSetId, vertices, edges) {
        ImportUtilities.sort(edges);
        ImportUtilities.sort(vertices);

        const { vertices: normVertices, edges: normEdges } = normalizeGraph(
            dataSetId,
            vertices,
            edges,
        );

        return Utilities.sortObject({
            edges: normEdges,
            vertices: normVertices,
        });
    }

    /**
     * Calculate import hash
     * @param dataSetId Data set ID
     * @param vertices  Import vertices
     * @param edges     Import edges
     * @returns {*}
     */
    static importHash(dataSetId, vertices, edges) {
        const normalized = ImportUtilities.normalizeImport(dataSetId, vertices, edges);
        return Utilities.normalizeHex(sha3_256(Utilities.stringify(normalized, 0)));
    }

    /**
     * Creates Merkle tree from import data
     * @param vertices  Import vertices
     * @param edges     Import edges
     * @return {Promise<{tree: MerkleTree, leaves: Array, hashPairs: Array}>}
     */
    static async merkleStructure(vertices, edges) {
        ImportUtilities.sort(edges);
        ImportUtilities.sort(vertices);

        const leaves = [];
        const hashPairs = [];

        // process vertices
        for (const i in vertices) {
            const hash = Utilities.soliditySHA3(Utilities.sortObject({
                identifiers: vertices[i].identifiers,
                data: vertices[i].data,
            }));
            leaves.push(hash);
            hashPairs.push({
                key: vertices[i]._key,
                hash,
            });
        }

        for (const edge of edges) {
            const hash = Utilities.soliditySHA3(Utilities.sortObject({
                identifiers: edge.identifiers,
                _from: edge._from,
                _to: edge._to,
                edge_type: edge.edge_type,
            }));
            leaves.push(hash);
            hashPairs.push({
                key: edge._key,
                hash,
            });
        }

        leaves.sort();
        const tree = new MerkleTree(leaves);
        return {
            tree,
            leaves,
            hashPairs,
        };
    }

    static sort(documents, key = '_key') {
        const sort = (a, b) => {
            if (a[key] < b[key]) {
                return -1;
            } else if (a[key] > b[key]) {
                return 1;
            }
            return 0;
        };
        documents.sort(sort);
    }

    static compareDocuments(documents1, documents2) {
        ImportUtilities.sort(documents1);
        ImportUtilities.sort(documents2);

        for (const index in documents1) {
            const distance = Utilities.objectDistance(documents1[index], documents2[index]);
            if (distance !== 100) {
                return false;
            }
        }
        return true;
    }

    static calculateDatasetSummary(graph, datasetId, datasetCreator) {
        return {
            datasetId,
            datasetCreator,
            objects: graph.map(vertex => ({
                '@id': vertex['@id'],
                identifiers: vertex.identifiers != null ? vertex.identifiers : [],
            })),
            numRelations: graph.filter(vertex => vertex.relations != null)
                .reduce((acc, value) => acc + value.relations.length, 0),
        };
    }

    static createDistributionMerkleTree(graph, datasetId, datasetCreator) {
        const datasetSummary =
            this.calculateDatasetSummary(graph, datasetId, datasetCreator);

        const stringifiedGraph = [];
        for (const obj of graph) {
            stringifiedGraph.push(Utilities.sortedStringify(obj));
        }

        return new MerkleTree(
            [Utilities.sortedStringify(datasetSummary), ...stringifiedGraph],
            'distribution',
            'sha3',
        );
    }

    static calculateDatasetRootHash(dataset) {
        let sortedDataset = OtJsonUtilities.prepareDatasetForGeneratingRootHash(dataset);
        if (!sortedDataset) {
            sortedDataset = Utilities.copyObject(dataset);
        }
        ImportUtilities.removeGraphPermissionedData(sortedDataset['@graph']);
        const datasetId = sortedDataset['@id'];
        const datasetCreator = sortedDataset.datasetHeader.dataCreator;

        const merkle = ImportUtilities.createDistributionMerkleTree(
            sortedDataset['@graph'],
            datasetId,
            datasetCreator,
        );

        return merkle.getRoot();
    }

    /**
     * Sort @graph data inline
     * @param graph
     */
    static sortGraphRecursively(graph) {
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
        return Utilities.sortedStringify(graph, true);
    }

    /**
     * Calculates more or less accurate size of the import
     * @param vertices   Collection of vertices
     * @returns {number} Size in bytes
     */
    static calculateEncryptedImportSize(vertices) {
        const keyPair = Encryption.generateKeyPair(); // generate random pair of keys
        Graph.encryptVertices(vertices, keyPair.privateKey);
        return bytes(JSON.stringify(vertices));
    }

    /**
     * Deletes internal vertex data
     * @param vertices
     */
    static deleteInternal(vertices) {
        for (const vertex of vertices) {
            delete vertex.datasets;
            delete vertex.private;
            delete vertex.version;
        }
    }

    /**
     * Encrypt vertices data with specified private key.
     *
     * All vertices that has data property will be encrypted with given private key.
     * @param vertices Vertices to encrypt
     * @param privateKey Encryption key
     */
    static immutableEncryptVertices(vertices, privateKey) {
        const copy = Utilities.copyObject(vertices);
        for (const id in copy) {
            const vertex = copy[id];
            if (vertex.data) {
                vertex.data = Encryption.encryptObject(vertex.data, privateKey);
            }
        }
        return copy;
    }

    /**
     * Decrypts vertices with a public key
     * @param vertices      Encrypted vertices
     * @param public_key    Public key
     * @returns {*}
     */
    static immutableDecryptVertices(vertices, public_key) {
        const copy = Utilities.copyObject(vertices);
        for (const id in copy) {
            if (copy[id].data) {
                copy[id].data = Encryption.decryptObject(copy[id].data, public_key);
            }
        }
        return copy;
    }

    /**
     * Gets replication information for a dataset
     * @param dataSetId Data set ID
     * @param origin    Data set origin
     * @return {Promise<Array<String>|null>}
     */
    static async getReplicationInfo(dataSetId, origin) {
        let replicationInfo = null;

        switch (origin) {
        case 'PURCHASED': {
            const purchasedData = await Models.purchased_data.findAll({
                where: { data_set_id: dataSetId },
            });
            if (purchasedData && Array.isArray(purchasedData) && purchasedData.length > 0) {
                replicationInfo = purchasedData.map(element => ({
                    origin,
                    offer_id: element.dataValues.offer_id,
                    blockchain_id: element.dataValues.blockchain_id,
                    offer_creation_transaction_hash: element.dataValues.transaction_hash,
                }));
            }
            break;
        }
        case 'HOLDING': {
            const bids = await Models.bids.findAll({
                where: { data_set_id: dataSetId },
            });

            const holdingData = await Models.holding_data.findAll({
                where: { data_set_id: dataSetId },
            });


            if (bids && Array.isArray(bids) && bids.length > 0) {
                replicationInfo = [];

                for (const bid of bids) {
                    const holdingDataEntry = holdingData
                        .find(hd => hd.dataValues.offer_id === bid.dataValues.offer_id);
                    if (holdingDataEntry) {
                        const { transaction_hash } = holdingDataEntry.dataValues;

                        replicationInfo.push({
                            origin,
                            offer_id: bid.dataValues.offer_id,
                            blockchain_id: bid.dataValues.blockchain_id,
                            status: bid.dataValues.status,

                            offer_creation_transaction_hash: transaction_hash,

                            token_amount_per_holder: bid.dataValues.token_amount,
                            holding_time_in_minutes: bid.dataValues.holding_time_in_minutes,
                            data_size_in_bytes: bid.dataValues.data_size_in_bytes,
                            litigation_interval_in_minutes:
                                bid.dataValues.litigation_interval_in_minutes,
                        });
                    }
                }
            }
            break;
        }
        case 'IMPORTED': {
            const offers = await Models.offers.findAll({
                where: { data_set_id: dataSetId },
            });

            if (offers && Array.isArray(offers) && offers.length > 0) {
                if (offers.length > 1) {
                    const offerIds = offers.map(e => e.dataValues.offer_id);
                    const replicatedData = await Models.replicated_data.findAll({
                        where: {
                            offer_id: {
                                [Models.sequelize.Op.in]: offerIds,
                            },
                        },
                        order: [
                            ['id', 'DESC'],
                        ],
                    });
                    if (replicatedData
                        && Array.isArray(replicatedData)
                        && replicatedData.length > 1) {
                        offers.sort((a, b) => {
                            const index_a = replicatedData.findIndex(e =>
                                e.dataValues.offer_id === a.dataValues.offer_id);
                            const index_b = replicatedData.findIndex(e =>
                                e.dataValues.offer_id === b.dataValues.offer_id);

                            if (index_a === -1 && index_b === -1) {
                                return 0;
                            } else if (index_a === -1) {
                                return 1;
                            } else if (index_b === -1) {
                                return -1;
                            }
                            return index_a - index_b;
                        });
                    }
                }

                replicationInfo = offers.map(e => ({
                    origin,
                    offer_id: e.dataValues.offer_id,
                    blockchain_id: e.dataValues.blockchain_id,
                    status: e.dataValues.status,

                    offer_creation_transaction_hash: e.dataValues.transaction_hash,
                    offer_finalize_transaction_hash: e.dataValues.offer_finalize_transaction_hash,

                    number_of_replications:
                        e.dataValues.number_of_replications,
                    number_of_verified_replications:
                        e.dataValues.number_of_verified_replications,

                    token_amount_per_holder: e.dataValues.token_amount_per_holder,
                    holding_time_in_minutes: e.dataValues.holding_time_in_minutes,

                    gas_price_used_for_price_calculation:
                        e.dataValues.gas_price_used_for_price_calculation,
                    price_factor_used_for_price_calculation:
                        e.dataValues.price_factor_used_for_price_calculation,
                    trac_in_base_currency_used_for_price_calculation:
                        e.dataValues.trac_in_base_currency_used_for_price_calculation,
                }));
            }
            break;
        }
        default:
            throw new Error(`Failed to find transaction hash for ${dataSetId} and origin ${origin}. Origin not valid.`);
        }
        return replicationInfo;
    }

    /**
     * Create SHA256 Hash of public part of one graph
     * @param dataset
     * @returns {string}
     */
    static calculateGraphPublicHash(dataset) {
        let sortedDataset = OtJsonUtilities.prepareDatasetForGeneratingGraphHash(dataset);
        if (!sortedDataset) {
            sortedDataset = Utilities.copyObject(dataset);
        }
        ImportUtilities.removeGraphPermissionedData(sortedDataset['@graph']);
        return `0x${sha3_256(JSON.stringify(sortedDataset['@graph']), null, 0)}`;
    }

    /**
     * Removes the data attribute from all permissioned data in a graph
     * @param graph
     * @returns {null}
     */
    static removeGraphPermissionedData(graph) {
        graph.forEach((object) => {
            ImportUtilities.removeObjectPermissionedData(object);
        });
    }

    /**
     * Removes the data attribute from one ot-json object's permissioned data
     * @param ot_object
     * @returns {null}
     */
    static removeObjectPermissionedData(ot_object) {
        if (!ot_object || !ot_object.properties) {
            return;
        }
        const permissionedDataObject = ot_object.properties.permissioned_data;
        if (permissionedDataObject) {
            delete permissionedDataObject.data;
        }
    }

    static sortStringifyDataset(dataset) {
        ImportUtilities.sortGraphRecursively(dataset['@graph']);
        return Utilities.sortedStringify(dataset);
    }

    /**
     * Sign dataset
     * @static
     */
    static signDataset(dataset, blockchain_data) {
        let sortedDataset = OtJsonUtilities.prepareDatasetForGeneratingSignature(dataset);
        if (!sortedDataset) {
            sortedDataset = Utilities.copyObject(dataset);
        }
        ImportUtilities.removeGraphPermissionedData(sortedDataset['@graph']);

        const dataIntegrityService = DataIntegrityResolver.getInstance().resolve();
        dataset.signature = [];

        if (Array.isArray(blockchain_data)) {
            for (const elem of blockchain_data) {
                const { node_private_key: privKey, blockchain_id } = elem;
                const signature = dataIntegrityService.sign(
                    JSON.stringify(sortedDataset),
                    Utilities.normalizeHex(privKey),
                );

                dataset.signature.push({
                    type: signature.type,
                    proofPurpose: 'assertionMethod',
                    created: (new Date(Date.now())).toISOString(),
                    domain: blockchain_id,
                    proofValue: signature.signature,
                });
            }

            dataset.signature.sort((a, b) => a.domain.localeCompare(b.domain));
        } else {
            throw new Error('Cannot generate signature with given blockchain structure');
        }

        return dataset;
    }

    static extractDatasetSigners(dataset) {
        const signers = [];
        if (dataset && Array.isArray(dataset.signature) && dataset.signature.length > 0) {
            for (const proof of dataset.signature) {
                const wallet =
                    ImportUtilities.extractDatasetSignerUsingProof(dataset, proof.proofValue);
                const { domain: blockchain_id } = proof;

                signers.push({
                    blockchain_id,
                    wallet: Utilities.normalizeHex(wallet),
                });
            }
        }

        return signers;
    }

    static extractDatasetSignerUsingProof(dataset, signature) {
        let sortedDataset = OtJsonUtilities.prepareDatasetForGeneratingSignature(dataset);
        if (!sortedDataset) {
            sortedDataset = Utilities.copyObject(dataset);
        }
        ImportUtilities.removeGraphPermissionedData(sortedDataset['@graph']);
        delete sortedDataset.signature;

        const dataIntegrityService = DataIntegrityResolver.getInstance().resolve();
        return dataIntegrityService.recover(
            JSON.stringify(sortedDataset),
            signature,
        );
    }

    /**
     * Fill in dataset header
     * @private
     */
    static createDatasetHeader(
        config,
        transpilationInfo = null,
        blockchain,
        datasetTags = [],
        datasetTitle = '',
        datasetDescription = '',
        OTJSONVersion = '1.2',
        datasetCreationTimestamp = new Date().toISOString(),
    ) {
        const dataCreatorIdentifiers = [];
        const dataIntegrityProofs = [];
        const validationSchemas = {};
        for (const implementation of blockchain) {
            dataCreatorIdentifiers.push({
                identifierValue: implementation.identity,
                identifierType: 'ERC725',
                validationSchema: `/schemas/erc725-main/${implementation.blockchain_id}`,
                // todo support other identifier types
            });
            validationSchemas[`erc725-main/${implementation.blockchain_id}`] = {
                schemaType: 'ethereum-725',
                networkId: implementation.blockchain_id,
            };

            dataIntegrityProofs.push({
                proofValue: '',
                proofType: 'merkleRootHash',
                validationSchema: `/schemas/merkleRoot/${implementation.blockchain_id}`,
            });
            validationSchemas[`merkleRoot/${implementation.blockchain_id}`] = {
                schemaType: 'merkle-root',
                networkId: implementation.blockchain_id,
                hubContractAddress: implementation.hub_contract_address,
            };
        }

        const header = {
            OTJSONVersion,
            datasetCreationTimestamp,
            datasetTitle,
            datasetDescription,
            datasetTags,
            /*
            relatedDatasets may contain objects like this:
            {
                datasetId: '0x620867dced3a96809fc69d579b2684a7',
                relationType: 'UPDATED',
                relationDescription: 'Some long description',
                relationDirection: 'direct',
            }
             */
            relatedDatasets: [],
            validationSchemas,
            dataIntegrity: {
                proofs: dataIntegrityProofs,
            },
            dataCreator: {
                identifiers: dataCreatorIdentifiers,
            },
        };

        if (transpilationInfo) {
            header.transpilationInfo = transpilationInfo;
        }

        return header;
    }

    static attachDatasetRootHash(datasetHeader, rootHash, proofType = 'merkleRootHash') {
        for (const proofObject of datasetHeader.dataIntegrity.proofs) {
            if (proofObject.proofType === proofType) {
                proofObject.proofValue = rootHash;
            }
        }
    }

    /**
     * Extract Dataset creator identifier values from OT-JSON or graph header
     * @static
     * @param datasetHeader Header of the dataset in which the dataCreator field exists
     * @returns String - Dataset creator identifier value (Currently ERC725 Identity)
     */
    static getDataCreatorIdentifiers(datasetHeader) {
        return datasetHeader.dataCreator.identifiers;
    }

    static extractDatasetIdentities(datasetHeader) {
        if (!datasetHeader || !datasetHeader.dataCreator.identifiers
            || !datasetHeader.validationSchemas
            || !Array.isArray(datasetHeader.dataCreator.identifiers)
            || datasetHeader.dataCreator.identifiers.length < 1) {
            return;
        }
        const identities = [];

        for (const identifierObject of datasetHeader.dataCreator.identifiers) {
            const validationSchemaName = identifierObject.validationSchema.replace('/schemas/', '');

            const validationSchema =
                datasetHeader.validationSchemas[validationSchemaName];

            // Added to overwrite the previous ambiguous blockchain_id of Ethereum
            let blockchain_id;
            if (validationSchema.networkId === 'mainnet' ||
                validationSchema.networkId === 'rinkeby') {
                blockchain_id = defaultConfig.blockchain.implementations[0].network_id;
            } else {
                blockchain_id = validationSchema.networkId;
            }

            identities.push({
                blockchain_id,
                identity: identifierObject.identifierValue,
            });
        }

        return identities;
    }

    /**
     * Process successfull import
     * @static
     * @param unpack  Unpack keys
     * @param objects  Graph vertices and edges
     * @return {Promise<>}
     */
    static unpackKeysAndSortVertices(objects, unpack = false) {
        let {
            vertices, edges,
        } = objects;
        if (unpack) {
            ImportUtilities.unpackKeys(vertices, edges);
        }

        edges = Graph.sortVertices(edges);
        vertices = Graph.sortVertices(vertices);

        return {
            vertices,
            edges,
        };
    }

    static async createDocumentGraph(vertices, edges) {
        const documentGraph = [];
        vertices.filter(vertex => (vertex.vertexType === data_constants.vertexType.entityObject))
            .forEach((entityVertex) => {
                const otObject = {
                    '@type': data_constants.objectType.otObject,
                    '@id': entityVertex.uid,
                    identifiers: [],
                    relations: [],
                };

                // Check for identifiers.
                // Relation 'IDENTIFIES' goes form identifierVertex to entityVertex.
                edges.filter(edge =>
                    (edge.edgeType === data_constants.edgeType.identifierRelation &&
                    edge._to === entityVertex._key))
                    .forEach((edge) => {
                        vertices.filter(vertices => vertices._key === edge._from)
                            .forEach((identityVertex) => {
                                if (otObject.identifiers == null) {
                                    otObject.identifiers = [];
                                }

                                if (edge.autogenerated != null) {
                                    otObject.identifiers.push({
                                        '@type': identityVertex.identifierType,
                                        '@value': identityVertex.identifierValue,
                                        autogenerated: edge.autogenerated,
                                    });
                                } else {
                                    otObject.identifiers.push({
                                        '@type': identityVertex.identifierType,
                                        '@value': identityVertex.identifierValue,
                                    });
                                }
                            });
                    });
                // Check for properties.
                // Relation 'HAS_DATA' goes from entityVertex to dataVertex.
                edges.filter(edge => (edge.edgeType === data_constants.edgeType.dataRelation
                    && edge._from === entityVertex._key))
                    .forEach((edge) => {
                        vertices.filter(vertices => vertices._key === edge._to)
                            .forEach((dataVertex) => {
                                otObject.properties = Utilities.copyObject(dataVertex.data);
                            });
                    });
                // Check for relations.
                edges.filter(edge => (edge.edgeType === data_constants.edgeType.otRelation
                    && edge._from === entityVertex._key))
                    .forEach((edge) => {
                        if (otObject.relations == null) {
                            otObject.relations = [];
                        }

                        // Find original vertex to get the @id.
                        const id = (vertices.filter(vertex => vertex._key === edge._to)[0]).uid;

                        otObject.relations.push({
                            '@type': data_constants.edgeType.otRelation,
                            direction: 'direct', // TODO: check this.
                            relationType: edge.relationType,
                            linkedObject: {
                                '@id': id,
                            },
                            properties: edge.properties,
                        });
                    });
                documentGraph.push(otObject);
            });

        vertices.filter(vertex => vertex.vertexType === data_constants.vertexType.connector)
            .forEach((connectorVertex) => {
                const otConnector = {
                    '@type': data_constants.objectType.otConnector,
                    '@id': connectorVertex.uid,
                };

                edges.filter(edge =>
                    (edge.edgeType === data_constants.edgeType.identifierRelation &&
                    edge._to === connectorVertex._key))
                    .forEach((edge) => {
                        vertices.filter(vertices => vertices._key === edge._from)
                            .forEach((identityVertex) => {
                                if (otConnector.identifiers == null) {
                                    otConnector.identifiers = [];
                                }

                                if (edge.autogenerated != null) {
                                    otConnector.identifiers.push({
                                        '@type': identityVertex.identifierType,
                                        '@value': identityVertex.identifierValue,
                                        autogenerated: edge.autogenerated,
                                    });
                                } else {
                                    otConnector.identifiers.push({
                                        '@type': identityVertex.identifierType,
                                        '@value': identityVertex.identifierValue,
                                    });
                                }
                            });
                    });
                // Check for properties.
                // Relation 'HAS_DATA' goes from entityVertex to dataVertex.
                edges.filter(edge => (edge.edgeType === data_constants.edgeType.dataRelation
                    && edge._from === connectorVertex._key))
                    .forEach((edge) => {
                        vertices.filter(vertices => vertices._key === edge._to)
                            .forEach((dataVertex) => {
                                otConnector.properties = Utilities.copyObject(dataVertex.data);
                            });
                    });
                // Check for relations.
                edges.filter(edge => (edge.edgeType === data_constants.edgeType.otRelation
                    && edge._from === connectorVertex._key))
                    .forEach((edge) => {
                        if (otConnector.relations == null) {
                            otConnector.relations = [];
                        }

                        // Find original vertex to get the @id.
                        const id = (vertices.filter(vertex => vertex._key === edge._to)[0]).uid;

                        otConnector.relations.push({
                            '@type': data_constants.edgeType.otRelation,
                            direction: 'direct', // TODO: check this.
                            relationType: edge.relationType,
                            linkedObject: {
                                '@id': id,
                            },
                            properties: edge.properties,
                        });
                    });

                documentGraph.push(otConnector);
            });

        return documentGraph;
    }
}

module.exports = ImportUtilities;
