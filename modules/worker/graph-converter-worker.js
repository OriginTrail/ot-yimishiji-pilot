const { sha3_256 } = require('js-sha3');
const Utilities = require('../Utilities');

/**
 * Returns value of '@id' property.
 * @param jsonLdObject JSON-LD object.
 * @return {string}
 * @private
 */
function _id(jsonLdObject) {
    return jsonLdObject['@id'];
}

/**
 * Returns value of '@type' property.
 * @param jsonLdObject JSON-LD object.
 * @return {string}
 * @private
 */
function _type(jsonLdObject) {
    return jsonLdObject['@type'];
}

/**
 * Returns value of '@value' property.
 * @param jsonLdObject JSON-LD object.
 * @return {string}
 * @private
 */
function _value(jsonLdObject) {
    return jsonLdObject['@value'];
}

/**
 * Calculate SHA3 from input objects and return normalized hex string.
 * @param rest An array of input data concatenated before calculating the hash.
 * @return {string} Normalized hash string.
 * @private
 */
function _keyFrom(...rest) {
    return Utilities.normalizeHex(sha3_256([...rest].reduce(
        (acc, argument) => {
            acc += Utilities.stringify(argument, 0);
            return acc;
        },
        '',
    )));
}

/**
 * Constants used in graph creation.
 * @type {{
 * relationType: {
 *  identifies: string, hasData: string, identifiedBy: string, connectionDownstream: string},
 *  vertexType: {
 *  entityObject: string, identifier: string, data: string, connector: string},
 * edgeType: {
 *  connectorRelation: string, dataRelation: string, otRelation: string,
 *  identifierRelation: string},
 * objectType: {
 *  otConnector: string, otObject: string}}}
 */
