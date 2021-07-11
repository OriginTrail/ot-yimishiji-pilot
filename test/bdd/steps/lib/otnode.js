const fs = require('fs');
const { execSync, spawn } = require('child_process');
const assert = require('assert');
const mkdirp = require('mkdirp');
const path = require('path');
const EventEmitter = require('events');
const deepExtend = require('deep-extend');
const tmpdir = require('os').tmpdir();
const uuidv4 = require('uuid/v4');
const stripAnsi = require('strip-ansi');
const lineReader = require('readline');

const defaultConfiguration = require('../../../../config/config.json').development;


const uuidRegex = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/gi;
const walletRegex = /\b0x[0-9a-fA-F]{40}\b/gi;
const identityRegex = /\b[0-9a-fA-F]{40}\b/gi;
const identityWithPrefixRegex = /\b0x[0-9a-fA-F]{40}\b/gi;
const offerIdRegex = /\b0x[0-9a-fA-F]{64}\b/gi;
const dataSetRegex = /\b0x[0-9a-fA-F]{64}\b/gi;
const walletAmountRegex = /\b\d+\b/g;

/**
 * OtNode represent small wrapper over a running OT Node.
 *
 * One instance of OtNode class handles one running node.
 */
class OtNode extends EventEmitter {
    constructor({ logger, nodeConfiguration, appDataBaseDir }) {
        super();

        this.id = uuidv4();
        this.options = {};
        this.options.configDir = path.join(appDataBaseDir || tmpdir, this.id);
        this.options.nodeConfiguration = nodeConfiguration || {};
        this.options.nodeConfiguration = deepExtend(
            {},
            defaultConfiguration,
            this.options.nodeConfiguration,
        );
        this.logger = logger || console;

        this.initialized = false;
        this.started = false;
    }

    initialize() {
        mkdirp.sync(this.options.configDir);
        this.configFilePath = path.join(this.options.configDir, 'initial-configuration.json');
        fs.writeFileSync(
            this.configFilePath,
            JSON.stringify(this.options.nodeConfiguration, null, 4),
        );
        execSync(`npm run setup -- --configDir=${this.options.configDir} --config ${this.configFilePath}`);

        if (this.options.identity) {
            fs.writeFileSync(
                path.join(this.options.configDir, 'identity.json'),
                JSON.stringify(this.options.identity),
            );
        }

        this.state = {};
        this.state.addedBids = []; // List of offer IDs (DH side).
        this.state.takenBids = []; // List of offer IDs (DH side).
        this.state.pendingLitigationDhIdentities = []; // List of pending litigations (DHs)
        this.state.penalizedDHIdentities = [];
        this.state.takenReplacements = []; // List of replacement offer IDs (DH side).
        // Valid replications (DH side). List of internal offer IDs and their replications DH IDs
        // in pairs. { internalOfferId, dhId }.
        this.state.replications = [];
        // Array of replacement offer IDs
        this.state.replacements = [];
        // Valid replications (DC side). List of objects { importId, dhWallet }.
        this.state.holdingData = [];
        // Offers finalized. List of offer IDs.
        this.state.offersFinalized = [];
        // grab node's wallet address
        this.state.nodesWalletAddress = null;

        // Dict of offers created:
        // { offerIDs: { id: { dataSetId, internalID },
        //  internalIDs: { id: { dataSetId, offerID } } }
        this.state.offers = {};

        this.state.oldWalletBalance = null;
        this.state.newWalletBalance = null;
        this.state.oldProfileBalance = null;
        this.state.newProfileBalance = null;

        // DV side. qeryId.dhIdentity = { replyId, dataSetIds: [...datasetIds] };
        this.state.dataLocationQueriesConfirmations = {};

        // DV side. datasetId = { queryId, replyId }
        this.state.purchasedDatasets = {};

        this.logger.log(`Node initialized at: '${this.options.configDir}'.`);
        this.initialized = true;
    }

    /**
     * Overrides node configuration
     * @param override - Configuration override
     */
    overrideConfiguration(override) {
        this.options.nodeConfiguration = deepExtend(this.options.nodeConfiguration, override);

        this.configFilePath = path.join(this.options.configDir, 'initial-configuration.json');
        fs.writeFileSync(
            this.configFilePath,
            JSON.stringify(this.options.nodeConfiguration, null, 4),
        );
        execSync(`npm run setup -- --configDir=${this.options.configDir} --config ${this.configFilePath}`);
        this.logger.log('Node configuration overridden.');
    }

