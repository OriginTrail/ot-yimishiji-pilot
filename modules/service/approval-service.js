const fs = require('fs');
const BN = require('bn.js');
const path = require('path');

const Utilities = require('../Utilities');

class ApprovalService {
    /**
     * Default constructor
     * @param ctx
     */
    constructor(ctx) {
        this.logger = ctx.logger;
        this.blockchain = ctx.blockchain;
        this.approvedNodes = [];
    }

    /**
     * Load all nodes currently approved for functioning on the network
     */
    async initialize() {
        const allNodes = await this.blockchain.getAddedNodes();
        var approvedNodes = [];

        var promises = [];
        for (var i = allNodes.length - 1; i >= 0; i -= 1) {
            promises[i] = this.blockchain.nodeHasApproval(allNodes[i]);
        }
        const nodeApproved = await Promise.all(promises);

        for (i = 0; i < allNodes.length; i += 1) {
            if (nodeApproved[i] === true) {
                allNodes[i] = allNodes[i].toLowerCase();
                allNodes[i] = Utilities.normalizeHex(allNodes[i]);
                if (allNodes[i].length > 42) {
                    allNodes[i] = allNodes[i].substr(-40, 40);
                    allNodes[i] = Utilities.normalizeHex(allNodes[i]);
                }
                if (approvedNodes.indexOf(allNodes[i]) === -1) {
                    approvedNodes.push(allNodes[i]);
                }
            }
        }
        this.approvedNodes = approvedNodes;
    }

    /**
     * Return all nodes currently approved for functioning on the network
     */
    getApprovedNodes() {
        return this.approvedNodes;
    }

    /**
     * Add a single node to the approved nodes
     * @param nodeId
     */
    addApprovedNode(nodeId) {
        nodeId = nodeId.toLowerCase();
        nodeId = Utilities.normalizeHex(nodeId);
        if (nodeId.length > 42) {
            nodeId = nodeId.substr(-40, 40);
            nodeId = Utilities.normalizeHex(nodeId);
        }
        this.logger.trace(`Addding node ${nodeId} to approved list`);
        if (this.approvedNodes.indexOf(nodeId) === -1) {
            this.approvedNodes.push(nodeId);
        }
    }

    /**
     * Remove a signle node from the approved nodes
     * @param nodeId
     */
    removeApprovedNode(nodeId) {
        nodeId = nodeId.toLowerCase();
        nodeId = Utilities.normalizeHex(nodeId);
        if (nodeId.length > 42) {
            nodeId = nodeId.substr(-40, 40);
            nodeId = Utilities.normalizeHex(nodeId);
        }
        const index = this.approvedNodes.indexOf(nodeId);
        if (index > -1) {
            this.logger.trace(`Removing node ${nodeId} from approved list`);
            this.approvedNodes.splice(index, 1);
        }
    }

    isApproved(nodeId) {
        nodeId = nodeId.toLowerCase();
        nodeId = Utilities.normalizeHex(nodeId);
        if (nodeId.length > 42) {
            nodeId = nodeId.substr(-40, 40);
            nodeId = Utilities.normalizeHex(nodeId);
        }
        return (this.approvedNodes.indexOf(nodeId) !== -1);
    }
}

module.exports = ApprovalService;
