const { Database } = require('arangojs');
const request = require('superagent');
const Utilities = require('../Utilities');
const { normalizeGraph } = require('./graph-converter');
const ArangoClient = require('./arango-client');

const IGNORE_DOUBLE_INSERT = true;

class ArangoJS {
    /**
     * Creates new object connected with ArangoDB database,
     * with connection data found in system database
     * @constructor
     * @param {string} - username
     * @param {string} - password
     * @param {string} - database
     * @param {string} - host
     * @param {number} - port
     */
    constructor(selectedDatabase, log) {
        this.log = log;
        this.db = new Database(`http://${selectedDatabase.host}:${selectedDatabase.port}`);
        this.db.useDatabase(selectedDatabase.database);
        this.db.useBasicAuth(selectedDatabase.username, selectedDatabase.password);

        this.dbInfo = {
            username: selectedDatabase.username,
            password: selectedDatabase.password,
            database: selectedDatabase.database,
            host: selectedDatabase.host,
            port: selectedDatabase.port,
        };

        this.arangoClient = new ArangoClient(selectedDatabase, log);
    }

    async startReplication() {
        // get replication state
        let stateResponse = await this.arangoClient.getReplicationApplierState();

        if (!stateResponse.state.running) {
            this.log.trace('Applier is not running state.');
            this.log.trace('Setting applier configuration.');
            await this.arangoClient.setupReplicationApplierConfiguration();
            this.log.trace('Setting applier configuration finalized successfully.');
            this.log.trace('Starting applier replication...');
            await this.arangoClient.startReplicationApplier();
            // in order to get right message we need to wait 2 sec
            await Utilities.sleepForMilliseconds(2000);
            stateResponse = await this.arangoClient.getReplicationApplierState();
            this.log.trace(`Applier in running state message: ${stateResponse.state.progress.message}`);
        } else {
            this.log.trace(`Applier in running state message: ${stateResponse.state.progress.message}`);
        }
    }

    async stopReplication() {
        const applierResponse = await this.arangoClient.stopReplicationApplier();
        if (!applierResponse.state.running) {
            this.log.trace(`Applier successfully stopped: ${applierResponse.state.progress.message}`);
        } else {
            this.log.error('Something went wrong. Unable to stop applier');
        }
    }

    async getReplicationApplierState() {
        const response = await this.arangoClient.getReplicationApplierState();
        return response;
    }

    /**
     * Initialize database
     * @return {Promise<void>}
     */
    async initialize() {
        this.db.useDatabase(this.dbInfo.database);
        await this.createCollection('ot_datasets');
        await this.createCollection('ot_vertices');
        await this.createEdgeCollection('ot_edges');
    }

    /**
     * Find set of documents with _key, vertex_type and identifiers values
     * @param queryObject       Query for getting documents
     * @returns {Promise<any>}
     */
    async findDocuments(collectionName, queryObject) {
        let queryString = `FOR v IN ${collectionName} `;
        const params = {};
        if (Utilities.isEmptyObject(queryObject) === false) {
            queryString += 'FILTER ';

            let count = 1;
            const filters = [];
            for (const key in queryObject) {
                if (key.match(/^[\w\d]+$/g) !== null) {
                    const searchKey = key;
                    const param = `param${count}`;
                    filters.push(`v.${searchKey} == @param${count}`);

                    count += 1;
                    params[param] = queryObject[key];
                }
            }
            queryString += filters.join(' AND ');
        }
        queryString += ' RETURN v';
        return this.runQuery(queryString, params);
    }


    /**
     * Find set of documents with _key, vertex_type and identifiers values
     * @param queryObject       Query for getting documents
     * @returns {Promise<any>}
     */
    async findConnectors(objectKey) {
        const queryString = `LET identifier = (
                                RETURN document('ot_vertices', @objectKey)
                            )
                                                        
                            LET otConnector = (
                                FOR v, e IN 1..1 OUTBOUND identifier[0] ot_edges
                                FILTER e.edgeType IN ['IdentifierRelation']
                                    AND e.datasets != null
                                    AND v.datasets != null
                                RETURN v
                            )
                            
                                FOR c in otConnector
                                FOR v, e IN 1..1 OUTBOUND c ot_edges
                                FILTER e.edgeType IN ['dataRelation']
                                    AND e.datasets != null
                                    AND v.datasets != null
                                RETURN {"_key":c._key, "expectedConnectionCreators":v.data.expectedConnectionCreators, "datasets": c.datasets  }`;

        const result = await this.runQuery(queryString, { objectKey });

        return result;
    }

    /**
     * Finds imports IDs based on data location query
     *
     * DataLocationQuery structure: [[path, value, opcode]*]
     *
     * @param {?number} encColor - Encrypted color (0=RED,1=GREEN,2=BLUE)
     * @param {object} dataLocationQuery - Search query
     * @return {Promise}
     */
    async findImportIds(dataLocationQuery, encColor = null) {
        const queryResult = await this.dataLocationQuery(dataLocationQuery, encColor);

        let result = [];
        queryResult.forEach((item) => {
            const { datasets } = item;
            result = result.concat(datasets.filter(x => result.indexOf(x) < 0));
        });

        return result;
    }

