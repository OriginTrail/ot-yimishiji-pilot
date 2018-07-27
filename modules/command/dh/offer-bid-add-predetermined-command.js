const Command = require('../command');
const BN = require('../../../node_modules/bn.js/lib/bn');

class OfferBidAddPredeterminedCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.blockchain = ctx.blockchain;
        this.logger = ctx.logger;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            importId,
        } = command.data;

        const myBidIndex = await this.blockchain.getBidIndex(
            importId,
            this.config.identity,
        );
        await this.blockchain.activatePredeterminedBid(
            importId,
            this.config.identity,
            myBidIndex,
        );

        return {
            commands: [
                {
                    name: 'offerBidAdded',
                    data: this.pack(command.data),
                    delay: 0,
                    period: 5000,
                    transactional: true,
                },
            ],
        };
    }

    /**
     * Pack data for DB
     * @param data
     */
    pack(data) {
        Object.assign(data, {
            myStake: data.myStake.toString(),
            myPrice: data.myPrice.toString(),
            profileBalance: data.profileBalance.toString(),
        });
        return data;
    }

    /**
     * Unpack data from database
     * @param data
     * @returns {Promise<*>}
     */
    unpack(data) {
        const parsed = data;
        Object.assign(parsed, {
            myStake: new BN(data.myStake, 10),
            myPrice: new BN(data.myPrice, 10),
            profileBalance: new BN(data.profileBalance, 10),
        });
        return parsed;
    }

    /**
     * Recover system from failure
     * @param command
     * @param err
     */
    recover(command, err) {
        this.logger.info('Bid not added, your bid was probably too late and the offer has been closed');
    }

    /**
     * Builds default AddCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    static buildDefault(map) {
        const command = {
            name: 'offerBidAddPredetermined',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = OfferBidAddPredeterminedCommand;
