const { sha3_256 } = require('js-sha3');
const Utilities = require('../Utilities');
const ImportUtilities = require('../ImportUtilities');

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
        document, encryptedMap,
    } = JSON.parse(dataFromParent);

    try {
        const datasetId = _id(document);
        const dataCreator = ImportUtilities.getDataCreator(document.datasetHeader);

        // Result
        const vertices = [];
        const edges = [];

        document['@graph'].forEach((otObject) => {
            switch (_type(otObject)) {
            case constants.objectType.otObject: {
                // Create entity vertex.
                const entityVertex = {};
                entityVertex._key = Utilities.keyFrom(dataCreator, _id(otObject));
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
                            _key: Utilities.keyFrom(_type(identifier), _value(identifier)),
                            identifierType: _type(identifier),
                            identifierValue: _value(identifier),
                            vertexType: constants.vertexType.identifier,
                            datasets: [datasetId],
                        };
                        vertices.push(identifierVertex);

                        // Add identity edge.
                        const identifyEdge = {
                            _key: Utilities.keyFrom(
                                dataCreator,
                                identifierVertex._key,
                                entityVertex._key,
                            ),
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
                            _key: Utilities.keyFrom(
                                dataCreator,
                                entityVertex._key,
                                identifierVertex._key,
                            ),
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
                        _key:
                            Utilities.keyFrom(dataCreator, Utilities.keyFrom(otObject.properties)),
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
                        _key: Utilities.keyFrom(dataCreator, entityVertex._key, dataVertex._key),
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
                        relationEdge._to =
                            Utilities.keyFrom(dataCreator, _id(relation.linkedObject));
                        relationEdge.edgeType = constants.edgeType.otRelation;
                        relationEdge.relationType = relation.relationType;
                        relationEdge._key = Utilities.keyFrom(
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
                    _key: Utilities.keyFrom(dataCreator, _id(otObject)),
                    uid: _id(otObject),
                    vertexType: constants.vertexType.connector,
                    objectType: constants.objectType.otConnector,
                    datasets: [datasetId],
                };

                vertices.push(connectorVertex);

                if (otObject.identifiers != null) {
                    otObject.identifiers.forEach((identifier) => {
                        // TODO: check for duplicates here.
                        // TODO: see what with autogenerated here?
                        const identifierVertex = {
                            _key: Utilities.keyFrom(
                                _type(identifier),
                                _value(identifier),
                            ),
                            identifierType: _type(identifier),
                            identifierValue: _value(identifier),
                            vertexType: constants.vertexType.identifier,
                            datasets: [datasetId],
                        };
                        vertices.push(identifierVertex);

                        // Add identity edge.
                        const identifyEdge = {
                            _key: Utilities.keyFrom(
                                dataCreator,
                                identifierVertex._key,
                                connectorVertex._key,
                            ),
                            _from: identifierVertex._key,
                            _to: connectorVertex._key,
                            relationType: constants.relationType.identifies,
                            edgeType: constants.edgeType.identifierRelation,
                            datasets: [datasetId],
                        };
                        if (identifier.autogenerated != null) {
                            identifyEdge.autogenerated = identifier.autogenerated;
                        }
                        edges.push(identifyEdge);

                        const identifiedByEdge = {
                            _key: Utilities.keyFrom(
                                dataCreator,
                                connectorVertex._key,
                                identifierVertex._key,
                            ),
                            _from: connectorVertex._key,
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
                        _key: Utilities.keyFrom(
                            dataCreator,
                            Utilities.keyFrom(otObject.properties),
                        ),
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
                        _key: Utilities.keyFrom(
                            dataCreator,
                            connectorVertex._key,
                            dataVertex._key,
                        ),
                        _from: connectorVertex._key,
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
                        relationEdge._from = connectorVertex._key;
                        relationEdge._to =
                            Utilities.keyFrom(dataCreator, _id(relation.linkedObject));
                        relationEdge._key =
                                Utilities.keyFrom(
                                    dataCreator,
                                    relationEdge._from, relationEdge._to,
                                );
                        relationEdge.edgeType = constants.edgeType.otRelation;
                        relationEdge.relationType = relation.relationType;
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
            vertices: deduplicateVertices.reduce((acc, current) => {
                if (!acc.includes(current._key)) {
                    acc.push(current._key);
                }
                return acc;
            }, []),
            edges: deduplicateEdges.reduce((acc, current) => {
                if (!acc.includes(current._key)) {
                    acc.push(current._key);
                }
                return acc;
            }, []),
        };

        const total_documents = document['@graph'].length;
        const root_hash = document.datasetHeader.dataIntegrity.proofs[0].proofValue;

        const graphObject = {};
        Object.assign(graphObject, ImportUtilities.unpackKeysAndSortVertices({
            vertices: deduplicateVertices,
            edges: deduplicateEdges,
        }));
        const data_hash = Utilities.normalizeHex(sha3_256(`${graphObject}`));

        const response = {
            vertices: deduplicateVertices,
            edges: deduplicateEdges,
            metadata,
            datasetId,
            total_documents,
            root_hash,
            data_hash,
        };

        process.send(JSON.stringify(response), () => {
            process.exit(0);
        });
    } catch (e) {
        process.send({ error: e.message });
    }
});

process.once('SIGTERM', () => process.exit(0));