    async findTrail(queryObject) {
        const {
            identifierKeys,
            depth,
            connectionTypes,
        } = queryObject;

        const {
            uniqueIdentifiers,
            includedConnectionTypes,
            excludedConnectionTypes,
        } = queryObject;

        const queryParams = {
            depth,
        };

        let includedEdgeTypes;
        const excludedEdgeTypes = excludedConnectionTypes;

        let queryString = '';
        if (identifierKeys) {
            queryString = `// Get identifier
                            LET identifierObjects = TO_ARRAY(DOCUMENT('ot_vertices', @identifierKeys))
                            
                            // Fetch the start entity for trail
                            LET startObjects = UNIQUE(FLATTEN(
                                FOR identifierObject IN identifierObjects
                                    FILTER identifierObject != null
                                    LET identifiedObject = (
                                    FOR v, e IN 1..1 OUTBOUND identifierObject ot_edges
                                    FILTER e.edgeType == 'IdentifierRelation'
                                    RETURN v
                                    )
                                RETURN identifiedObject
                            ))
                             
                            LET trailObjects = (
                                FILTER startObjects[0] != null
                                FOR v, e, p IN 0..@depth ANY startObjects[0] ot_edges`;
            queryParams.identifierKeys = identifierKeys;
            includedEdgeTypes = connectionTypes;
        } else {
            queryString = `// Get identifier
                            LET startObjects = FLATTEN([DOCUMENT('ot_vertices', @uniqueIdentifiers)])
                             
                            LET trailObjects = FLATTEN(
                                FOR startObject in startObjects
                                    FILTER startObject != null
                                    FOR v, e, p IN 0..@depth ANY startObject ot_edges`;
            queryParams.uniqueIdentifiers = uniqueIdentifiers;
            includedEdgeTypes = includedConnectionTypes;
        }
        if ((Array.isArray(includedEdgeTypes) && includedEdgeTypes.length > 0) ||
            (Array.isArray(excludedEdgeTypes) && excludedEdgeTypes.length > 0)) {
            queryString += `
                                    PRUNE (LENGTH(p.edges) == 2 && p.edges[-1].relationType == p.edges[-2].relationType) || (LENGTH(p.edges) > 2 && p.edges[-1].relationType == p.edges[-2].relationType && p.edges[-3].relationType != 'CONNECTOR_FOR')
                                    OPTIONS {
                                        bfs: true,
                                        uniqueVertices: 'global',
                                        uniqueEdges: 'path'
                                    }
                                    FILTER (
                                        ((LENGTH(p.edges) < 2) == true) ||
                                        ((p.edges[-1].relationType != p.edges[-2].relationType) == true) ||
                                        ((p.edges[-3].relationType == 'CONNECTOR_FOR') == true)
                                        ) == true`;

            if (Array.isArray(includedEdgeTypes) && includedEdgeTypes.length > 0) {
                queryString += `
                FILTER p.edges[*].relationType ALL in @includedEdgeTypes
                `;
                queryParams.includedEdgeTypes = includedEdgeTypes;
            }
            if (Array.isArray(excludedEdgeTypes) && excludedEdgeTypes.length > 0) {
                queryString += `
                FILTER p.edges[*].relationType ALL not in @excludedEdgeTypes
                `;
                queryParams.excludedEdgeTypes = excludedEdgeTypes;
            }
        } else {
            queryString += `
                                OPTIONS {
                                    bfs: true,
                                        uniqueVertices: 'global',
                                        uniqueEdges: 'path'
                                }`;
        }
        queryString += `
                                RETURN DISTINCT v
                            )
                            
                            FOR trailObject in trailObjects
                                FILTER trailObject != null
                                LET objectsRelated = (
                                    FOR v, e in 1..1 OUTBOUND trailObject ot_edges
                                        FILTER e.edgeType IN ['IdentifierRelation','dataRelation','otRelation']
                                        AND e.datasets != null
                                        AND v.datasets != null
                                        AND LENGTH(INTERSECTION(e.datasets, v.datasets, trailObject.datasets)) > 0
                                        RETURN  {
                                        "vertex": v,
                                        "edge": e
                                        }
                                    )
                                RETURN {
                                    "rootObject": trailObject,
                                    "relatedObjects": objectsRelated
                                }`;

        const result = await this.runQuery(queryString, queryParams);
        return result;
    }

    async lookupTrail(queryObject) {
        const {
            identifierKeys,
            opcode,
        } = queryObject;

        const queryParams = {
            identifierKeys,
        };

        let queryString = 'LET identifierObjects = UNIQUE(FLATTEN([DOCUMENT(\'ot_vertices\', @identifierKeys)]))';
        if (opcode === 'EQ' && identifierKeys.length > 1) {
            queryString += `
                            let candidates = (FOR identifierObject IN identifierObjects
                                let identifiedObjects = 
                                    (FOR v, e IN 1..1 OUTBOUND identifierObject ot_edges
                                        FILTER e.edgeType == 'IdentifierRelation'
                                        return v)
                                return identifiedObjects
                            )
                            
                            filter LENGTH(candidates) > 1
                            
                            let startObjects = UNIQUE(APPLY("INTERSECTION",candidates))
                           `;
        } else {
            queryString += `
                            let startObjects = UNIQUE(FOR identifierObject IN identifierObjects
                                    FOR v, e IN 1..1 OUTBOUND identifierObject ot_edges
                                        FILTER e.edgeType == 'IdentifierRelation'
                                        return v
                            )
                           `;
        }
        queryString += `
                        for startObject in startObjects
                            let identifiers = (
                                FOR identifierVertex, identifierEdge IN 1..1 OUTBOUND startObject ot_edges
                                    FILTER identifierEdge.edgeType == 'IdentifierRelation'
                                    return {identifierType: identifierVertex.identifierType, identifierValue: identifierVertex.identifierValue }
                            )
                            let datasets = (
                                let datasets = DOCUMENT('ot_datasets', startObject.datasets)
                                for dataset in datasets
                                    return { dataset_id: dataset._key, metadata: {dataCreator: dataset.datasetHeader.dataCreator.identifiers, timestamp: dataset.datasetHeader.datasetCreationTimestamp}}
                            )
                            
                            RETURN {unique_identifier: startObject._key, datasets: datasets, identifiers: identifiers}
                            `;

        const result = await this.runQuery(queryString, queryParams);
        return result;
    }

    /**
     * Finds objects based on ids and datasets which contain them
     *
     * @param {Array} ids - Encrypted color (0=RED,1=GREEN,2=BLUE)
     * @param {object} datasets - Object which maps which datasets contain the requested object,
     *                              in the following format { id: [datasets] }
     * @return {Promise}
     */
    async findTrailExtension(ids, datasets) {
        const queryParams = {
            ids,
            datasets,
        };
        const queryString = `LET trailEntities = (
                                FOR entity IN ot_vertices
                                    FILTER entity.uid IN @ids
                                    AND LENGTH(INTERSECTION(entity.datasets, @datasets[entity.uid])) > 0
                                    RETURN entity
                            )
                            
                            FOR trailObject in trailEntities
                                FILTER trailObject != null
                                LET objectsRelated = (
                                    FOR v, e in 1..1 OUTBOUND trailObject ot_edges
                                        FILTER e.edgeType IN ['IdentifierRelation','dataRelation','otRelation']
                                        AND e.datasets != null
                                        AND v.datasets != null
                                        AND LENGTH(INTERSECTION(e.datasets, v.datasets, trailObject.datasets)) > 0
                                        RETURN  {
                                        "vertex": v,
                                        "edge": e
                                        }
                                    )
                                RETURN {
                                    "rootObject": trailObject,
                                    "relatedObjects": objectsRelated
                                }`;

        const result = await this.runQuery(queryString, queryParams);
        return result;
    }

