const Command = require('../command');
const Utilities = require('../../Utilities');
const constants = require('../../constants');
const Blockchain = require('../../Blockchain');

const Models = require('../../../models/index');

const DELAY_ON_FAIL_IN_MILLS = 5 * 60 * 1000;

/**
 * Starts token withdrawal operation
 */
class DhPayOutCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.logger = ctx.logger;
        this.blockchain = ctx.blockchain;
        this.remoteControl = ctx.remoteControl;
        this.profileService = ctx.profileService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            offerId,
            urgent,
        } = command.data;

        let {
            blockchain_id,
        } = command.data;

        const bid = await Models.bids.findOne({
            where: {
                offer_id: offerId,
                status: { [Models.Sequelize.Op.in]: ['COMPLETED', 'CHOSEN'] },
            },
        });

        if (!blockchain_id) {
            if (bid && bid.blockchain_id) {
                // eslint-disable-next-line prefer-destructuring
                blockchain_id = bid.blockchain_id;
            } else {
                this.logger.important(`Cannot determine blockchain_id for offer ${offerId}. Cannot execute payout.`);
                return Command.empty();
            }
        }

        const blockchainIdentity = this.profileService.getIdentity(blockchain_id);

        if (!bid) {
            this.logger.important(`There is no successful bid for offer ${offerId}. Cannot execute payout.`);
            await this._printBalances(blockchainIdentity, blockchain_id);
            return Command.empty();
        }
        if (bid.status !== 'COMPLETED') {
            bid.status = 'COMPLETED';
            bid.message = `Offer ${offerId} has been completed`;
            await bid.save({ fields: ['status', 'message'] });
            this.logger.important(`Offer ${offerId} has been completed successfully.`);
        }

        const { status, timestamp } = await this.blockchain
            .getLitigation(offerId, blockchainIdentity, blockchain_id).response;
        const { litigation_interval_in_minutes } = await Models.bids.findOne({
            where: {
                offer_id: offerId,
            },
        });

        const litigationTimestamp = parseInt(timestamp, 10) * 1000;

        const blockTimestamp = Date.now();
        if (status === '1' && !(litigationTimestamp + (litigation_interval_in_minutes * 2 * 60000) < blockTimestamp)) {
            this.logger.info(`Unanswered litigation for offer ${offerId} in progress, cannot be payed out.`);
        } else if (status === '2' && !(litigationTimestamp + (60000 * litigation_interval_in_minutes) < blockTimestamp)) {
            this.logger.info(`Unanswered litigation for offer ${offerId} in progress, cannot be payed out.`);
        } else if (status !== '0') {
            this.logger.info(`I'm replaced or being replaced for offer ${offerId}, cannot be payed out.`);
        } else {
            try {
                await this.blockchain
                    .payOut(blockchainIdentity, offerId, urgent, blockchain_id).response;
                this.logger.important(`Payout for offer ${offerId} successfully completed on blockchain ${blockchain_id}.`);
                await this._clearReplicationDatabaseData(offerId);
                await this._printBalances(blockchainIdentity, blockchain_id);
            } catch (error) {
                if (error.message.includes('Gas price higher than maximum allowed price')) {
                    this.logger.info('Gas price too high, delaying call for 30 minutes');
                    return {
                        commands: [
                            {
                                name: 'dhPayOutCommand',
                                delay: constants.GAS_PRICE_VALIDITY_TIME_IN_MILLS,
                                retries: 3,
                                transactional: false,
                                data: {
                                    offerId,
                                    viaAPI: false,
                                },
                            },
                        ],
                    };
                }
                throw error;
            }
        }

        return Command.empty();
    }

    /**
     * Recover system from failure
     * @param command
     * @param err
     */
    async recover(command, err) {
        const {
            offerId,
            viaAPI,
        } = command.data;

        if (!viaAPI) {
            this.logger.warn(`Rescheduling failed payout for offer ${offerId}. Schedule delay ${DELAY_ON_FAIL_IN_MILLS} milliseconds`);
            return {
                commands: [
                    {
                        name: 'dhPayOutCommand',
                        data: command.data,
                        delay: DELAY_ON_FAIL_IN_MILLS,
                    },
                ],
            };
        }
        return Command.empty();
    }

    /**
     * Print balances
     * @param blockchainIdentity
     * @param blockchain_id
     * @return {Promise<void>}
     * @private
     */
    async _printBalances(blockchainIdentity, blockchain_id) {
        const blockchain_title = this.blockchain.getBlockchainTitle(blockchain_id).response;

        const { node_wallet } = this.blockchain.getWallet(blockchain_id).response;
        const profile = await this.blockchain
            .getProfile(blockchainIdentity, blockchain_id).response;

        let walletBalance;
        if (blockchain_title !== constants.BLOCKCHAIN_TITLE.OriginTrailParachain) {
            walletBalance =
                await this.blockchain.getWalletTokenBalance(node_wallet, blockchain_id).response;
        } else {
            walletBalance =
                await this.blockchain.getWalletBaseBalance(node_wallet, blockchain_id).response;
        }
        const walletBalanceInTRAC = Blockchain.fromWei(blockchain_title, walletBalance, 'ether');
        this.logger.info(`Wallet balance: ${walletBalanceInTRAC} TRAC`);

        const profileBalance = profile.stake;
        const profileBalanceInTRAC = Blockchain.fromWei(blockchain_title, profileBalance, 'ether');
        this.logger.info(`Profile balance: ${profileBalanceInTRAC} TRAC`);
    }

    async _clearReplicationDatabaseData(offerId) {
        await Models.bids.destroy({
            where: {
                offer_id: offerId,
                status: 'COMPLETED',
            },
        });

        await Models.holding_data.destroy({
            where: {
                offer_id: offerId,
            },
        });
    }
    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dhPayOutCommand',
            delay: 0,
            period: constants.GAS_PRICE_VALIDITY_TIME_IN_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DhPayOutCommand;