    /**
     * Overrides node configuration using variables
     * @param override - Configuration override with variables
     */
    overrideConfigurationVariables(override) {
        for (const pair of override) {
            if (pair.length === 2) {
                const keyFrom = pair[1];
                const keyTo = pair[0];
                if (keyFrom in this.options.nodeConfiguration &&
                    keyTo in this.options.nodeConfiguration) {
                    this.options.nodeConfiguration[keyTo] = this.options.nodeConfiguration[keyFrom];
                }
            }
        }

        this.configFilePath = path.join(this.options.configDir, 'initial-configuration.json');
        fs.writeFileSync(
            this.configFilePath,
            JSON.stringify(this.options.nodeConfiguration, null, 4),
        );
        execSync(`npm run setup -- --configDir=${this.options.configDir} --config ${this.configFilePath}`);
        this.logger.log('Node configuration overridden.');
    }

    /**
     * Removes node configuration keys
     * @param keys - Configuration keys to be removed
     */
    removeConfigurationKeys(keys) {
        for (const key of keys) {
            if (key in this.options.nodeConfiguration) {
                delete this.options.nodeConfiguration[key];
            }
        }

        this.configFilePath = path.join(this.options.configDir, 'initial-configuration.json');
        fs.writeFileSync(
            this.configFilePath,
            JSON.stringify(this.options.nodeConfiguration, null, 4),
        );
        execSync(`npm run setup -- --configDir=${this.options.configDir} --config ${this.configFilePath}`);
        this.logger.log('Node configuration keys removed.');
    }

    start() {
        assert(!this.process);
        assert(this.initialized);
        assert(!this.stared);
        this.logger.log(`Starting node ${this.id}.`);

        // Temp solution until node.log is moved to the configDir.
        this.logStream = fs.createWriteStream(
            path.join(this.options.configDir, 'node-cucumber.log'),
            { flags: 'a+' },
        );

        // Starting node should be done with following code:
        // this.process = spawn('npm', ['start', '--', `--configDir=${this.options.configDir}`]);
        // The problem is with it spawns two child process thus creating the problem when
        // sending the SIGINT in order to close it.
        // Enable debug here process.env.NODE_DEBUG = 'https';
        this.process = spawn(
            'node',
            ['ot-node.js', `--configDir=${this.options.configDir}`, '--config', `${this.configFilePath}`],
            { cwd: path.join(__dirname, '../../../../') },
        );
        this.process.on('close', code => this._processExited(code));
        this.process.stdout.on('data', data => this.logStream.write(data));
        this.process.stderr.on('data', data => this.logStream.write(data));

        this.lineReaderStdOut = lineReader.createInterface({
            input: this.process.stdout,
        });
        this.lineReaderStdOut.on('line', data => this._processOutput(data));
        this.lineReaderStdErr = lineReader.createInterface({
            input: this.process.stderr,
        });
        this.lineReaderStdErr.on('line', data => this._processOutput(data));
        this.logger.log(`Node '${this.id}' has been started.`);
        this.started = true;
    }

    stop() {
        this.logger.log(`Stopping node ${this.id}.`);
        assert(this.isRunning);
        this.started = false;
        this.process.kill('SIGINT');
    }