    async findLocalQuery(queryObject) {
        const {
            identifierKeys,
        } = queryObject;

        const queryParams = {
            identifierKeys,
        };

        const queryString = `LET identifierObjects = TO_ARRAY(DOCUMENT('ot_vertices', @identifierKeys))
                            
                            let latestIdentifierObjects = (
                            FOR identifierObject in identifierObjects
                                FILTER identifierObject != null
                                let datasets = (
                                FOR dataset in identifierObject.datasets
                                    let d = DOCUMENT('ot_datasets', dataset)
                                    return { dataset, timestamp: d.datasetHeader.datasetCreationTimestamp}
                                )
                                
                                let latestDataset = (
                                FOR d IN datasets  
                                SORT d.timestamp DESC
                                LIMIT 1
                                RETURN d.dataset
                                )
                                
                                return {vertex: identifierObject, latestDataset: latestDataset[0] })
                            
                            // Fetch the start entity for trail
                            LET startObjects = UNIQUE(FLATTEN(
                                FOR identifierObject IN latestIdentifierObjects
                                    FILTER identifierObject.vertex != null
                                    LET identifiedObject = (
                                    FOR v, e IN 1..1 OUTBOUND identifierObject.vertex ot_edges
                                    FILTER e.edgeType == 'IdentifierRelation'
                                    and identifierObject.latestDataset in v.datasets
                                    RETURN v
                                    )
                                RETURN {vertex: identifiedObject[0], latestDataset: identifierObject.latestDataset }
                            ))
                            
                            FOR startObject in startObjects
                            FILTER startObject.vertex != null
                            let p = (FOR v, e in 1..1 OUTBOUND startObject.vertex ot_edges
                                FILTER e.edgeType IN ['IdentifierRelation','dataRelation','otRelation']
                                AND e.datasets != null
                                AND v.datasets != null
                                AND LENGTH(INTERSECTION(e.datasets, v.datasets, startObject.vertex.datasets)) > 0
                                RETURN  {
                                    "vertex": v,
                                    "edge": e
                                    })
                            return {
                                "rootObject": startObject,
                                "relatedObjects": p
                                }`;

        const result = await this.runQuery(queryString, queryParams);
        return result;
    }


    async getConsensusEvents(sender_id) {
        const query = `FOR v IN ot_vertices
                       FILTER v.vertexType == 'Data'
                       AND v.data.objectType='ObjectEvent'
                       AND v.senderId == @sender_id
                       AND v.encrypted == null
                       RETURN v`;

        const res = await this.runQuery(query, {
            sender_id,
        });

        const ownershipEvents = [];

        for (const event of res) {
            for (const key in event) {
                if (event[key].data) {
                    if (event[key].data.categories.indexOf('Ownership')) {
                        ownershipEvents.push({ side1: event });
                    }
                }
            }
        }

        const promises = [];

        for (const event of ownershipEvents) {
            const query = `FOR v, e IN 1..1 OUTBOUND @senderEventKey ot_edges
            FILTER e.edgeType == 'EVENT_CONNECTION'
            RETURN v`;
            promises.push(this.runQuery(query, { senderEventKey: `ot_vertices/${event.side1._key}` }));
        }

        const side2Vertices = await Promise.all(promises);

        for (const i in side2Vertices) {
            const side2Vertex = side2Vertices[i][0];
            ownershipEvents[i].side2 = side2Vertex;
        }

        return ownershipEvents;
    }


    /**
     * Finds vertices by query defined in DataLocationRequestObject
     * @param {?number} encColor - Encrypted color (0=RED,1=GREEN,2=BLUE)
     * @param inputQuery - Search query
     */
    async dataLocationQuery(inputQuery, encColor = null) {
        const params = {};

        let count = 1;
        let queryString = '';
        for (const searchRequestPart of inputQuery) {
            const { path, value, opcode } = searchRequestPart;

            if (opcode == null) {
                throw new Error('OPCODE parameter is not defined');
            }

            let id_type = path;

            if (path.indexOf('identifiers.') === 0) {
                id_type = id_type.replace('identifiers.', '');
            }

            const id_value = value;
            let operator = '';
            switch (opcode) {
            case 'EQ':
                operator = '==';
                break;
            case 'IN':
                operator = 'IN';
                break;
            default:
                throw new Error(`OPCODE ${opcode} is not supported`);
            }
            params[`id_type${count}`] = id_type;
            params[`id_value${count}`] = id_value;

            queryString += `
                LET v_res${count} = (
                            
                LET identifiers = (
                    FOR v${count} IN ot_vertices
                    FILTER v${count}.vertexType == "Identifier"
                    AND v${count}.identifierType == @id_type${count}
                    AND v${count}.identifierValue ${operator} @id_value${count}
                    AND v${count}.encrypted == ${encColor}
                    RETURN v${count}
                )
                
                LET identifier_datasets = identifiers[*].datasets[**]
                
                LET identified_objects = UNIQUE(
                    FOR identifier IN identifiers
                        FOR v, e IN 1..1 OUTBOUND identifier ot_edges
                        FILTER e.edgeType == 'IdentifierRelation'
                        RETURN v
                )
                
                FOR entity IN identified_objects
                    FOR dataVertex, e IN 1..1 OUTBOUND entity ot_edges
                    FILTER e.relationType == "HAS_DATA"
                    AND LENGTH(INTERSECTION(dataVertex.datasets, identifier_datasets)) > 0
                
                    LET permissioned_object = (
                        LET properties = dataVertex['data']
                        RETURN properties.permissioned_data == null? false : true
                    )
                    LET hasPermissionedData = POSITION(permissioned_object, true)
    
                    LET permissioned_data = (
                        LET properties = dataVertex['data']
                        RETURN properties.permissioned_data == null ? false :
                            (properties.permissioned_data.data == null ? false : true)
                    ) 
                    LET permissionedDataAvailable = POSITION(permissioned_data, true)
                                          
                    RETURN {
                        "id": entity.uid,
                        "datasets": INTERSECTION(dataVertex.datasets, identifier_datasets),
                        "data_element_key": dataVertex._key, 
                        "hasPermissionedData": hasPermissionedData,
                        "permissionedDataAvailable": permissionedDataAvailable
                    }
                )`;

            count += 1;
        }

        let intersectionString = 'INTERSECTION(object1.datasets';
        for (let i = 1; i < count; i += 1) {
            intersectionString += `, object${i}.datasets`;
        }
        intersectionString += ')';

        for (let i = 1; i < count; i += 1) {
            queryString += `
                    FILTER LENGTH(v_res${i}) > 0
                    `;
        }

        queryString += `
            LET data_object_keys = UNIQUE(INTERSECTION(v_res1[*].data_element_key[**]`;
        for (let i = 1; i < count; i += 1) {
            queryString += `, v_res${i}[*].data_element_key[**]`;
        }
        queryString += '))';

        queryString += `
            LET returned_objects = (
                FOR data_key in data_object_keys`;
        for (let i = 1; i < count; i += 1) {
            queryString += `
                LET position${i} = POSITION(v_res${i}[*].data_element_key, data_key, true)
                LET object${i} = NTH(v_res${i}, position${i})
            `;
        }
        queryString += `
                FILTER LENGTH(${intersectionString}) > 0
                RETURN {
                    "id": object1.id,
                    "datasets": ${intersectionString},
                    "data_element_key": data_key,
                    "hasPermissionedData": object1.hasPermissionedData,
                    "permissionedDataAvailable": object1.permissionedDataAvailable
                })`;

        queryString += `
            RETURN returned_objects[0]`;

        return this.runQuery(queryString, params);
    }

