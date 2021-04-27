const BN = require('bn.js');
const Command = require('../command');
const Utilities = require('../../Utilities');
const Encryption = require('../../RSAEncryption');
const Models = require('../../../models/index');

/**
 * Handles replication request
 */
class DCReplicationSendCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.logger = ctx.logger;
        this.transport = ctx.transport;
        this.blockchain = ctx.blockchain;
        this.dcService = ctx.dcService;

        this.replicationService = ctx.replicationService;
        this.permissionedDataService = ctx.permissionedDataService;
        this.importService = ctx.importService;
        this.profileService = ctx.profileService;
    }

    /**
     * Creates an offer in the database
     * @param command
     * @returns {Promise<{commands}>}
     */
    async execute(command) {
        const {
            internalOfferId, wallet, identity, dhIdentity, offerId, blockchainId,
            replicationStartTime,
        } = command.data;

        // Check if the replication window expired
        if ((replicationStartTime + this.config.dc_choose_time) < Date.now()) {
            this.logger.debug(`Too late to send the replication for offer ${offerId} to ${identity}.`);
            return Command.empty();
        }

        const purposes = await this.blockchain
            .getWalletPurposes(dhIdentity, wallet, blockchainId).response;
        if (!purposes.includes('2')) {
            const message = 'Wallet provided does not have the appropriate permissions set up for the given identity.';
            this.logger.warn(message);
            // TODO Send some response to DH to avoid pointlessly waiting
            return Command.empty();
        }


        const usedDH = await Models.replicated_data.findOne({
            where: {
                dh_id: identity,
                dh_wallet: wallet,
                dh_identity: dhIdentity,
                offer_id: offerId,
            },
        });
        if (usedDH) {
            this.logger.warn(`Already sent replication data for offer ${offerId} to ${identity}`);
            return Command.empty();
        }

        const colorNumber = Utilities.getRandomInt(2);

        const color = this.replicationService.castNumberToColor(colorNumber);

        const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
        const replication = await this.replicationService.loadReplication(offer.id, color);

        await Models.replicated_data.create({
            dh_id: identity,
            dh_wallet: wallet.toLowerCase(),
            dh_identity: dhIdentity.toLowerCase(),
            offer_id: offer.offer_id,
            litigation_private_key: replication.litigationPrivateKey,
            litigation_public_key: replication.litigationPublicKey,
            distribution_public_key: replication.distributionPublicKey,
            distribution_private_key: replication.distributionPrivateKey,
            distribution_epk_checksum: replication.distributionEpkChecksum,
            litigation_root_hash: replication.litigationRootHash,
            distribution_root_hash: replication.distributionRootHash,
            distribution_epk: replication.distributionEpk,
            status: 'STARTED',
            color: colorNumber,
        });

        const toSign = [
            Utilities.denormalizeHex(new BN(replication.distributionEpkChecksum).toString('hex')),
            Utilities.denormalizeHex(replication.distributionRootHash),
        ];

        const { node_wallet, node_private_key } =
            this.blockchain.getWallet(offer.blockchain_id).response;
        const blockchainIdentity = this.profileService.getIdentity(offer.blockchain_id);

        const distributionSignature = Encryption
            .signMessage(toSign, Utilities.normalizeHex(node_private_key));

        const permissionedData = await this.permissionedDataService.getAllowedPermissionedDataMap(
            offer.data_set_id,
            identity,
        );

        const promises = [];
        for (const ot_object_id in permissionedData) {
            promises.push(this.importService.getOtObjectById(offer.data_set_id, ot_object_id));
        }

        const ot_objects = await Promise.all(promises);

        await this.permissionedDataService.attachPermissionedDataToMap(
            permissionedData,
            ot_objects,
        );

        const payload = {
            offer_id: offer.offer_id,
            blockchain_id: offer.blockchain_id,
            data_set_id: offer.data_set_id,
            dc_wallet: node_wallet,
            dcIdentity: blockchainIdentity,
            dcNodeId: this.config.network.identity,
            otJson: replication.otJson,
            permissionedData,
            litigation_public_key: replication.litigationPublicKey,
            distribution_public_key: replication.distributionPublicKey,
            distribution_private_key: replication.distributionPrivateKey,
            distribution_epk_checksum: replication.distributionEpkChecksum,
            litigation_root_hash: replication.litigationRootHash,
            distribution_root_hash: replication.distributionRootHash,
            distribution_epk: replication.distributionEpk,
            distribution_signature: distributionSignature.signature,
            transaction_hash: offer.transaction_hash,
            distributionSignature,
            color: colorNumber,
        };

        // send replication to DH
        const response = await this.transport.replicationData(payload, identity);

        if (response.status === 'fail') {
            this.logger.warn(`Sending replication data for offer ${offer.id} to ${identity} failed. ${response.message}`);
        } else {
            this.logger.info(`Successfully sent replication data for offer_id ${offer.offer_id} to node ${identity}.`);
        }

        return Command.empty();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dcReplicationSendCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DCReplicationSendCommand;
