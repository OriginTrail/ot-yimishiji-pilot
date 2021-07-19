const BN = require('../../../node_modules/bn.js/lib/bn');

const Command = require('../command');
const Utilities = require('../../Utilities');
const Models = require('../../../models/index');
const constants = require('../../constants');

/**
 * Repeatable command that checks whether offer is ready or not
 */
class DcOfferTaskCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.logger = ctx.logger;
        this.dcService = ctx.dcService;
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
            dataSetId,
            internalOfferId,
            handler_id,
            blockchain_id,
        } = command.data;

        const event = await Models.events.findOne({
            where: {
                event: 'OfferTask',
                data_set_id: Utilities.normalizeHex(dataSetId),
                blockchain_id,
                finished: 0,
            },
        });

        if (event) {
            const { dcNodeId } = JSON.parse(event.data);
            if (dcNodeId === Utilities.normalizeHex(this.config.identity.padStart(64, '0'))) {
                event.finished = 1;
                await event.save({ fields: ['finished'] });

                const data = JSON.parse(event.data);
                const {
                    task: eventTask,
                } = data;

                let {
                    offerId: eventOfferId,
                } = data;
                eventOfferId = Utilities.normalizeHex(eventOfferId);

                const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
                if (!offer) {
                    throw new Error(`Offer with ID ${eventOfferId} cannot be found.`);
                }
                offer.task = eventTask;
                offer.offer_id = eventOfferId;
                offer.replication_start_timestamp = Date.now()
                    .toString();
                offer.status = 'STARTED';
                offer.message = 'Offer has been successfully started. Waiting for DHs...';
                await offer.save({
                    fields: ['task', 'offer_id', 'replication_start_timestamp', 'status', 'message'],
                });

                this.remoteControl.offerUpdate({
                    id: internalOfferId,
                });
                const handler = await Models.handler_ids.findOne({
                    where: { handler_id },
                });
                const handler_data = JSON.parse(handler.data);
                handler_data.offer_id = offer.offer_id;
                handler_data.status = 'WAITING_FOR_HOLDERS';
                await Models.handler_ids.update(
                    {
                        data: JSON.stringify(handler_data),
                    },
                    {
                        where: { handler_id },
                    },
                );

                this.logger.trace(`Offer successfully started for data set ${dataSetId} on blockchain ${blockchain_id}. Offer ID ${eventOfferId}. Internal offer ID ${internalOfferId}.`);
                return this.continueSequence(this.pack(command.data), command.sequence);
            }
        }

        await Models.handler_ids.update({ timestamp: Date.now() }, { where: { handler_id } });
        return Command.repeat();
    }

    /**
     * Execute strategy when event is too late
     * @param command
     */
    async expired(command) {
        return this.invalidateOffer(
            command,
            Error('The offer task event is too late.'),
        );
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
        const { dataSetId, internalOfferId, handler_id } = command.data;
        this.logger.notify(`Offer for data set ${dataSetId} has not been started.`);

        const offer = await Models.offers.findOne({ where: { id: internalOfferId } });
        offer.status = 'FAILED';
        offer.global_status = 'FAILED';
        offer.message = `Offer for data set ${dataSetId} has not been started.`;
        await offer.save({ fields: ['status', 'message', 'global_status'] });
        this.remoteControl.offerUpdate({
            id: internalOfferId,
        });
        Models.handler_ids.update({
            status: 'FAILED',
        }, { where: { handler_id } });

        this.errorNotificationService.notifyError(
            err,
            {
                offerId: offer.offer_id,
                internalOfferId,
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
            name: 'dcOfferTaskCommand',
            delay: 0,
            period: 5000,
            deadline_at: Date.now() + (10 * 60 * 1000),
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DcOfferTaskCommand;