    /**
     *
     * @param {Object} startVertexKey
     * @param {Number} depth
     * @param {Array.<string>} includeOnly
     * @param {Array.<string>} excludeOnly
     * @return {Promise<void>}
     */
    async findEntitiesTraversalPath(startVertexKey, depth, includeOnly, excludeOnly) {
        if (startVertexKey == null || typeof startVertexKey !== 'string') {
            throw Error('Must include a valid start vertex.');
        }
        if (includeOnly != null && !Array.isArray(includeOnly)) {
            throw Error('Invalid param.');
        }
        if (excludeOnly != null && !Array.isArray(excludeOnly)) {
            throw Error('Invalid param.');
        }
        if (depth == null || !Number.isInteger(depth)) {
            throw Error('Invalid param.');
        }
        const includeOnlyValid = includeOnly != null && includeOnly.length > 0;
        const excludeOnlyValid = excludeOnly != null && excludeOnly.length > 0;

        const queryString = `let vertices = (FOR v, e, p IN 0..@depth ANY CONCAT('ot_vertices/', @startVertex) ot_edges
                                OPTIONS {
                                    bfs: true,
                                    uniqueVertices: 'global',
                                    uniqueEdges: 'path'
                                }
                                ${includeOnlyValid ? 'FILTER p.edges[*].relationType ALL IN @includeOnly' : ''}
                                ${excludeOnlyValid ? 'FILTER p.edges[*].relationType ALL NOT IN @excludeOnly' : ''}
                                FILTER p.edges[*].edgeType ALL != 'IdentifierRelation'
                                RETURN v)
                                
                            let edges = (FOR v, e, p IN 0..@depth ANY CONCAT('ot_vertices/', @startVertex) ot_edges
                                OPTIONS {
                                    bfs: true,
                                    uniqueVertices: 'global',
                                    uniqueEdges: 'path'
                                }
                                ${includeOnlyValid ? 'FILTER p.edges[*].relationType ALL IN @includeOnly' : ''}
                                ${excludeOnlyValid ? 'FILTER p.edges[*].relationType ALL NOT IN @excludeOnly' : ''}
                                FILTER p.edges[*].edgeType ALL != 'IdentifierRelation'
                                RETURN e)
                            RETURN {vertices, edges}`;

        const params = {
            startVertex: startVertexKey,
            depth,
        };

        if (includeOnlyValid) {
            params.includeOnly = includeOnly;
        }
        if (excludeOnlyValid) {
            params.excludeOnly = excludeOnly;
        }

        const rawGraph = await this.runQuery(queryString, params);
        return ArangoJS.convertToVirtualGraph(rawGraph);
    }

    /**
     * Finds traversal path starting from particular vertex
     * @param startVertex       Starting vertex
     * @param depth             Explicit traversal depth
     * @returns {Promise<any>}
     */
    async findTraversalPath(startVertex, depth) {
        if (startVertex === undefined || startVertex._key === undefined) {
            return [];
        }
        const relationTypes = ['SOURCE', 'DESTINATION', 'EPC', 'EPC_QUANTITY', 'QUANTITY_LIST_ITEM', 'HAS_DATA', 'CONNECTOR_FOR', 'CONNECTION_DOWNSTREAM', 'PARENT_EPC', 'CHILD_EPC'];

        const queryString = `let vertices = (FOR v, e, p IN 0..${depth} ANY 'ot_vertices/${startVertex._key}' ot_edges
                                OPTIONS {
                                    bfs: true,
                                    uniqueVertices: 'global',
                                    uniqueEdges: 'path'
                                }
                                FILTER p.edges[*].relationType ALL IN ${relationTypes}
                                FILTER p.edges[*].edgeType ALL != 'IdentifierRelation'
                                RETURN v)
                                
                            let edges = (FOR v, e, p IN 0..${depth} ANY 'ot_vertices/${startVertex._key}' ot_edges
                                OPTIONS {
                                    bfs: true,
                                    uniqueVertices: 'global',
                                    uniqueEdges: 'path'
                                }
                                FILTER p.edges[*].relationType ALL IN ${relationTypes}
                                FILTER p.edges[*].edgeType ALL != 'IdentifierRelation'
                                RETURN e)
                            RETURN {vertices, edges}`;

        const rawGraph = await this.runQuery(queryString);
        return ArangoJS.convertToVirtualGraph(rawGraph);
    }

