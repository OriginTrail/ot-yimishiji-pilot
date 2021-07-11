/* eslint-disable no-unused-expressions, max-len */

const {
    Then, Given,
} = require('cucumber');
const BN = require('bn.js');
const { expect } = require('chai');
const fs = require('fs');
const sleep = require('sleep-async')().Promise;

const httpApiHelper = require('./lib/http-api-helper');

Given(/^DC imports "([^"]*)" as ([GS1\-EPCIS|GRAPH|OT\-JSON|WOT]+)$/, { timeout: 20000 }, async function (importFilePath, importType) {
    this.logger.log(`DC imports '${importFilePath}' as ${importType}.`);
    expect(importType, 'importType can only be OT-JSON, GS1-EPCIS, WOT or GRAPH.').to.satisfy(val => (val === 'GS1-EPCIS' || val === 'GRAPH' || val === 'OT-JSON' || val === 'WOT'));
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const { dc } = this.state;
    const host = dc.state.node_rpc_url;

    const importResponse = await httpApiHelper.apiImport(host, importFilePath, importType);

    expect(importResponse).to.have.keys(['handler_id']);

    // sometimes there is a need to remember import before the last one
    if (this.state.lastImportHandler) {
        this.state.secondLastImportHandler = this.state.lastImportHandler;
    }
    this.state.lastImportHandler = importResponse.handler_id;
});

Then(/^DC checks status of the last import$/, { timeout: 20000 }, async function () {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const { dc } = this.state;
    const host = dc.state.node_rpc_url;

    this.state.lastImportStatus = await httpApiHelper.apiImportResult(host, this.state.lastImportHandler);
});

Then(/^The last import status should be "([^"]*)"$/, { timeout: 1200000 }, async function (status) {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);
    expect(this.state.lastImportStatus.status).to.be.equal(status);
});

Then(/^the last import should already have been imported$/, { timeout: 1200000 }, async function () {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);
    expect(this.state.lastImportStatus.status).to.be.equal('COMPLETED');
    expect(this.state.lastImportStatus.data).to.have.property(
        'message',
        'Dataset already imported on the node, importing skipped',
    );
});


Given(/^(DC|DV|DV2) waits for import to finish$/, { timeout: 1200000 }, async function (targetNode) {
    this.logger.log(`${targetNode} waits for import to finish.`);
    expect(targetNode, 'Node type can only be DC, DH or DV.').to.satisfy(val => (val === 'DC' || val === 'DV2' || val === 'DV'));
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const target = this.state[targetNode.toLowerCase()];
    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const promise = new Promise((acc) => {
        target.once('import-complete', async () => {
            // at this moment, DV|DV2 should not update state.lastImport since his import is referred to network read operation
            // maybe it should be changed in the future
            if (targetNode.toLowerCase() === 'dc') {
                if (this.state.lastImport) {
                    this.state.secondLastImport = this.state.lastImport;
                }

                this.state.lastImport = await httpApiHelper.apiImportResult(host, this.state.lastImportHandler);
            }
            acc();
        });
    });


    return promise;
});

Given(/^(DC|DV|DV2) should skip import for the same dataset$/, { timeout: 1200000 }, async function (targetNode) {
    this.logger.log(`${targetNode} should skip import for the same dataset.`);
    expect(targetNode, 'Node type can only be DC, DH or DV.').to.satisfy(val => (val === 'DC' || val === 'DV2' || val === 'DV'));
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const target = this.state[targetNode.toLowerCase()];
    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const promise = new Promise((acc) => {
        target.once('import-duplicated', async () => {
            if (targetNode.toLowerCase() === 'dc') {
                if (this.state.lastImport) {
                    this.state.secondLastImport = this.state.lastImport;
                }

                this.state.lastImport = await httpApiHelper.apiImportResult(host, this.state.lastImportHandler);

                expect(this.state.lastImport.data.message).to.be.equal('Dataset already imported on the node, importing skipped');
            }
            acc();
        });
    });


    return promise;
});


