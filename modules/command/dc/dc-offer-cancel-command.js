const Models = require('../../../models/index');
const Command = require('../command');

const { Op } = Models.Sequelize;

class DCOfferCancelCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.blockchain = ctx.blockchain;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const { importId } = command.data;

        // Check if offer already exists
        const oldOffer = await this.blockchain.getOffer(importId);
        if (oldOffer[0] !== '0x0000000000000000000000000000000000000000') {
            if (oldOffer.finalized) {
                throw new Error(`Offer for ${importId} already exists. Offer is finalized therefore cannot be cancelled.`);
            }
            this.logger.info(`Offer for ${importId} already exists. Cancelling offer...`);
            await this.blockchain.cancelOffer(importId).catch((error) => {
                throw new Error(`Cancelling offer failed. ${error}.`);
            });
            // cancel challenges for cancelled offer
            await Models.replicated_data.update(
                { status: 'CANCELLED' },
                { where: { import_id: importId } },
            );
            // update offer to CANCELLED
            await Models.offers.update(
                { status: 'CANCELLED' },
                { where: { import_id: importId, status: { [Op.not]: 'FINALIZED' } } },
            );
        }
        this.logger.notify(`Offer ${importId} successfully cancelled.`);
        return this.continueSequence(this.pack(command.data), command.sequence);
    }

    /**
     * Builds default AddCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dcOfferCancel',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DCOfferCancelCommand;