    /**
     * Transforms raw graph data to virtual one (without
     * @param rawGraph  Raw graph structure
     * @returns {{}}
     */
    static convertToVirtualGraph(rawGraph) {
        const resultList = {};
        const resultEdges = {};
        const resultVertices = {};

        for (const id in rawGraph) {
            const graph = rawGraph[id];
            if (graph.edges == null) {
                // eslint-disable-next-line no-continue
                continue;
            }

            for (const edgeId in graph.edges) {
                const edge = graph.edges[edgeId];
                if (edge !== null) {
                    ArangoJS._normalizeConnection(edge);

                    delete edge._id;
                    delete edge._rev;

                    // eslint-disable-next-line  prefer-destructuring
                    const key = edge._key;
                    if (resultEdges[key] === undefined) {
                        resultEdges[key] = edge;
                    }
                }
            }

            if (graph.vertices !== undefined) {
                for (const vertexId in graph.vertices) {
                    const vertex = graph.vertices[vertexId];
                    if (vertex !== null) {
                        vertex.outbound = [];

                        delete vertex._id;
                        delete vertex._rev;

                        // eslint-disable-next-line  prefer-destructuring
                        const key = vertex._key;
                        if (resultVertices[key] === undefined) {
                            resultVertices[key] = vertex;
                        }
                    }
                }
            }
        }

        for (const vertexId in resultVertices) {
            resultList[resultVertices[vertexId]._key] = resultVertices[vertexId];
        }
        for (const edgeId in resultEdges) {
            resultList[resultEdges[edgeId]._from].outbound.push(resultEdges[edgeId]);
        }
        return {
            data: resultList,
        };
    }

    async updateImports(collectionName, document, importNumber) {
        const result = await this.getDocument(collectionName, document);
        let new_imports = [];
        if (result.datasets !== undefined) {
            new_imports = result.datasets;

            if (new_imports.includes(importNumber)) {
                return result;
            }
        }

        new_imports.push(importNumber);

        result.datasets = new_imports;
        return this.updateDocument(collectionName, result);
    }

    /**
     * Removes hanging data set ID
     * @param datasetId
     * @returns {Promise<any>}
     */
    async removeDataset(datasetId) {
        const fetchActionQuery = 'LET datasetMetadata = DOCUMENT(\'ot_datasets\', @datasetId)\n' +
            'let datasetVertices = DOCUMENT(\'ot_vertices\', datasetMetadata.vertices)\n' +
            'let datasetEdges = DOCUMENT(\'ot_edges\', datasetMetadata.edges)\n' +
            'let verticesAction = (for v in datasetVertices\n' +
            'LET pos = POSITION(v.datasets, @datasetId, true)\n' +
            'LET datasets = pos == -1 ? v.datasets : REMOVE_NTH(v.datasets, pos)\n' +
            'let action = LENGTH(datasets) == 0 ?  {action: \'delete\', key: v._key} :  {action: \'update\', key: v._key, datasets: datasets}\n' +
            'return action)\n' +
            'let edgesAction = (for v in datasetEdges\n' +
            'LET pos = POSITION(v.datasets, @datasetId, true)\n' +
            'LET datasets = pos == -1 ? v.datasets : REMOVE_NTH(v.datasets, pos)\n' +
            'let action = LENGTH(datasets) == 0 ?  {action: \'delete\', key: v._key} :  {action: \'update\', key: v._key, datasets: datasets}\n' +
            'return action)\n' +
            'return {verticesAction: verticesAction, edgesAction: edgesAction}';
        const actions = await this.runQuery(fetchActionQuery, { datasetId });
        /* eslint-disable no-unused-expressions,import/no-unresolved,global-require */
        const action = String((params) => {
            const { query } = require('@arangodb');
            query`for va in ${params.params.edgesAction} FILTER va.action == 'update' UPDATE { _key: va.key, datasets: va.datasets } IN 'ot_edges'`;
            query`for va in ${params.params.verticesAction} FILTER va.action == 'update' UPDATE { _key: va.key, datasets: va.datasets } IN 'ot_vertices'`;
            query`for va in ${params.params.edgesAction} FILTER va.action == 'delete' REMOVE { _key: va.key } IN 'ot_edges'`;
            query`for va in ${params.params.verticesAction} FILTER va.action == 'delete' REMOVE { _key: va.key } IN 'ot_vertices'`;
            query`REMOVE { _key: ${params.params.datasetId} } IN 'ot_datasets'`;
        });
        /* eslint-disable no-unused-expressions,import/no-unresolved,global-requir */
        await this.db.transaction(['ot_vertices', 'ot_edges', 'ot_datasets'], action, {
            params: {
                edgesAction: actions[0].edgesAction,
                verticesAction: actions[0].verticesAction,
                datasetId,
            },
        });
    }

    /**
     * Replaces one data set ID with another
     * @param oldDataSet    Old data set ID
     * @param newDataSet    New data set ID
     * @returns {Promise<any>}
     */
    async replaceDataSets(oldDataSet, newDataSet) {
        const queryString = 'LET documents = (' +
            '    FOR d IN __COLLECTION__' +
            '    FILTER' +
            '        d.datasets != null' +
            '        AND' +
            '        POSITION(d.datasets, @oldDataSet, false) != false' +
            '    SORT d._key RETURN d' +
            ')' +
            '    RETURN COUNT(' +
            '       FOR d IN documents' +
            '           LET pos = POSITION(d.datasets, @oldDataSet, true)' +
            '           LET dataSets = pos == -1? d.datasets : APPEND(PUSH(SLICE(d.datasets, 0, pos), @newDataSet), SLICE(d.datasets, pos+1))' +
            '           UPDATE { _key: d._key, datasets: dataSets } IN __COLLECTION__' +
            '       RETURN 1)';

        const edgesQuery = queryString.replace(/__COLLECTION__/g, 'ot_edges');
        const verticesQuery = queryString.replace(/__COLLECTION__/g, 'ot_vertices');
        const params = {
            oldDataSet,
            newDataSet,
        };
        let count = await this.runQuery(edgesQuery, params);
        count += await this.runQuery(verticesQuery, params);
        return count;
    }