Given(/^I wait for trail to finish$/, { timeout: 1200000 }, async function () {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state.lastTrailHandlerId, 'Trail request not defined.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const target = this.state.dc;
    const host = this.state.dc.state.node_rpc_url;

    const promise = new Promise((acc) => {
        target.once('trail-complete', async () => {
            if (this.state.lastTrail) {
                this.state.secondLastTrail = this.state.lastTrail;
            }

            const response = await httpApiHelper.apiTrailFindResult(host, this.state.lastTrailHandlerId);
            this.state.lastTrail = response.data;

            acc();
        });
    });


    return promise;
});

Given(/^(DC|DH|DV|DV2) exports the last imported dataset as ([GS1\-EPCIS|GRAPH|OT\-JSON|WOT]+)$/, async function (targetNode, exportType) {
    this.logger.log(`${targetNode} exports the last imported dataset as ${exportType}`);
    expect(exportType, 'export type can only be GS1-EPCIS, OT-JSON, WOT, or GRAPH.').to.satisfy(val => (val === 'GS1-EPCIS' || val === 'GRAPH' || val === 'OT-JSON' || val === 'WOT'));
    expect(targetNode, 'Node type can only be DC, DV2, DV, or DH.').to.satisfy(val => (val === 'DC' || val === 'DV2' || val === 'DV' || val === 'DH'));
    expect(!!this.state[targetNode.toLowerCase()], 'Target node not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state.lastImport, 'Last import data not defined. Use other step to define it.').to.be.equal(true);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;
    const { dataset_id } = this.state.lastImport.data;

    const exportResponse = await httpApiHelper.apiExport(host, dataset_id, exportType);

    expect(exportResponse).to.have.keys(['handler_id']);

    // sometimes there is a need to remember export before the last one
    if (this.state.lastExportHandler) {
        this.state.secondLastExportHandler = this.state.lastExportHandler;
        this.state.secondLastExportType = this.state.lastExportType;
    }
    this.state.lastExportHandler = exportResponse.handler_id;
    this.state.lastExportType = exportType;
});

Then(/^the consensus check should pass for the two last imports$/, function () {
    expect(!!this.state.lastExport, 'Last import data not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state.secondLastExport, 'Second last import data not defined. Use other step to define it.').to.be.equal(true);
    const dataset1 = JSON.parse(this.state.lastExport.data.formatted_dataset);
    const dataset2 = JSON.parse(this.state.secondLastExport.data.formatted_dataset);
    const objectEvent1 = dataset1['@graph'].find(x => x.properties.action === 'OBSERVE');
    const objectEvent2 = dataset2['@graph'].find(x => x.properties.action === 'OBSERVE');

    expect(objectEvent1.properties.action === objectEvent2.properties.action, 'Consensus not valid. Action is not the same.').to.be.equal(true);
    expect(['urn:epcglobal:cbv:bizstep:shipping', 'urn:epcglobal:cbv:bizstep:receiving'].includes(objectEvent1.properties.bizStep)
        && ['urn:epcglobal:cbv:bizstep:shipping', 'urn:epcglobal:cbv:bizstep:receiving'].includes(objectEvent2.properties.bizStep)
        && objectEvent1.properties.bizStep !== objectEvent2.properties.bizStep, 'Invalid bizStep in consensus.').to.be.equal(true);
    expect(JSON.stringify(objectEvent1.properties.epcList) === JSON.stringify(objectEvent2.properties.epcList), 'Invalid epcList in consensus.').to.be.equal(true);

    expect(this.state.lastIssuerIdentities.toString() !== this.state.secondLastIssuerIdentities.toString()).to.be.equal(true);
});

Given(/^(DC|DH|DV|DV2) waits for export to finish$/, { timeout: 1200000 }, async function (targetNode) {
    expect(targetNode, 'Node type can only be DC, DV2, DV, or DH.').to.satisfy(val => (val === 'DC' || val === 'DV2' || val === 'DV' || val === 'DH'));
    expect(!!this.state[targetNode.toLowerCase()], 'Target node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);

    const target = this.state[targetNode.toLowerCase()];
    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const promise = new Promise((acc) => {
        target.once('export-complete', async () => {
            if (this.state.lastExport) {
                this.state.secondLastExport = this.state.lastExport;
            }
            this.state.lastExport = await httpApiHelper.apiExportResult(host, this.state.lastExportHandler);
            acc();
        });
    });

    return promise;
});

Given(/^response should return same dataset_ids as second last import and last import$/, async function () {
    expect(!!this.state.lastImportHandler, 'Last imports handler_id not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state.secondLastImportHandler, 'Second last imports handler_id not defined. Use other step to define it.').to.be.equal(true);

    const { dc } = this.state;
    const host = dc.state.node_rpc_url;

    const response = await httpApiHelper.apiQueryLocal(host, this.state.jsonQuery);
    this.state.apiQueryLocalResponse = response;
    const importIds = [this.state.secondLastImport.data.dataset_id, this.state.lastImport.data.dataset_id];
    // TODO fix message
    expect(response.filter(val => importIds.includes(val) !== false).length, 'Response not good.').to.be.equal(2);
});


Given(/^DC initiates the replication for last imported dataset$/, { timeout: 60000 }, async function () {
    this.logger.log('DC initiates the replication for last imported dataset');
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state.lastImport, 'Nothing was imported. Use other step to do it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const { dc } = this.state;
    const host = dc.state.node_rpc_url;

    let response;
    try {
        response =
            await httpApiHelper.apiReplication(
                host,
                this.state.lastImport.data.dataset_id,
            );
        this.state.lastReplicationHandler = response;
    } catch (e) {
        throw Error(`Failed to initiate replicate. Got reply: ${JSON.stringify(response)}`);
    }
});

Given(/^I create json query with path: "(\S+)", value: "(\S+)" and opcode: "(\S+)"$/, async function (path, value, opcode) {
    expect(opcode, 'Opcode should only be EQ or IN.').to.satisfy(val => (val === 'EQ' || val === 'IN'));

    const myJsonQuery = {
        query:
            [
                {
                    path,
                    value,
                    opcode,
                },
            ],
    };

    this.state.jsonQuery = myJsonQuery;
});

Given(/^I append json query with path: "(\S+)", value: "(\S+)" and opcode: "(\S+)"$/, async function (path, value, opcode) {
    expect(opcode, 'Opcode should only be EQ or IN.').to.satisfy(val => (val === 'EQ' || val === 'IN'));
    expect(!!this.state.jsonQuery, 'json query must exist').to.be.equal(true);

    const myAppendQueryObject = {
        path,
        value,
        opcode,
    };

    this.state.jsonQuery.query.push(myAppendQueryObject);
});

Given(/^(DC|DH|DV) node makes local query with previous json query$/, async function (targetNode) {
    expect(targetNode, 'Node type can only be DC, DH or DV.').to.satisfy(val => (val === 'DC' || val === 'DH' || val === 'DV'));
    expect(!!this.state[targetNode.toLowerCase()], 'Target node not defined. Use other step to define it.').to.be.equal(true);


    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const response = await httpApiHelper.apiQueryLocal(host, this.state.jsonQuery);
    if (this.state.apiQueryLocalResponse) {
        this.state.apiLastQueryLocalResponse = this.state.apiQueryLocalResponse;
    }
    this.state.apiQueryLocalResponse = response;
});

Given(/^the last two queries should return the same object$/, async function () {
    expect(this.state.apiQueryLocalResponse[0]).to.be.equal(this.state.apiLastQueryLocalResponse[0]);
});

Given(/^I query ([DC|DH|DV]+) node locally for last imported data set id$/, async function (targetNode) {
    expect(!!this.state.lastImport, 'Nothing was imported. Use other step to do it.').to.be.equal(true);
    expect(!!this.state.lastImport.data.dataset_id, 'Last imports data set id seems not defined').to.be.equal(true);
    expect(targetNode, 'Node type can only be DC, DH or DV.').to.satisfy(val => (val === 'DC' || val === 'DH' || val === 'DV'));
    expect(!!this.state[targetNode.toLowerCase()], 'Target node not defined. Use other step to define it.').to.be.equal(true);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;
    const lastDataSetId = this.state.lastImport.data.dataset_id;

    const response = await httpApiHelper.apiQueryLocalImportByDataSetId(host, lastDataSetId);
    this.state.apiQueryLocalImportByDataSetIdResponse = response;
});

Given(/^([DV|DV2]+) publishes query consisting of path: "(\S+)", value: "(\S+)" and opcode: "(\S+)" to the network$/, { timeout: 90000 }, async function (whichDV, path, value, opcode) {
    this.logger.log(`${whichDV} publishes query to the network`);
    expect(!!this.state[whichDV.toLowerCase()], 'DV/DV2 node not defined. Use other step to define it.').to.be.equal(true);
    expect(opcode, 'Opcode should only be EQ or IN.').to.satisfy(val => (val === 'EQ' || val === 'IN'));
    const dv = this.state[whichDV.toLowerCase()];

    // TODO find way to pass jsonQuery directly to step definition
    const jsonQuery = {
        query:
            [
                {
                    path,
                    value,
                    opcode,
                },
            ],
    };
    const queryNetworkResponse =
        await httpApiHelper.apiQueryNetwork(dv.state.node_rpc_url, jsonQuery);
    expect(Object.keys(queryNetworkResponse), 'Response should have message and query_id').to.have.members(['query_id']);
    this.state.lastQueryNetworkId = queryNetworkResponse.query_id;
    return new Promise((accept, reject) => dv.once('dv-network-query-processed', () => accept()));
});

Given(/^([DC|DH]+) removes permissioned data from the last imported dataset consisting of path: "(\S+)", value: "(\S+)"$/, { timeout: 90000 }, async function (whichNode, path, value) {
    expect(!!this.state[whichNode.toLowerCase()], 'DC/DH node not defined. Use other step to define it.').to.be.equal(true);
    const node = this.state[whichNode.toLowerCase()];

    const jsonQuery = {
        identifier_type: path,
        identifier_value: value,
        dataset_id: this.state.lastImport.data.dataset_id,
    };
    const response =
        await httpApiHelper.apiRemovePermissionedData(node.state.node_rpc_url, jsonQuery);
    expect(response.status, 'Response should have message and query_id').to.be.equal('COMPLETED');
});

Given(/^the ([DV|DV2]+) sends read and export for (last import|second last import) from DC as ([GS1\-EPCIS|GRAPH|OT\-JSON|WOT]+)$/, { timeout: 90000 }, async function (whichDV, whichImport, exportType) {
    this.logger.log(`${whichDV} sends read and export request.`);
    expect(exportType, 'exportType can only be OT-JSON, GS1-EPCIS, WOT or GRAPH.').to.satisfy(val => (val === 'GS1-EPCIS' || val === 'GRAPH' || val === 'OT-JSON' || val === 'WOT'));
    expect(whichDV, 'Query can be made either by DV or DV2.').to.satisfy(val => (val === 'DV' || val === 'DV2'));
    expect(whichImport, 'last import or second last import are only allowed values').to.be.oneOf(['last import', 'second last import']);
    whichImport = (whichImport === 'last import') ? 'lastImport' : 'secondLastImport';
    expect(!!this.state[whichDV.toLowerCase()], 'DV/DV2 node not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state[whichImport], 'Nothing was imported. Use other step to do it.').to.be.equal(true);
    expect(this.state.lastQueryNetworkId, 'Query not published yet.').to.not.be.undefined;

    const { dc } = this.state;
    const dv = this.state[whichDV.toLowerCase()];
    const queryId = this.state.lastQueryNetworkId;
    const dataSetId = this.state[whichImport].data.dataset_id;
    const { replyId } = dv.state.dataLocationQueriesConfirmations[queryId][dc.state.identity];
    const readExportNetworkResponse = await httpApiHelper.apiQueryNetworkReadAndExport(
        dv.state.node_rpc_url,
        {
            data_set_id: dataSetId,
            reply_id: replyId,
            standard_id: exportType,
        },
    );

    expect(Object.keys(readExportNetworkResponse), 'Response should have handler_id').to.have.members(['handler_id']);
    this.state.lastExportHandler = readExportNetworkResponse.handler_id;
    this.state.lastExportType = exportType;
});


Given(/^([DC|DH]+) runs local query consisting of path: "(\S+)", value: "(\S+)" and opcode: "(\S+)"$/, { timeout: 90000 }, async function (whichNode, path, value, opcode) {
    expect(!!this.state[whichNode.toLowerCase()], 'DC/DH node not defined. Use other step to define it.').to.be.equal(true);
    expect(opcode, 'Opcode should only be EQ or IN.').to.satisfy(val => (val === 'EQ' || val === 'IN'));
    const dv = this.state[whichNode.toLowerCase()];

    const jsonQuery = {
        query:
            [
                {
                    path,
                    value,
                    opcode,
                },
            ],
    };
    const queryNetworkResponse =
        await httpApiHelper.apiQueryLocal(dv.state.node_rpc_url, jsonQuery);
    expect(queryNetworkResponse.length, 'Response should be an array').to.be.equal(1);
    expect(Object.keys(queryNetworkResponse[0]), 'Array element should have datasets, offers, otObject').to.have.members(['dataset_id', 'offer_id', 'otObject']);
    // eslint-disable-next-line prefer-destructuring
    this.state.lastLocalQueryResponse = queryNetworkResponse[0];
});

Then(/^The last local query should return otObject from the last imported dataset$/, { timeout: 90000 }, function () {
    expect(this.state.lastLocalQueryResponse, 'Last local query not defined').to.not.be.equal(null);
    expect(!!this.state.lastImport, 'Nothing was imported. Use other step to do it.').to.be.equal(true);
    expect(!!this.state.lastImport.data.dataset_id, 'Last imports data set id seems not defined').to.be.equal(true);
    expect(Object.keys(this.state.lastLocalQueryResponse), 'Array element should have datasets, otObject').to.have.members(['dataset_id', 'offer_id', 'otObject']);
    expect(this.state.lastImport.data.dataset_id, 'otObject should be from the latest imported dataset').to.be.equal(this.state.lastLocalQueryResponse.dataset_id);
});

Given(/^the ([DV|DV2]+) purchases (last import|second last import) from the last query from (a DH|the DC|a DV)$/, function (whichDV, whichImport, fromWhom, done) {
    expect(whichDV, 'Query can be made either by DV or DV2.').to.satisfy(val => (val === 'DV' || val === 'DV2'));
    expect(whichImport, 'last import or second last import are only allowed values').to.be.oneOf(['last import', 'second last import']);
    whichImport = (whichImport === 'last import') ? 'lastImport' : 'secondLastImport';
    expect(!!this.state[whichDV.toLowerCase()], 'DV/DV2 node not defined. Use other step to define it.').to.be.equal(true);
    expect(!!this.state[whichImport], 'Nothing was imported. Use other step to do it.').to.be.equal(true);
    expect(this.state.lastQueryNetworkId, 'Query not published yet.').to.not.be.undefined;

    const { dc } = this.state;
    const dv = this.state[whichDV.toLowerCase()];
    const queryId = this.state.lastQueryNetworkId;
    const dataSetId = this.state[whichImport].data.dataset_id;
    let sellerNode;

    const confirmationsSoFar =
        dv.nodeConfirmsForDataSetId(queryId, dataSetId);

    expect(confirmationsSoFar).to.have.length.greaterThan(0);

    if (fromWhom === 'a DH') {
        // Find first DH that replicated last import.
        sellerNode = this.state.nodes.find(node => (node !== dc && node !== dv));
    } else if (fromWhom === 'the DC') {
        sellerNode = dc;
    } else if (fromWhom === 'a DV') {
        if (whichDV === 'DV') {
            console.log('DV cant buy from DV');
            process.exit(-1);
        }
        sellerNode = this.state.dv;
    }

    expect(sellerNode, 'Didn\'t find seller node.').to.not.be.undefined;
    const { replyId } =
        dv.state.dataLocationQueriesConfirmations[queryId][sellerNode.state.identity];

    expect(replyId).to.not.be.undefined;

    // Wait for purchase to happened and then exit.
    dv.once('dataset-purchase', (purchase) => {
        if (purchase.queryId === queryId &&
            purchase.replyId === replyId &&
            purchase.dataSetId === dataSetId) {
            this.logger.info(`${dv.state.identity} finished purchase for data-set ID ${dataSetId} from sellerNode ${sellerNode.state.identity}`);
            done();
        }
    });

    // Initiate actual purchase.
    httpApiHelper.apiReadNetwork(dv.state.node_rpc_url, queryId, replyId, dataSetId)
        .catch(error => done(error));
});

Given(/^([DC|DH|DV]+) calls consensus endpoint for sender: "(\S+)"$/, async function (nodeType, senderId) {
    expect(nodeType, 'Node type can only be DC, DH, DV.').to.be.oneOf(['DC', 'DH', 'DV']);

    const host = this.state[nodeType.toLowerCase()].state.node_rpc_url;

    const consensusResponse = await httpApiHelper.apiConsensus(host, senderId);
    expect(consensusResponse, 'Should have key called events').to.have.all.keys('events');
    this.state.lastConsensusResponse = consensusResponse;
});

Given(
    /^(DC|DH|DV2|DV) whitelists (DC|DH|DV2|DV) for object id: "(\S+)" in the last imported dataset$/,
    async function (dataOwner, viewer, objectId) {
        this.logger.log(`${dataOwner} whitelists ${viewer} for object id ${objectId} in the last imported dataset.`);

        expect(dataOwner, 'Whitelisting node can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);
        expect(viewer, 'Whitelisted node can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

        const host = this.state[dataOwner.toLowerCase()].state.node_rpc_url;
        const viewerState = this.state[viewer.toLowerCase()];
        const viewerErc725 = JSON.parse(fs.readFileSync(`${viewerState.options.configDir}/${viewerState.options.nodeConfiguration.blockchain.implementations[0].identity_filepath}`).toString());

        const requestBody = {
            ot_object_id: objectId,
            dataset_id: this.state.lastImport.data.dataset_id,
            viewer_erc_id: viewerErc725.identity,
        };

        const whitelistResponse = await httpApiHelper.apiWhitelistViewer(host, requestBody);
        expect(whitelistResponse, 'Should have keys called message and status').to.have.all.keys('message', 'status');
        const { message, status } = whitelistResponse;
        expect(message, 'Whitelist response message should not be undefined').to.not.be.undefined;
        expect(status, 'Whitelist response status should be SUCCESS').to.be.equal('SUCCESS');
    },
);

Given(/^(DC|DH|DV2|DV) gets the list of available datasets for trading$/, async function (targetNode) {
    this.logger.log(`${targetNode} gets the list of available datasets for trading.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const availableResponse = await httpApiHelper.apiPermissionedDataAvailable(host);
    expect(availableResponse[0], 'Should have keys called dataset, ot_objects, seller_erc_id, seller_node_id, timestamp')
        .to.have.all.keys('dataset', 'ot_objects', 'seller_identities', 'seller_node_id', 'timestamp');

    const { dataset, ot_objects, seller_node_id } = availableResponse[0];
    expect(this.state.lastImport.data.dataset_id).to.be.equal(dataset.id);
    this.state.availablePurchase = {
        data_set_id: dataset.id,
        seller_node_id,
        ot_object_id: ot_objects[0],
    };
});

Given(/^(DC|DH|DV2|DV) gets the price for the last imported dataset$/, async function (targetNode) {
    this.logger.log(`${targetNode} gets the price for the last imported dataset.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const { handler_id } = await httpApiHelper.apiPermissionedDataGetPrice(host, this.state.availablePurchase);
    await sleep.sleep(2000);
    const response = await httpApiHelper.apiPermissionedDataGetPriceResult(host, handler_id);

    expect(response, 'Should have keys called data and status').to.have.all.keys('data', 'status');
    expect(response.status).to.be.equal('COMPLETED');
});

Given(/^(DC|DH|DV2|DV) unsuccessfully gets the price for the last imported dataset$/, async function (targetNode) {
    this.logger.log(`${targetNode} gets the price for the last imported dataset.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const { handler_id } = await httpApiHelper.apiPermissionedDataGetPrice(host, this.state.availablePurchase);
    await sleep.sleep(2000);
    const response = await httpApiHelper.apiPermissionedDataGetPriceResult(host, handler_id);

    expect(response, 'Should have keys called data and status').to.have.all.keys('data', 'status');
    expect(response.status).to.be.equal('FAILED');
});


Given(/^(DC|DH|DV2|DV) initiates purchase for the last imported dataset and waits for confirmation$/, async function (targetNode) {
    this.logger.log(`${targetNode} initiates purchase for the last imported dataset and waits for confirmation.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const { handler_id } = await httpApiHelper.apiPermissionedDataPurchase(host, this.state.availablePurchase);
    this.state.lastPurchaseHandler = handler_id;

    this.state.lastQueryNetworkId = {};
    this.state[targetNode.toLowerCase()].state.purchasedDatasets = {};
    this.state[targetNode.toLowerCase()].state.purchasedDatasets[this.state.availablePurchase.data_set_id] = {};

    const source = this.state.dc;

    const promise = new Promise((acc, reject) => {
        source.once('purchase-confirmed', async (data) => {
            const target = this.state[targetNode.toLowerCase()];
            if (target.state.identity === data.dv_identity) { acc(); } else { reject(); }
        });
    });

    return promise;
});


Then(/^(DC|DH|DV2|DV) unsuccessfully initiates purchase for the last imported dataset$/, async function (targetNode) {
    this.logger.log(`${targetNode} initiates purchase for the last imported dataset and waits for confirmation.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);

    const host = this.state[targetNode.toLowerCase()].state.node_rpc_url;

    const { handler_id } = await httpApiHelper.apiPermissionedDataPurchase(host, this.state.availablePurchase);
    this.state.lastPurchaseHandler = handler_id;

    this.state.lastQueryNetworkId = {};
    this.state[targetNode.toLowerCase()].state.purchasedDatasets = {};
    this.state[targetNode.toLowerCase()].state.purchasedDatasets[this.state.availablePurchase.data_set_id] = {};

    const source = this.state.dc;

    const promise = new Promise((acc, reject) => {
        source.once('purchase-not-confirmed', async () => {
            acc();
        });
    });

    return promise;
});

Given(/^(DC|DH|DV2|DV) waits for purchase to finish$/, { timeout: 300000 }, async function (targetNode) {
    this.logger.log(`${targetNode} waits for purchase to finish.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const source = this.state[targetNode.toLowerCase()];

    const promise = new Promise((acc) => {
        source.once('purchase-completed', async () => {
            acc();
        });
    });


    return promise;
});


Then(/^The last export doesn't have permissioned data$/, async function () {
    expect(!!this.state.lastExport, 'Last export data not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.lastExport.status, 'Last export should be completed.').to.be.equal('COMPLETED');
    const { data } = this.state.lastExport;
    const properties = (JSON.parse(data.formatted_dataset)['@graph']).map(x => x.properties);
    for (const p of properties) {
        if (p.permissioned_data) {
            expect(p.permissioned_data).to.have.keys(['permissioned_data_hash']);
            expect(p.permissioned_data).to.not.have.keys(['data']);
        }
    }
});


Given(/^(DC|DH|DV2|DV) waits to take a payment$/, { timeout: 300000 }, async function (targetNode) {
    this.logger.log(`${targetNode} waits to take a payment.`);
    expect(targetNode, 'Node type can only be DC, DH, DV or DV2.').to.be.oneOf(['DC', 'DH', 'DV', 'DV2']);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const source = this.state[targetNode.toLowerCase()];

    const promise = new Promise((acc) => {
        source.once('purchase-payment-taken', async () => {
            acc();
        });
    });

    return promise;
});


Given(/^default initial token amount should be deposited on (\d+)(?:st|nd|rd|th) node's profile$/, async function (nodeIndex) {
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const balance = await httpApiHelper.apiBalance(this.state.nodes[nodeIndex - 1].state.node_rpc_url, false);
    const staked = new BN(balance[0].profile.staked);
    const initialDepositAmount = new BN(this.state.nodes[nodeIndex - 1].options.nodeConfiguration.initial_deposit_amount);

    expect(staked.toString()).to.be.equal(initialDepositAmount.toString());
});


Then(/^DC gets issuer id for element "([^"]*)"$/, { timeout: 120000 }, async function (elementId) {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const { dc } = this.state;
    const host = dc.state.node_rpc_url;

    this.state.elementIssuer = await httpApiHelper.apiGetElementIssuerIdentity(host, elementId);
});

Then(/^DC should be the issuer for the selected element$/, { timeout: 120000 }, function () {
    expect(!!this.state.dc, 'DC node not defined. Use other step to define it.').to.be.equal(true);
    expect(this.state.nodes.length, 'No started nodes').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes').to.be.greaterThan(0);

    const { dc } = this.state;

    for (const implementation of dc.options.nodeConfiguration.blockchain.implementations) {
        const erc725 = JSON.parse(fs.readFileSync(`${dc.options.configDir}/${implementation.identity_filepath}`).toString());
        expect(this.state.elementIssuer[0].identifiers[0].identifierValue.toUpperCase()).to.be.equal(erc725.identity.toUpperCase());
    }
});
