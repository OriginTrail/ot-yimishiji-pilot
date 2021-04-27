const Command = require('../command');
const constants = require('../../constants');
const { fork } = require('child_process');

class DatasetPruningCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.datasetPruningService = ctx.datasetPruningService;
        this.commandExecutor = ctx.commandExecutor;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        if (!this.config.dataset_pruning.enabled) {
            this.logger.debug('Dataset pruning command ignored.');
            return Command.empty();
        }

        const datasets = await this.datasetPruningService.fetchDatasetData();

        if (!datasets) {
            this.logger.trace('Found 0 datasets for pruning');
            return Command.repeat();
        }

        const repackedDatasets = this.datasetPruningService.repackDatasets(datasets);

        const forked = fork('modules/worker/dataset-pruning-worker.js');

        forked.send(JSON.stringify({
            selectedDatabase: this.config.database,
            importedPruningDelayInMinutes: this.config
                .dataset_pruning.imported_pruning_delay_in_minutes,
            replicatedPruningDelayInMinutes: this.config.dataset_pruning
                .replicated_pruning_delay_in_minutes,
            repackedDatasets,
        }));

        forked.on('message', async (response) => {
            if (response.error) {
                this.logger.error(`Error while pruning datasets: ${response.error}`);
                forked.kill();
                await this.addPruningCommandToExecutor();
                return;
            }
            const {
                offerIdToBeDeleted,
                dataInfoIdToBeDeleted,
                datasetsToBeDeleted,
            } = response;
            if (datasetsToBeDeleted.length === 0) {
                this.logger.trace('Found 0 datasets for pruning');
                return;
            }
            await this.datasetPruningService.removeEntriesWithId('offers', offerIdToBeDeleted);
            await this.datasetPruningService.removeEntriesWithId('data_info', dataInfoIdToBeDeleted);

            await this.datasetPruningService.updatePruningHistory(datasetsToBeDeleted);
            this.logger.info(`Sucessfully pruned ${datasetsToBeDeleted.length} datasets.`);
            forked.kill();
            await this.addPruningCommandToExecutor();
        });
        this.logger.trace('Dataset pruning worker started');
        return Command.empty();
    }

    async addPruningCommandToExecutor() {
        await this.commandExecutor.add({
            name: 'datasetPruningCommand',
            delay: constants.DATASET_PRUNING_COMMAND_TIME_MILLS,
            period: constants.DATASET_PRUNING_COMMAND_TIME_MILLS,
            transactional: false,
        });
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'datasetPruningCommand',
            data: {
            },
            period: constants.DATASET_PRUNING_COMMAND_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

module.exports = DatasetPruningCommand;