    /**
     * Updates document imports by ID
     * @param collectionName
     * @param senderId
     * @param uid
     * @param importNumber
     * @return {Promise<*>}
     */
    async updateDocumentImportsByUID(collectionName, senderId, uid, importNumber) {
        const result = await this.findDocumentWithMaxVersion(collectionName, senderId, uid);
        let new_imports = [];
        if (result.datasets !== undefined) {
            new_imports = result.datasets;

            if (new_imports.includes(importNumber)) {
                return ArangoJS._normalize(result);
            }
        }

        new_imports.push(importNumber);

        result.datasets = new_imports;
        return this.updateDocument(collectionName, result);
    }

    /**
     * Updates vertex imports by ID
     * @param senderId
     * @param uid
     * @param importNumber
     * @return {Promise<*>}
     */
    async updateVertexImportsByUID(senderId, uid, importNumber) {
        return this.updateDocumentImportsByUID('ot_vertices', senderId, uid, importNumber);
    }

    /**
     * Updates edge imports by ID
     * @param senderId
     * @param uid
     * @param importNumber
     * @return {Promise<*>}
     */
    async updateEdgeImportsByUID(senderId, uid, importNumber) {
        return this.updateDocumentImportsByUID('ot_edges', senderId, uid, importNumber);
    }

    /**
     * Gets max where uid is the same and has the max version
     * @param senderId  Sender ID
     * @param uid       Vertex uid
     * @return {Promise<void>}
     */
    async findVertexWithMaxVersion(senderId, uid) {
        return this.findDocumentWithMaxVersion('ot_vertices', senderId, uid);
    }

    /**
     * Gets max where uid is the same and has the max version
     * @param senderId  Sender ID
     * @param uid       Vertex uid
     * @return {Promise<void>}
     */
    async findEdgeWithMaxVersion(senderId, uid) {
        return this.findDocumentWithMaxVersion('ot_edges', senderId, uid);
    }

    /**
     * Gets max where uid is the same and has the max version
     * @param senderId   Sender ID
     * @param uid        Vertex uid
     * @param collection Collection name
     * @return {Promise<void>}
     */
    async findDocumentWithMaxVersion(collection, senderId, uid) {
        const queryString = `FOR v IN  ${collection} ` +
            'FILTER v.uid == @uid AND v.sender_id == @senderId ' +
            'LIMIT 1 ' +
            'RETURN v';

        const params = {
            uid,
            senderId,
        };

        const result = await this.runQuery(queryString, params);
        if (result.length > 0) {
            return result[0];
        }
        return null;
    }

    /**
     * Run query on ArangoDB graph database
     * @param {string} - queryString
     * @param {object} - params
     * @returns {Promise<any>}
     */
    async runQuery(queryString, params) {
        const result = await this.db.query(queryString, params);
        const all = await result.all();
        return ArangoJS._normalize(all);
    }

    /**
     * Inserts vertex into ArangoDB graph database
     * @param {vertex} - document
     * @returns {Promise<any>}
     */
    async addVertex(vertex) {
        return this.addDocument('ot_vertices', vertex);
    }

    /**
     * Add dataset metadata
     * @param metadata Dataset metadata
     * @returns {Promise<any>}
     */
    async addDatasetMetadata(metadata) {
        return this.addDocument('ot_datasets', metadata);
    }

    /**
     * Inserts edge into ArangoDB graph database
     * @param {vertex} - document
     * @returns {Promise<any>}
     */
    async addEdge(edge) {
        const _edge = Utilities.copyObject(edge);
        _edge._from = `ot_vertices/${edge._from}`;
        _edge._to = `ot_vertices/${edge._to}`;
        return this.addDocument('ot_edges', _edge);
    }

    /**
     * Inserts document into ArangoDB graph database for given collection name
     * @param {string} - collectionName
     * @param {object} - document
     * @returns {Promise<any>}
     */
    async addDocument(collectionName, document) {
        if (document === undefined || document === null) { throw Error('ArangoError: invalid document type'); }
        if (collectionName === undefined || collectionName === null) { throw Error('ArangoError: invalid collection type'); }

        const collection = this.db.collection(collectionName);
        if (document._key) {
            const response = await this.findDocuments(collectionName, { _key: document._key });
            if (response.length > 0) {
                const existing = ArangoJS._normalize(response[0]);
                if (existing.datasets != null && document.datasets != null) {
                    existing.datasets =
                        existing.datasets
                            .concat(document.datasets
                                .filter(datasetId => !existing.datasets.includes(datasetId)));

                    existing.datasets.concat(document.datasets);
                }
                if (document.encrypted) {
                    if (!existing.encrypted) {
                        existing.encrypted = {};
                    }
                    for (const key of Object.keys(document.encrypted)) {
                        existing.encrypted[key] = document.encrypted[key];
                    }
                }
                return this.updateDocument(collectionName, existing);
            }
        }
        return ArangoJS._normalize(await collection.save(document));
    }

    /**
     * Update document in ArangoDB graph database
     * @param {string} - collectionName
     * @param {object} - document
     * @returns {Promise<any>}
     */
    async updateDocument(collectionName, document) {
        ArangoJS._deNormalizeConnection(document);
        const collection = this.db.collection(collectionName);
        const response = await collection.update(document._key, document);
        return ArangoJS._normalize(response);
    }


    /**
     * Update document in ArangoDB graph database
     * @param {string} - collectionName
     * @param {object} - document
     * @returns {Promise<any>}
     */
    async replaceDocument(collectionName, document) {
        ArangoJS._deNormalizeConnection(document);
        const collection = this.db.collection(collectionName);
        const response = await collection.replace(document._key, document);
        return ArangoJS._normalize(response);
    }

    /**
     * Get document from ArangoDB graph database
     * @param {string} - collectionName
     * @param {object} - document
     * @returns {Promise<any>}
     */
    async getDocument(collectionName, documentKey) {
        const collection = this.db.collection(collectionName);
        const response = await collection.document(documentKey);
        return ArangoJS._normalize(response);
    }


