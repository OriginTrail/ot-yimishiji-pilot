const Command = require('../command');
const Utilities = require('../../Utilities');
const Models = require('../../../models');

/**
 * Handles data location response.
 */
class DvPurchaseRequestCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.logger = ctx.logger;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     * @param transaction
     */
    async execute(command, transaction) {
        const {
            data_set_id,
            handler_id,
            ot_object_id,
            seller_node_id,
        } = command.data;

        const dataSeller = await Models.data_sellers.findOne({
            where: {
                data_set_id,
                ot_json_object_id: ot_object_id,
                seller_node_id,
            },
        });

        if (!dataSeller) {
            this.logger.error(`Unable to find data seller info with params: ${data_set_id}, ${ot_object_id}, ${seller_node_id}`);
            // todo update handler ids table with failed status
            return Command.empty();
        }

        const dataTrade = await Models.data_trades.findOne({
            where: {
                data_set_id,
                ot_json_object_id: ot_object_id,
            },
        });

        if (!dataTrade && dataTrade.status !== 'FAILED') {
            this.logger.error(`Data purchase already completed or in progress! Previous purchase status: ${dataTrade.status}`);
            // todo update handler ids table with failed status
            return Command.empty();
        }

        await Models.data_trades.create({
            data_set_id,
            ot_json_object_id: ot_object_id,
            buyer_node_id: this.config.identity,
            buyer_erc_id: this.config.erc725Identity.toLowerCase(),
            seller_node_id,
            seller_erc_id: dataSeller.seller_erc_id,
            price: dataSeller.price,
            status: 'REQUESTED',
        });

        const message = {
            data_set_id,
            dv_erc725_identity: this.config.erc725Identity,
            handler_id,
            ot_object_id,
            price: dataSeller.price,
            wallet: this.config.node_wallet,
        };
        const dataPurchaseRequestObject = {
            message,
            messageSignature: Utilities.generateRsvSignature(
                JSON.stringify(message),
                this.web3,
                this.config.node_private_key,
            ),
        };

        await this.transport.sendDataPurchaseRequest(
            dataPurchaseRequestObject,
            seller_node_id,
        );

        return Command.empty();
    }

    /**
     * Builds default DvPurchaseRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dvPurchaseRequestCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DvPurchaseRequestCommand;