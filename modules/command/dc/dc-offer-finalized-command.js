const { forEach } = require('p-iteration');

const Command = require('../command');
const Utilities = require('../../Utilities');
const ImportUtilities = require('../../ImportUtilities');
const Models = require('../../../models/index');
const constants = require('../../constants');
const OtJsonUtilities = require('../../OtJsonUtilities');

const { Op } = Models.Sequelize;

/**
 * Repeatable command that checks whether offer is ready or not
 */
class DcOfferFinalizedCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.graphStorage = ctx.graphStorage;
        this.dcService = ctx.dcService;
        this.challengeService = ctx.challengeService;
        this.replicationService = ctx.replicationService;
        this.remoteControl = ctx.remoteControl;
        this.errorNotificationService = ctx.errorNotificationService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            offerId, nodeIdentifiers, handler_id, blockchain_id,
        } = command.data;

        const events = await Models.events.findAll({
            where: {
                event: 'OfferFinalized',
                finished: 0,
                blockchain_id,
            },
        });
        if (events) {
            const event = events.find((e) => {
                const {
                    offerId: eventOfferId,
                } = JSON.parse(e.data);
                return Utilities.compareHexStrings(offerId, eventOfferId);
            });
            if (event) {
                event.finished = 1;
                await event.save({ fields: ['finished'] });

                this.logger.important(`Offer ${offerId} finalized on blockchain ${blockchain_id}`);

                const handler = await Models.handler_ids.findOne({
                    where: { handler_id },
                });
                const handler_data = JSON.parse(handler.data);
                handler_data.status = 'FINALIZED';
                handler_data.holders = nodeIdentifiers;
                await Models.handler_ids.update(
                    {
                        data: JSON.stringify(handler_data),
                        status: 'COMPLETED',
                    },
                    {
                        where: { handler_id },
                    },
                );
                const replications = await Models.replicated_data.count({
                    where: {
                        offer_id: offerId,
                        status: {
                            [Op.in]: ['STARTED', 'VERIFIED'],
                        },
                    },
                });
                const verifiedReplications = await Models.replicated_data.count({
                    where: {
                        offer_id: offerId,
                        status: {
                            [Op.in]: ['VERIFIED'],
                        },
                    },
                });

                const offer =
                    await Models.offers.findOne({ where: { offer_id: offerId, blockchain_id } });
                offer.status = 'FINALIZED';
                offer.global_status = 'ACTIVE';
                offer.number_of_replications = replications;
                offer.number_of_verified_replications = verifiedReplications;
                offer.message = 'Offer has been finalized. Offer is now active.';
                await offer.save({ fields: ['status', 'message', 'global_status', 'number_of_replications', 'number_of_verified_replications'] });
                this.remoteControl.offerUpdate({
                    offer_id: offerId,
                });

                await this._setHolders(offer, event);

                // clear old replicated data
                await Models.replicated_data.destroy({
                    where: {
                        offer_id: offerId,
                        status: {
                            [Op.in]: ['STARTED', 'VERIFIED'],
                        },
                    },
                });

                const delayOnComplete = 5 * 60 * 1000; // 5 minutes
                const scheduledTime = (offer.holding_time_in_minutes * 60 * 1000) + delayOnComplete;
                return {
                    commands: [
                        {
                            name: 'dcOfferCleanupCommand',
                            data: {
                                offerId,
                                blockchain_id,
                            },
                            delay: scheduledTime,
                        },
                    ],
                };
            }
        }

        await Models.handler_ids.update({ timestamp: Date.now() }, { where: { handler_id } });
        return Command.repeat();
    }

    /**
     * Update DHs to Holders
     * @param offer - Offer
     * @param event - OfferFinalized event
     * @return {Promise<void>}
     * @private
     */
    async _setHolders(offer, event) {
        const {
            holder1,
            holder2,
            holder3,
        } = JSON.parse(event.data);

        const startTime = Date.now();
        const endTime = startTime + (offer.holding_time_in_minutes * 60 * 1000);

        const holders = [holder1, holder2, holder3].map(h => Utilities.normalizeHex(h));
        await forEach(holders, async (holder) => {
            const replicatedData = await Models.replicated_data.findOne({
                where: {
                    offer_id: offer.offer_id,
                    dh_identity: holder,
                },
            });
            replicatedData.status = 'HOLDING';
            await replicatedData.save({ fields: ['status'] });

            const encryptionColor = this.replicationService.castNumberToColor(replicatedData.color);

            const encryptedDataset =
                (await this.replicationService.loadReplication(offer.id, encryptionColor)).otJson;


            let sortedDataset =
                OtJsonUtilities.prepareDatasetForGeneratingLitigationProof(encryptedDataset);
            if (!sortedDataset) {
                sortedDataset = encryptedDataset;
            }
            const challenges = this.challengeService.generateChallenges(
                sortedDataset['@graph'], startTime,
                endTime, this.config.numberOfChallenges,
            );

            await forEach(challenges, async challenge =>
                Models.challenges.create({
                    dh_id: replicatedData.dh_id,
                    dh_identity: replicatedData.dh_identity,
                    data_set_id: offer.data_set_id,
                    test_index: challenge.testIndex,
                    object_index: challenge.objectIndex,
                    block_index: challenge.blockIndex,
                    expected_answer: challenge.answer,
                    start_time: challenge.time,
                    offer_id: offer.offer_id,
                    blockchain_id: offer.blockchain_id,
                    status: 'PENDING',
                }));
        });
        await this.replicationService.cleanup(offer.id);
    }

    /**
     * Execute strategy when event is too late
     * @param command
     */
    async expired(command) {
        return this.invalidateOffer(command);
    }

    /**
     * Recover system from failure
     * @param command
     * @param err
     */
    async recover(command, err) {
        return this.invalidateOffer(command, err);
    }

    async invalidateOffer(command, err) {
        const { offerId, handler_id } = command.data;
        this.logger.notify(`Offer ${offerId} has not been finalized.`);

        const offer = await Models.offers.findOne({ where: { offer_id: offerId } });
        offer.status = 'FAILED';
        offer.global_status = 'FAILED';
        offer.message = `Offer for ${offerId} has not been finalized.`;
        await offer.save({ fields: ['status', 'message', 'global_status'] });
        this.remoteControl.offerUpdate({
            offer_id: offerId,
        });
        await Models.handler_ids.update({
            status: 'FAILED',
        }, { where: { handler_id } });

        this.errorNotificationService.notifyError(
            err,
            {
                offerId: offer.offer_id,
                tokenAmountPerHolder: offer.token_amount_per_holder,
                litigationIntervalInMinutes: offer.litigation_interval_in_minutes,
                datasetId: offer.data_set_id,
                holdingTimeInMinutes: offer.holding_time_in_minutes,
            },
            constants.PROCESS_NAME.offerHandling,
        );

        await this.replicationService.cleanup(offer.id);
        return Command.empty();
    }

    /**
     * Builds default AddCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dcOfferFinalizedCommand',
            delay: 0,
            period: 5000,
            deadline_at: Date.now() + (5 * 60 * 1000),
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DcOfferFinalizedCommand;