const constants = {
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
Object.freeze(constants);

process.on('message', async (dataFromParent) => {
    const {
        document, encryptedMap, wallet, handler_id,
    } = JSON.parse(dataFromParent);

    const datasetId = _id(document);
    const header = document.datasetHeader;
    const dataCreator = document.datasetHeader.dataCreator.identifiers[0].identifierValue;

    // Result
    const vertices = [];
    const edges = [];

    document['@graph'].forEach((otObject) => {
        switch (_type(otObject)) {
        case constants.objectType.otObject: {
            // Create entity vertex.
            const entityVertex = {};
            entityVertex._key = _keyFrom(dataCreator, _id(otObject));
            entityVertex.uid = _id(otObject);
            entityVertex.vertexType = constants.vertexType.entityObject;
            // TODO: videti sa aleksom da li ide .data.objectType
            entityVertex.objectType = constants.objectType.otObject;
            entityVertex.datasets = [datasetId];

            vertices.push(entityVertex);

            // Add identifiers.
            if (otObject.identifiers != null) {
                otObject.identifiers.forEach((identifier) => {
                    // TODO: check for duplicates here.
                    // TODO: see what with autogenerated here?
                    const identifierVertex = {
                        _key: _keyFrom(_type(identifier), _value(identifier)),
                        identifierType: _type(identifier),
                        identifierValue: _value(identifier),
                        vertexType: constants.vertexType.identifier,
                        datasets: [datasetId],
                    };
                    vertices.push(identifierVertex);

                    // Add identity edge.
                    const identifyEdge = {
                        _key: _keyFrom(dataCreator, identifierVertex._key, entityVertex._key),
                        _from: identifierVertex._key,
                        _to: entityVertex._key,
                        relationType: constants.relationType.identifies,
                        edgeType: constants.edgeType.identifierRelation,
                        datasets: [datasetId],
                    };
                    if (identifier.autogenerated != null) {
                        identifyEdge.autogenerated = identifier.autogenerated;
                    }
                    edges.push(identifyEdge);

                    const identifiedByEdge = {
                        _key: _keyFrom(dataCreator, entityVertex._key, identifierVertex._key),
                        _from: entityVertex._key,
                        _to: identifierVertex._key,
                        relationType: constants.relationType.identifiedBy,
                        edgeType: constants.edgeType.identifierRelation,
                        datasets: [datasetId],
                    };
                    if (identifier.autogenerated != null) {
                        identifiedByEdge.autogenerated = identifier.autogenerated;
                    }
                    edges.push(identifiedByEdge);
                });
            }

            // Add data vertex.
            if (otObject.properties != null) {
                const dataVertex = {
                    _key: _keyFrom(dataCreator, _keyFrom(otObject.properties)),
                    vertexType: constants.vertexType.data,
                    data: otObject.properties,
                    datasets: [datasetId],
                };
                if (encryptedMap && encryptedMap.objects &&
                        encryptedMap.objects[_id(otObject)]) {
                    dataVertex.encrypted = encryptedMap.objects[_id(otObject)];
                }
                vertices.push(dataVertex);

                // Add has-data edge.
                const hasDataEdge = {
                    _key: _keyFrom(dataCreator, entityVertex._key, dataVertex._key),
                    _from: entityVertex._key,
                    _to: dataVertex._key,
                    edgeType: constants.edgeType.dataRelation,
                    relationType: constants.relationType.hasData,
                    datasets: [datasetId],
                };
                edges.push(hasDataEdge);
            }

            // Add relations edges.
            if (otObject.relations != null) {
                otObject.relations.forEach((relation) => {
                    const relationEdge = {};
                    relationEdge._from = entityVertex._key;
                    relationEdge._to = _keyFrom(dataCreator, _id(relation.linkedObject));
                    relationEdge.edgeType = constants.edgeType.otRelation;
                    relationEdge.relationType = relation.properties.relationType;
                    relationEdge._key = _keyFrom(
                        dataCreator,
                        relationEdge._from,
                        relationEdge._to,
                        relationEdge.relationType,
                    );
                    relationEdge.properties = relation.properties;
                    relationEdge.datasets = [datasetId];
                    if (encryptedMap && encryptedMap.relations &&
                            encryptedMap.relations[_id(otObject)]) {
                        const relationKey = sha3_256(Utilities.stringify(relation, 0));
                        relationEdge.encrypted =
                                encryptedMap.relations[_id(otObject)][relationKey];
                    }
                    edges.push(relationEdge);
                });
            }
        }
            break;
        case constants.objectType.otConnector: {
            // Create connector vertex.
            const connectorVertex = {
                _key: _keyFrom(dataCreator, _id(otObject)),
                uid: _id(otObject),
                connectionId: otObject.connectionId,
                vertexType: constants.vertexType.connector,
                objectType: constants.objectType.otConnector,
                datasets: [datasetId],
            };
            if (otObject.expectedConnectionCreators != null) {
                connectorVertex.expectedConnectionCreators =
                        otObject.expectedConnectionCreators;
            }

            vertices.push(connectorVertex);

            // Add relations edges.
            if (otObject.relations != null) {
                otObject.relations.forEach((relation) => {
                    const relationEdge = {};
                    relationEdge._from = connectorVertex._key;
                    relationEdge._to = _keyFrom(dataCreator, _id(relation.linkedObject));
                    relationEdge._key =
                            _keyFrom(dataCreator, relationEdge._from, relationEdge._to);
                    relationEdge.edgeType = constants.edgeType.otRelation;
                    relationEdge.relationType = relation.properties.relationType;
                    relationEdge.properties = relation.properties;
                    relationEdge.datasets = [datasetId];
                    edges.push(relationEdge);
                });
            }
        }
            break;
        default:
            throw Error('Unexpected vertex type in @graph.');
        }
    });

    const deduplicateVertices = [];
    const deduplicateEdges = [];

    for (const vertex of vertices) {
        const obj = deduplicateVertices.find(el => el._key === vertex._key);

        if (obj == null) {
            deduplicateVertices.push(vertex);
        }
    }

    for (const edge of edges) {
        const obj = deduplicateEdges.find(el => el._key === edge._key);

        if (obj == null) {
            deduplicateEdges.push(edge);
        }
    }

    const metadata = {
        _key: datasetId,
        // datasetContext: _context(data),
        datasetHeader: document.datasetHeader,
        signature: document.signature,
        vertices: vertices.reduce((acc, current) => {
            if (!acc.includes(current._key)) {
                acc.push(current._key);
            }
            return acc;
        }, []),
        edges: edges.reduce((acc, current) => {
            if (!acc.includes(current._key)) {
                acc.push(current._key);
            }
            return acc;
        }, []),
    };

    const total_documents = document['@graph'].length;
    const root_hash = document.datasetHeader.dataIntegrity.proofs[0].proofValue;

    const response = {
        vertices,
        edges,
        metadata,
        datasetId,
        header,
        dataCreator,
        wallet,
        total_documents,
        root_hash,
        deduplicateEdges,
        deduplicateVertices,
        handler_id,
    };
    process.send(JSON.stringify(response), () => {
        process.exit(0);
    });
});

process.once('SIGTERM', () => process.exit(0));