const { sha3_256 } = require('js-sha3');

const Utilities = require('./Utilities');
const SchemaValidator = require('./validator/schema-validator');

// Helper functions.

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
 * Returns value of '@graph' property.
 * @param OT-JSON document object.
 * @return [Object]
 * @private
 */
function _graph(document) {
    return document['@graph'];
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
 * Validate that all related entities listed in the graph exist.
 * @param graph An array objects in the OT-JSON graph field.
 * @private
 */
function _validateRelatedEntities(graph) {
    const verticesIds = new Set();
    const relationsIds = new Set();

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < graph.length; i++) {
        verticesIds.add(_id(graph[i]));

        const { relations } = graph[i];
        if (relations == null) {
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-plusplus
        for (let j = 0; j < relations.length; j++) {
            relationsIds.add(relations[j].linkedObject['@id']);
        }
    }

    relationsIds.forEach((id) => {
        if (!verticesIds.has(id)) {
            throw Error('OT-JSON relations not valid');
        }
    });
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

/**
 *
 */
class OtJsonImporter {
    /**
     * Default constructor. Creates instance of otJsonImporter.
     * @param ctx IoC context
     */
    constructor(ctx) {
        this.log = ctx.logger;
        this.config = ctx.config;
        this.notifyError = ctx.notifyError;

        // TODO: use creditor information from config.
        this.me = {
            dataCreator: {
                identifiers: [
                    {
                        identifierValue: '0x00624f564D433Db4449Ee10Cdc2cCcdcf46beb68',
                        identifierType: 'ERC725',
                        validationSchema: '/schemas/erc725-main',
                    },
                ],
            },
        };
    }

    /**
     *
     * @param OT-JSON document in JSON-LD format.
     * @return {{
     * metadata: {
     *  datasetHeader: *, vertices: *, edges: *, _key: string},
     * vertices: Array,
     * dataCreator: string
     * edges: Array}}
     */
    process(document) {
        // TODO: validate document here.
        this._validate(document);

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

                // Add data vertex.
                if (otObject.properties != null) {
                    const dataVertex = {
                        _key: _keyFrom(dataCreator, _keyFrom(otObject.properties)),
                        vertexType: constants.vertexType.data,
                        data: otObject.properties,
                        datasets: [datasetId],
                    };
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

        const metadata = {
            _key: datasetId,
            // datasetContext: _context(document),
            datasetHeader: document.datasetHeader,
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

        // TODO: Check for datasetHeader.dataIntegrity.* proof here.

        return {
            metadata,
            dataCreator,
            vertices,
            edges,
        };
    }

    /**
     * Validates the OT-JSON document's metadata to be in valid OT-JSON format.
     * @param document OT-JSON document.
     * @private
     */
    _validate(document) {
        // Test root level of the document.
        // Expected:
        // {
        //     @id: '',
        //     @type: 'Dataset',
        //     datasetHeader: {},
        //     @graph: []
        // }

        if (document == null) {
            throw Error('Document cannot be null.');
        }

        if (typeof document !== 'object') {
            throw Error('Document has to be object.');
        }

        if (Object.keys(document).length !== 4) {
            throw Error('Lack of additional information in OT-JSON document.');
        }

        const datasetId = _id(document);
        const datasetType = _type(document);
        const { datasetHeader } = document;
        const graph = _graph(document);

        if (typeof datasetId !== 'string') {
            throw Error('Wrong format of dataset ID');
        }

        if (datasetType !== 'Dataset') {
            throw Error('Unsupported dataset type.');
        }

        if (graph == null || !Array.isArray(graph) || graph.length === 0) {
            throw Error('Missing or empty graph.');
        }

        // TODO: Prepare support for multiple versions
        const { OTJSONVersion } = datasetHeader;
        if (OTJSONVersion !== '1.0') {
            throw Error('Unsupported OT-JSON version.');
        }

        const { datasetCreationTimestamp } = datasetHeader;
        if (datasetCreationTimestamp == null &&
            !Number.isNaN(Date.parse(datasetHeader.datasetCreationTimestamp))) {
            throw Error('Invalid creation date.');
        }

        const { dataCreator } = datasetHeader;
        if (dataCreator == null || dataCreator.identifiers == null) {
            throw Error('Data creator is missing.');
        }

        const { identifiers } = dataCreator;
        if (!Array.isArray(identifiers) || identifiers.length !== 1) {
            throw Error('Unexpected format of data creator.');
        }

        // Data creator identifier must contain ERC725 and the proper schema
        const ERCIdentifier = identifiers.find(identifierObject => (
            identifierObject.identifierType === 'ERC725'
        ));
        if (ERCIdentifier == null || typeof ERCIdentifier !== 'object' ||
            ERCIdentifier.validationSchema !== '/schemas/erc725-main' ||
            !Utilities.isHexStrict(ERCIdentifier.identifierValue)) {
            throw Error('Wrong format of data creator.');
        }
        SchemaValidator.validateSchema(ERCIdentifier.validationSchema);

        _validateRelatedEntities(graph);
    }
}

module.exports = OtJsonImporter;
