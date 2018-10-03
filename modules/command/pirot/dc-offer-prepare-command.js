const path = require('path');

const MerkleTree = require('../../Merkle');
const Utilities = require('../../Utilities');
const Challenge = require('../../Challenge');
const Encryption = require('../../Encryption');
const ImportUtilities = require('../../ImportUtilities');

const Command = require('../command');

/**
 * Supported versions of the same data set
 * @type {{RED: string, BLUE: string, GREEN: string}}
 */
const COLOR = {
    RED: 'red',
    BLUE: 'blue',
    GREEN: 'green',
};

/**
 * Prepare offer parameters (litigation hashes, etc.)
 */
class DCOfferPrepareCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.graphStorage = ctx.graphStorage;
    }

    /**
     * Creates an offer in the database
     * @param command
     * @returns {Promise<{commands}>}
     */
    async execute(command) {
        const {
            offerId,
            dataSetId,
        } = command.data;

        const [edges, vertices] = await Promise.all([
            this.graphStorage.findEdgesByImportId(dataSetId),
            this.graphStorage.findVerticesByImportId(dataSetId),
        ]);

        const filteredVertices = ImportUtilities.immutableFilterClassVertices(vertices);

        const distLitRootHashes = (await Promise.all([COLOR.RED, COLOR.BLUE, COLOR.GREEN]
            .map(async (color) => {
                const colorDirPath = path.join(
                    this.config.appDataPath,
                    this.config.dataSetStorage, offerId,
                );

                const keyPair = Encryption.generateKeyPair(512);
                const encVertices = ImportUtilities.immutableEncryptVertices(
                    filteredVertices,
                    keyPair.privateKey,
                );

                const litigationBlocks = Challenge.getBlocks(encVertices, 32);
                const litigationBlocksMerkleTree = new MerkleTree(litigationBlocks);
                const litigationRootHash = litigationBlocksMerkleTree.getRoot();

                const distributionRootHash = (await ImportUtilities.merkleStructure(
                    filteredVertices,
                    edges,
                )).tree.getRoot();

                const objectClassVertices = await this.graphStorage.findObjectClassVertices();
                const colorInfo = {
                    edges,
                    vertices: encVertices.concat(objectClassVertices),
                    privateKey: keyPair.privateKey,
                    publicKey: keyPair.publicKey,
                    litigationRootHash,
                    distributionRootHash,
                };
                await Utilities.writeContentsToFile(
                    colorDirPath, `${color}.json`,
                    JSON.stringify(colorInfo, null, 2),
                );

                const hashes = {};
                hashes[`${color}LitigationHash`] = litigationRootHash;
                hashes[`${color}DistributionHash`] = distributionRootHash;
                return hashes;
            }))).reduce((acc, value) => Object.assign(acc, value));

        const { data } = command;
        Object.assign(data, distLitRootHashes);
        return this.continueSequence(data, command.sequence);
    }

    /**
     * Builds default dcOfferPrepareCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dcOfferPrepareCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DCOfferPrepareCommand;
