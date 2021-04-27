const fs = require('fs');
const semver = require('semver');
const path = require('path');
const request = require('superagent');
const { fork } = require('child_process');
const Models = require('../../../models');
const constants = require('../../constants');

const pjson = require('../../../package');
const Command = require('../command');

/**
 * Increases approval for Bidding contract on blockchain
 */
class AutoupdaterCommand extends Command {
    /**
     * Constructs AutoupdaterCommand.
     * @param ctx Context.
     * @param {object} options Options containing default params.
     * @param {object} options.process Process object
     * @param {string} options.updateFilepath Path to UPDATE file.
     * @param {string} options.destinationBaseDir Base path where new update should be stored.
     */
    constructor(ctx, options = {
        process, // Global process object
        updateFilepath: '/ot-node/current/UPDATE',
        destinationBasedir: '/ot-node/',
    }) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.process = options.process;
        this.updateFilepath = options.updateFilepath;
        this.destinationBasedir = options.destinationBasedir;
        this.highAvailabilityService = ctx.highAvailabilityService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        if (!this.config.autoUpdater.enabled) {
            this.logger.debug('Autoupdate command ignored.');
            return Command.repeat(); // Can be enabled during runtime.
        }

        if (this.process.env.OT_NODE_DISTRIBUTION !== 'docker') {
            return Command.empty();
        }

        this.logger.info('Checking for new node version');
        const { config, destinationBasedir, updateFilepath } = this;

        const currentVersion = pjson.version;
        let remoteVersion;
        try {
            remoteVersion = await this.__getVersion();
        } catch (error) {
            this.logger.trace(`Failed to check for remote version. ${error}.`);
            return Command.repeat();
        }

        this.logger.trace(`Version check: local version ${currentVersion}, remote version: ${remoteVersion}`);

        if (semver.lt(currentVersion, remoteVersion)) {
            this.logger.info('New version found');

            if (semver.major(currentVersion) < semver.major(remoteVersion)) {
                this.logger.important(`New major update available. Please run update to version ${remoteVersion} manually.`);
                return Command.repeat();
            }

            if (this.config.high_availability_setup) {
                const activeNode = await Models.node_status.findOne({
                    where: { hostname: this.config.high_availability.private_ip_address },
                });
                await this.highAvailabilityService.updateOrCreateNodeState(
                    activeNode,
                    constants.NODE_STATUS.updating,
                    this.config.high_availability.private_ip_address,
                );
            }

            const updater = fork(path.join(__dirname, '..', '..', '..', 'testnet', 'prepare-update.js'), [], {
                stdio: [0, 1, 2, 'ipc'],
                env: this.process.env,
            });

            const updaterPromise = new Promise(async (accept, reject) => {
                updater.on('message', async (result) => {
                    if (result.status !== 'completed') {
                        // Something went wrong.
                        this.logger.warn(`Failed to prepare update. Status: ${result.status}.`);
                        accept();
                        return;
                    }
                    /*
                    { status: 'completed',
                      installDir: '/ot-node/2.0.33',
                      version: '2.0.33' }
                     */
                    this.logger.info(`Update ready for version ${result.version}, restarting node...`);
                    fs.writeFileSync(updateFilepath, JSON.stringify({
                        version: result.version,
                        path: result.installDir,
                        configPath: config.appDataPath,
                    }));

                    // Force restarting the docker container.
                    this.process.exit(4);
                    accept(); // Needed for tests.
                }).on('error', (error) => {
                    this.logger.error(`Failed to check prepare update. ${error}`);
                    accept();
                });
            });

            const options = {
                appDataPath: config.appDataPath,
                version: remoteVersion,
                archiveUrl: config.autoUpdater.archiveUrl,
                destinationBaseDir: destinationBasedir,
            };

            updater.send(options);
            await updaterPromise;
            return Command.repeat();
        }

        this.logger.info('No new version found');
        return Command.repeat();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'autoupdaterCommand',
            data: {
            },
            period: 6 * 60 * 60 * 1000,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }

    /**
     * Returns version of the OT node on remote server.
     * @return {Promise.<string>}
     * @private
     */
    __getVersion() {
        return new Promise((resolve, reject) => {
            request.get(this.config.autoUpdater.packageJsonUrl).then((res, err) => {
                if (err) {
                    reject(err);
                    return;
                }
                const response = res.res.text;
                const packageJsonContent = JSON.parse(response);
                resolve(packageJsonContent.version);
            }).catch((err) => {
                reject(err);
            });
        });
    }
}

module.exports = AutoupdaterCommand;