    _processOutput(data) {
        let line = stripAnsi(data.toString());
        line = line.replace(/[^\x20-\x7E]+/g, '');

        if (line.includes('======================================================')) {
            this.emit('started');
        } else if (line.includes('OT Node started')) {
            this.logger.log(`Node ${this.id} initialized.`);
            this.state.initialized = true;
            this.emit('initialized');
        } else if (line.includes('My network identity: ')) {
            // Expected something like:
            // 'My network identity: f299588d23ebbdc2da51ad423e03d66721ac0e18'
            [this.state.identity] = line.match(identityRegex);
            // OT Node listening at https://f63f6c1e9425e79726e26cff0808659ddd16b417.diglet.origintrail.io:443
        } else if (line.includes('API exposed at')) {
            // Expected something like:
            // API exposed at  http://0.0.0.0:8920
            // TODO: Poor man's parsing. Use regular expressions.
            this.state.node_rpc_url = line.substr(line.search('API exposed at  ') + 'API exposed at  '.length, line.length - 1);
        } else if (line.includes('OT Node listening at ')) {
            // Expected something like:
            // OT Node listening at https://f63f6c1e9425e79726e26cff0808659ddd16b417.diglet.origintrail.io:443
            // TODO: Poor man's parsing. Use regular expressions.
            this.state.node_url = line.substr(line.search('OT Node listening at ') + 'OT Node listening at '.length, line.length - 1);
        } else if (line.match(/Import complete/gi)) {
            this.emit('import-complete');
        } else if (line.match(/Import already executed for dataset .+/gi)) {
            this.emit('import-duplicated');
        } else if (line.match(/Trail complete.*/gi)) {
            this.emit('trail-complete');
        } else if (line.match(/Public key request received/gi)) {
            this.emit('public-key-request');
        } else if (line.match(/Export complete.*/gi)) {
            this.emit('export-complete');
        } else if (line.match(/.*\[DH] Replication finished for offer_id .+/gi)) {
            const offerId = line.match(offerIdRegex)[0];
            assert(offerId);
            this.state.addedBids.push(offerId);
            this.emit('replication-finished', offerId);
        } else if (line.match(/I've been chosen for offer .+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
            this.state.takenBids.push(offerId);
        } else if (line.match(/Successfully sent replication data for offer_id .+ to node .+\./gi)) {
            const offer_id = line.match(offerIdRegex)[0];
            const dhId = line.match(identityRegex)[0];
            assert(offer_id);
            assert(dhId);
            this.state.replications.push({ offer_id, dhId });
            this.emit('dh-replicated', { offer_id, dhId });
        } else if (line.includes('Get profile by wallet ')) {
            // note that node's wallet can also be access via nodeConfiguration directly
            const wallet = line.match(walletRegex)[0];
            assert(wallet);
            this.state.nodesWalletAddress = wallet;
        } else if (line.match(/Offer successfully started for data set .+\. Offer ID .+\. Internal offer ID .+\./gi)) {
            const dataSetId = line.match(dataSetRegex)[0];
            const offerId = line.match(offerIdRegex)[1];
            const internalOfferId = line.match(uuidRegex)[0];
            assert(dataSetId);
            assert(offerId);
            assert(internalOfferId);

            deepExtend(this.state.offers, {
                offerIDs: { [offerId]: { dataSetId, internalOfferId } },
                internalIDs: { [internalOfferId]: { dataSetId, offerId } },
            });
        } else if (line.match(/Miner started for offer .+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
        } else if (line.match(/Miner found a solution of offer .+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
        } else if (line.match(/Not enough DHs submitted/gi)) {
            this.emit('not-enough-dhs');
        } else if (line.match(/.*Offer .+ finalized.*/gi)) {
            const offerId = line.match(offerIdRegex)[0];
            assert(offerId);
            this.state.offersFinalized.push(offerId);
            this.emit('offer-finalized', offerId);
        } else if (line.match(/.*Command dvHandleNetworkQueryResponsesCommand and ID .+ processed/gi)) {
            this.emit('dv-network-query-processed');
        } else if (line.match(/DH .+ in query ID .+ and reply ID .+ confirms possession of data imports: '.+'/)) {
            const identity = line.match(identityRegex)[0];
            const queryId = line.match(uuidRegex)[0];
            const replyId = line.match(uuidRegex)[1];
            const dataSetIds = line.match(dataSetRegex);
            assert(identity);
            assert(queryId);
            assert(replyId);
            assert(dataSetIds);

            if (!this.state.dataLocationQueriesConfirmations[queryId]) {
                this.state.dataLocationQueriesConfirmations[queryId] = {};
            }
            if (!this.state.dataLocationQueriesConfirmations[queryId][identity]) {
                this.state.dataLocationQueriesConfirmations[queryId][identity] = {
                    dataSetIds: [],
                };
            }

            this.state.dataLocationQueriesConfirmations[queryId][identity].dataSetIds
                .push(...dataSetIds);
            this.state.dataLocationQueriesConfirmations[queryId][identity].replyId = replyId;
            this.emit(
                'dh-confirms-imports',
                {
                    queryId, identity, dataSetIds, replyId,
                },
            );
        } else if (line.match(/DataSet .+ purchased for query ID .+ reply ID .+\./)) {
            const queryId = line.match(uuidRegex)[0];
            const replyId = line.match(uuidRegex)[1];
            const dataSetId = line.match(dataSetRegex)[0];
            assert(queryId);
            assert(replyId);
            assert(dataSetId);

            this.state.purchasedDatasets[dataSetId] = { queryId, replyId };
            this.emit(
                'dataset-purchase',
                {
                    queryId, replyId, dataSetId,
                },
            );
        } else if (line.match(/Token withdrawal for amount .+ initiated/gi)) {
            this.emit('withdraw-initiated');
        } else if (line.match(/Token withdrawal for amount .+ completed/gi)) {
            this.emit('withdraw-completed');
        } else if (line.match(/Command tokenWithdrawalCommand and ID .+ processed/gi)) {
            this.emit('withdraw-command-completed');
        } else if (line.match(/New profile balance: .+ TRAC/gi)) {
            const result1 = line.match(walletAmountRegex);
            this.state.newProfileBalance = result1[result1.length - 1];
        } else if (line.match(/New wallet balance: .+ TRAC/gi)) {
            const result2 = line.match(walletAmountRegex);
            this.state.newWalletBalance = result2[result2.length - 1];
            assert(this.state.newWalletBalance);
        } else if (line.match(/Old profile balance: .+ TRAC/gi)) {
            const result3 = line.match(walletAmountRegex);
            this.state.oldProfileBalance = result3[result3.length - 1];
            assert(this.state.oldProfileBalance);
        } else if (line.match(/Old wallet balance: .+ TRAC/gi)) {
            const result4 = line.match(walletAmountRegex);
            this.state.oldWalletBalance = result4[result4.length - 1];
            assert(this.state.oldWalletBalance);
        } else if (line.match(/Command profileApprovalIncreaseCommand and ID .+ processed/gi)) {
            this.emit('deposit-approved');
        } else if (line.match(/Command depositTokensCommand and ID .+ processed/gi)) {
            this.emit('deposit-command-completed');
        } else if (line.match(/Replication window for .+ is closed\. Replicated to .+ peers\. Verified .+\./gi)) {
            this.emit('replication-window-closed');
        } else if (line.match(/.*Offer with internal ID .+ for data set .+ written to blockchain .+\. Waiting for DHs\.\.\./gi)) {
            this.emit('offer-written-blockchain');
        } else if (line.match(/Command dhPayOutCommand and ID .+ processed\./gi)) {
            this.emit('dh-pay-out-finalized');
        } else if (line.match(/Accepting offer with price: .+ TRAC\./gi)) {
            const result = line.match(walletAmountRegex);
            this.state.calculatedOfferPrice = result[result.length - 1];
        } else if (line.match(/Payout for offer .+ successfully completed.+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
            this.emit(`dh-pay-out-offer-${offerId}-completed`);
        } else if (line.match(/Command dhOfferFinalizedCommand and ID .+ processed\./gi)) {
            this.emit('dh-offer-finalized');
        } else if (line.match(/Litigation initiated for DH .+ and offer .+\./gi)) {
            this.state.litigationStatus = 'LITIGATION_STARTED';
            this.emit('dc-litigation-initiated');
        } else if (line.match(/Litigation answered for DH .+ and offer .+\./gi)) {
            this.emit('dc-litigation-answered');
        } else if (line.match(/Litigation answered for offer .+\. DH identity .+/gi)) {
            this.emit('dh-litigation-answered');
        } else if (line.match(/Litigation completed for DH .+ and offer .+\./gi)) {
            this.state.litigationStatus = 'LITIGATION_COMPLETED';
            this.emit('dc-litigation-completed');
        } else if (line.match(/Litigation already in progress\.\.\. It needs to be completed in order to litigate .+ for offer .+/gi)) {
            const dhIdentity = line.match(identityWithPrefixRegex)[0];
            this.state.pendingLitigationDhIdentities.push(dhIdentity);
            this.emit('dc-litigation-pending');
        } else if (line.match(/DH .+ was penalized for the offer .+\./gi)) {
            const dhIdentity = line.match(identityWithPrefixRegex)[0];
            this.state.penalizedDHIdentities.push(dhIdentity);
            this.emit('dc-litigation-completed-dh-penalized');
        } else if (line.match(/DH .+ was not penalized for the offer .+\./gi)) {
            this.emit('dc-litigation-completed-dh-not-penalized');
        } else if (line.match(/Replacement for DH .+ and offer .+ has been successfully started. Waiting for DHs\.\.\./gi)) {
            this.emit('dc-litigation-replacement-started');
        } else if (line.match(/Replacement triggered for offer .+\. Litigator .+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
            this.state.replacements.push(offerId);
        } else if (line.match(/\[DH] Replacement replication finished for offer ID .+/gi)) {
            const offerId = line.match(offerIdRegex)[0];
            assert(offerId);
            this.state.takenReplacements.push(offerId);
            this.emit('dh-litigation-replacement-received');
        } else if (line.match(/Successfully replaced DH .+ with DH .+ for offer .+/gi)) {
            this.emit('dc-litigation-replacement-completed');
        } else if (line.match(/Calculated answer for dataset .+, color .+, object index .+, and block index .+ is .+/gi)) {
            const answer =
                line.match(/Calculated answer for dataset .+, color .+, object index .+, and block index .+ is .+/gi)[0]
                    .match(new RegExp('is (.*)'))[1];
            this.emit('dh-challenge-sent', answer);
        } else if (line.match(/Sending challenge to .+ Offer ID .+, object_index .+, block_index .+/gi)) {
            const dhIdentity = line.match(/Sending challenge to .+ Offer ID .+, object_index .+, block_index .+/gi)[0].match(new RegExp('to (.*). Offer ID'))[1];
            this.emit(`dc-challenge-sent-${dhIdentity}`);
        } else if (line.match(/Challenge response arrived for challenge .+\. Answer .+/gi)) {
            const answer = line.match(/Challenge response arrived for challenge .+\. Answer .+/gi)[0].match(new RegExp('Answer (.*)'))[1];
            this.emit(`dc-challenge-verified-${answer}`);
        } else if (line.match(/Not chosen as a replacement for offer .+\./gi)) {
            this.emit('dh-not-chosen-as-replacement');
        } else if (line.match(/Chosen as a replacement for offer .+\./gi)) {
            const offerId = line.match(offerIdRegex)[0];
            this.state.takenBids.push(offerId);
            this.emit('dh-chosen-as-replacement');
        } else if (line.match(/Replication finished for DH node .+/gi)) {
            const nodeId = line.match(identityRegex)[0];
            this.emit('dh-replication-verified', nodeId);
        } else if (line.match(/Replication request from holder identity .+ declined! Unacceptable reputation: .+./gi)) {
            const dhIdentity = line.match(identityWithPrefixRegex)[0];
            this.state.declinedDhIdentity = dhIdentity;
        } else if (line.match(/Purchase confirmed for ot_object .+ received from .+\. Sending purchase response\./gi)) {
            const ot_object_id = line.match(new RegExp('ot_object (.*) received'))[1];
            const dv_identity = line.match(new RegExp('from (.*)\\. Sending purchase response\\.'))[1];
            this.emit('purchase-confirmed', { ot_object_id, dv_identity });
        } else if (line.match(/Failed to confirm purchase request\..+/gi)) {
            this.emit('purchase-not-confirmed');
        } else if (line.match(/Purchase .+ completed\. Data stored successfully/gi)) {
            this.emit('purchase-completed');
        } else if (line.match(/Payment has been taken for purchase .+/gi)) {
            this.emit('purchase-payment-taken');
        } else if (line.match(/Failed to initialize profile on blockchain .+/gi)) {
            this.emit('profile-initialize-failed');
        }
    }

    /**
     * Returns weather the process is running or not.
     * @return {boolean}
     */
    get isRunning() {
        return this.initialized && this.started && !!this.process;
    }

    /**
     * Retruns path to the system.db.
     * @return {string} Path.
     */
    get systemDbPath() {
        return path.join(this.options.configDir, 'system.db');
    }

    get erc725Identity() {
        return JSON.parse(fs.readFileSync(path.join(
            this.options.configDir,
            'erc725_identity.json',
        ))).identity;
    }

    /**
     * Returns array of node IDs of nodes that confirmed possession of the data for
     * the given query,
     *
     * @param queryId {string} ID of the query.
     * @param dataSetId {string} ID of the data-set.
     * @return {string[]}
     */
    nodeConfirmsForDataSetId(queryId, dataSetId) {
        const result = [];
        if (this.state.dataLocationQueriesConfirmations[queryId]) {
            const queryConfirms = this.state.dataLocationQueriesConfirmations[queryId];
            Object.keys(queryConfirms).forEach((nodeId) => {
                if (queryConfirms[nodeId].dataSetIds.includes(dataSetId)) {
                    result.push(nodeId);
                }
            });
        }
        return result;
    }

    _processExited(code) {
        if (code !== 0) {
            throw Error(`Node '${this.options.configDir}' exited with ${code}.`);
        }
        this.process = null;
        this.logStream.end();
        this.logger.log(`Node ${this.id} finished. Exit code ${code}.`);
        this.emit('finished', code);
    }
}

module.exports = OtNode;