    /**
     * Identify selected database as ArangoJS
     * @returns {string} - Graph database identifier string
     */
    identify() {
        return 'ArangoJS';
    }

    /**
     * Get ArangoDB version
     * @param {string} - host
     * @param {string} - port
     * @param {string} - username
     * @param {string} - password
     * @returns {Promise<any>}
     */
    async version(host, port, username, password) {
        const result = await request
            .get(`http://${host}:${port}/_api/version`)
            .auth(username, password);

        try {
            if (result.status === 200) {
                return result.body.version;
            }
        } catch (error) {
            throw Error(`Failed to contact arangodb${error}`);
        }
    }

    /**
     * Create document collection, if collection does not exist
     * @param collectionName
     */
    async createCollection(collectionName) {
        const collection = this.db.collection(collectionName);
        try {
            await collection.create();
            return 'Collection created';
        } catch (err) {
            const errorCode = err.response.body.code;
            if (errorCode === 409 && IGNORE_DOUBLE_INSERT) {
                return 'Double insert';
            }
            throw err;
        }
    }

    /**
     * Deletes the collection in the database.
     * @param collectionName
     */
    async dropCollection(collectionName) {
        if (collectionName === undefined || collectionName === null) { throw Error('ArangoError: invalid collection type'); }
        const collection = this.db.collection(collectionName);
        try {
            await collection.drop();
            return 'Collection is now deleted';
        } catch (err) {
            throw err;
        }
    }

    async createEdgeCollection(collectionName) {
        const collection = this.db.edgeCollection(collectionName);
        try {
            await collection.create();
            return 'Edge collection created';
        } catch (err) {
            const errorCode = err.response.body.code;
            if (errorCode === 409 && IGNORE_DOUBLE_INSERT) {
                return 'Double insert';
            }
            throw err;
        }
    }

    /**
     * Gets the count of documents in collection.
     * @param collectionName
     */
    async getDocumentsCount(collectionName) {
        if (collectionName === undefined || collectionName === null) { throw Error('ArangoError: invalid collection name'); }
        const collection = this.db.collection(collectionName);
        try {
            const data = await collection.count();
            return data.count;
        } catch (err) {
            throw err;
        }
    }

    /**
     * Finds metadata by dataset ID
     * @return {Promise<*>}
     * @param datasetId
     */
    async findMetadataByImportId(datasetId) {
        const queryString = 'RETURN DOCUMENT(\'ot_datasets\', @datasetId)';
        return this.runQuery(queryString, { datasetId });
    }

    /**
     * Retrieves dataset metadata of multiple datasets by their ids
     * @param datasetIds - Array of dataset ids
     * @return {Promise<*>}
     */
    async findMultipleMetadataByDatasetIds(datasetIds) {
        const queryString = 'RETURN DOCUMENT(\'ot_datasets\', @datasetIds)';
        return this.runQuery(queryString, { datasetIds });
    }

    /**
     * Retrieves all elements of a dataset ID
     * @return {Promise<*>}
     * @param datasetId
     */
    async getDatasetWithVerticesAndEdges(datasetId) {
        const queryString = `LET datasetMetadata = DOCUMENT('ot_datasets', @datasetId)

                            LET datasetVertices = DOCUMENT('ot_vertices', datasetMetadata.vertices)
                            LET datasetEdges = DOCUMENT('ot_edges', datasetMetadata.edges)

                            RETURN {
                                metadata: datasetMetadata,
                                vertices: datasetVertices,
                                edges: datasetEdges
                            }`;

        const result = await this.runQuery(queryString, { datasetId });

        for (const edge of result[0].edges) {
            ArangoJS._normalizeConnection(edge);
        }
        return result;
    }

    /**
     * Finds vertices by dataset ID
     * @param {string} data_id - Dataset ID
     * @return {Promise<*>}
     */
    async findVerticesByImportId(data_id) {
        const queryString = `FOR v IN ot_vertices 
                        FILTER v.datasets != null 
                        AND POSITION(v.datasets, @importId, false)  != false 
                        SORT v._key RETURN v`;
        const params = { importId: data_id };
        const vertices = await this.runQuery(queryString, params);

        const normalizedVertices = normalizeGraph(data_id, vertices, []).vertices; // ???

        if (normalizedVertices.length === 0) {
            return [];
        }

        // Check if packed to fix issue with double classes.
        const filtered = normalizedVertices.filter(v => v._dc_key);
        if (filtered.length > 0) {
            return normalizedVertices;
        }

        return normalizedVertices;
    }

    /**
     * Returns vertices and edges with specific parameters
     * @param importId
     * @param objectKey
     * @returns {Promise<any>}
     */
    async findDocumentsByImportIdAndOtObjectKey(importId, objectKey, range) {
        const queryString = `LET rootObject = (
                                RETURN document('ot_vertices', @objectKey)
                            )
                            
                            LET relatedObjects = (
                                FOR v, e IN 1..${range} OUTBOUND rootObject[0] ot_edges
                                FILTER e.edgeType IN ['IdentifierRelation','dataRelation','otRelation']
                                    AND e.datasets != null
                                    AND v.datasets != null
                                    AND POSITION(e.datasets, @importId, false) != false
                                    AND POSITION(v.datasets, @importId, false) != false
                                RETURN {
                                    "vertex": v,
                                    "edge": e
                                }
                            )
                            
                            RETURN {
                                "rootObject": rootObject[0],
                                "relatedObjects": relatedObjects
                            }`;

        const result = await this.runQuery(queryString, {
            importId,
            objectKey,
        });

        return result[0];
    }

    /**
     * Returns vertices and edges with specific parameters
     * @param importId
     * @param objectId
     * @returns {Promise<any>}
     */
    async findDocumentsByImportIdAndOtObjectId(importId, objectId) {
        const queryString = `LET rootObject = (
                                FOR v IN ot_vertices
                                
                                FILTER v.uid == @objectId
                                    AND v.datasets != null
                                    AND POSITION(v.datasets, @importId, false) != false
                                RETURN v
                            )    
                            
                            LET relatedObjects = (
                                FOR v, e IN 1..1 OUTBOUND rootObject[0] ot_edges
                                FILTER e.edgeType IN ['IdentifierRelation','dataRelation','otRelation']
                                    AND e.datasets != null
                                    AND v.datasets != null
                                    AND POSITION(e.datasets, @importId, false) != false
                                    AND POSITION(v.datasets, @importId, false) != false
                                RETURN {
                                    "vertex": v,
                                    "edge": e
                                }
                            )
                            
                            RETURN {
                                "rootObject": rootObject[0],
                                "relatedObjects": relatedObjects
                            }`;

        const result = await this.runQuery(queryString, {
            importId,
            objectId,
        });

        return result[0];
    }

    /**
     * Find edges by dataset ID
     * @param {string} data_id - Dataset ID
     * @return {Promise<void>}
     */
    async findEdgesByImportId(data_id) {
        const queryString = 'FOR v IN ot_edges ' +
            'FILTER v.datasets != null ' +
            'AND POSITION(v.datasets, @importId, false) != false ' +
            'SORT v._key ' +
            'RETURN v';

        const params = { importId: data_id };
        const edges = await this.runQuery(queryString, params);
        return normalizeGraph(data_id, [], edges).edges;
    }

    async findEdgesByImportIdAndFromId(importId, fromId) {
        const queryString = `FOR v IN ot_edges 
            FILTER v.datasets != null AND v._from== @fromId
            AND POSITION(v.datasets, @importId, false) != false
            SORT v._key 
            RETURN v`;

        const params = { importId, fromId };
        const edges = await this.runQuery(queryString, params);
        return normalizeGraph(importId, [], edges).edges;
    }

    /**
     * Find event based on ID and bizStep
     * Note: based on bizStep we define INPUT(shipping) or OUTPUT(receiving)
     * @param senderId      Sender ID
     * @param partnerId     Partner ID
     * @param documentId    Document ID
     * @param bizStep       BizStep value
     * @return {Promise}
     */
    async findEvent(senderId, partnerId, documentId, bizStep) {
        // 'FILTER v.identifiers.document_id == @documentId
        // AND @senderId in v.partner_id AND v.sender_id in @partnerId ' +
        //  'RETURN v';

        const queryString = `FOR v IN ot_vertices
            FILTER v.vertex_type == 'EVENT' and v.encrypted == null
            RETURN v`;
        const params = {};
        const result = await this.runQuery(queryString, params);

        return result.filter((event) => {
            if (partnerId.indexOf(event.sender_id) !== -1) {
                for (const key in event) {
                    if (event[key].data) {
                        const { data } = event[key];

                        if (data.bizStep
                            && data.bizStep.endsWith(bizStep)
                            && data.extension
                            && data.extension.extension
                            && data.extension.extension.documentId === documentId) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
    }

    /**
     * Returns data creator identity for dataset ID
     * @param datasetId
     * @returns {Promise}
     */
    async findIssuerIdentitiesForDatasetId(datasetId) {
        const queryString = `let dataset_info = (
                                return document('ot_datasets', @datasetId) 
                            )
                            return dataset_info[0].datasetHeader.dataCreator.identifiers`;
        const params = { datasetId };
        return this.runQuery(queryString, params);
    }

    /**
     * Returns data creator identity for vertex with elementId
     * @param elementId
     * @returns {Promise}
     */
    async findIssuerIdentityForElementId(elementId) {
        const queryString = `let dataset_ids = (
                                FOR v IN ot_vertices
                                FILTER v.vertexType == "Identifier"
                                AND v.identifierValue == @elementId
                                RETURN v.datasets[0]
                            )
                            
                            let identity = ( 
                                for d in ot_datasets
                                filter d._key in dataset_ids
                                return {dataset_id: d._key, identifiers: d.datasetHeader.dataCreator.identifiers}
                            )
                            return identity[0]`;
        const params = { elementId };
        return this.runQuery(queryString, params);
    }

    /**
     * Mimics commit opertaion
     * Removes inTransaction fields
     * @return {Promise<void>}
     */
    async commit() {
        const queryUpdateTemplate = 'FOR v IN __COLLECTION__ ' +
            'FILTER v.inTransaction == true ' +
            'UPDATE v WITH { inTransaction: null } ' +
            'IN __COLLECTION__ OPTIONS { keepNull: false } ' +
            'RETURN NEW';

        await this.runQuery(queryUpdateTemplate.replace(/__COLLECTION__/g, 'ot_vertices'));
        await this.runQuery(queryUpdateTemplate.replace(/__COLLECTION__/g, 'ot_edges'));
    }

    /**
     * Mimics rollback opertaion
     * Removes elements in transaction
     * @return {Promise<void>}
     */
    async rollback() {
        let queryString = 'FOR v IN ot_vertices FILTER v.inTransaction == true REMOVE v IN ot_vertices';
        await this.runQuery(queryString);
        queryString = 'FOR e IN ot_edges FILTER e.inTransaction == true REMOVE e IN ot_edges';
        await this.runQuery(queryString);
    }

    /**
     * Normalize properties returned from ArangoDB
     * @param document
     * @returns {*}
     * @private
     */
    static _normalize(document) {
        if (Array.isArray(document)) {
            for (const doc of document) {
                ArangoJS._normalize(doc);
            }
        } else {
            delete document._id;
            delete document._rev;
            delete document._oldRev;
            ArangoJS._normalizeConnection(document);
        }
        return document;
    }

    /**
     * Removes collection name from document properties
     * @param document
     * @returns {*}
     * @private
     */
    static _normalizeConnection(document) {
        if (typeof document._from === 'string' && document._from.startsWith('ot_vertices/')) {
            document._from = document._from.substring('ot_vertices/'.length);
        }
        if (typeof document._to === 'string' && document._to.startsWith('ot_vertices/')) {
            document._to = document._to.substring('ot_vertices/'.length);
        }
        return document;
    }

    /**
     * Adds collection name to document properties
     * @param document
     * @returns {*}
     * @private
     */
    static _deNormalizeConnection(document) {
        if (typeof document._from === 'string' && !document._from.startsWith('ot_vertices/')) {
            document._from = `ot_vertices/${document._from}`;
        }
        if (typeof document._to === 'string' && !document._to.startsWith('ot_vertices/')) {
            document._to = `ot_vertices/${document._to}`;
        }
        return document;
    }
}
module.exports = ArangoJS;
