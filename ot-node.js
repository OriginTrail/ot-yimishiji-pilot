require('dotenv').config();

if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    process.env.NODE_ENV = 'testnet';
}

const HttpNetwork = require('./modules/network/http/http-network');
const Kademlia = require('./modules/network/kademlia/kademlia');
const Transport = require('./modules/network/transport');
const KademliaUtilities = require('./modules/network/kademlia/kademlia-utils');
const Utilities = require('./modules/Utilities');
const GraphStorage = require('./modules/Database/GraphStorage');
const Blockchain = require('./modules/Blockchain');
const BlockchainPluginService = require('./modules/Blockchain/plugin/blockchain-plugin-service');
const fs = require('fs');
const path = require('path');
const models = require('./models');
const SchemaValidator = require('./modules/validator/schema-validator');
const GS1Utilities = require('./modules/importer/gs1-utilities');
const WOTImporter = require('./modules/importer/wot-importer');
const EpcisOtJsonTranspiler = require('./modules/transpiler/epcis/epcis-otjson-transpiler');
const WotOtJsonTranspiler = require('./modules/transpiler/wot/wot-otjson-transpiler');
const RemoteControl = require('./modules/RemoteControl');
const rc = require('rc');
const uuidv4 = require('uuid/v4');
const awilix = require('awilix');
const homedir = require('os').homedir();
const argv = require('minimist')(process.argv.slice(2));
const Graph = require('./modules/Graph');
const Product = require('./modules/Product');
const constants = require('./modules/constants');
const EventEmitter = require('./modules/EventEmitter');
const DVService = require('./modules/DVService');
const MinerService = require('./modules/service/miner-service');
const ApprovalService = require('./modules/service/approval-service');
const ChallengeService = require('./modules/service/challenge-service');
const ProfileService = require('./modules/service/profile-service');
const ReplicationService = require('./modules/service/replication-service');
const APIUtilities = require('./modules/api-utilities');
const RestApiController = require('./modules/service/rest-api-controller');
const M1PayoutAllMigration = require('./modules/migration/m1-payout-all-migration');
const M2SequelizeMetaMigration = require('./modules/migration/m2-sequelize-meta-migration');
const M3NetowrkIdentityMigration = require('./modules/migration/m3-network-identity-migration');
const M4ArangoMigration = require('./modules/migration/m4-arango-migration');
const M5ArangoPasswordMigration = require('./modules/migration/m5-arango-password-migration');
const M7ArangoDatasetSignatureMigration = require('./modules/migration/m7-arango-dataset-signature-migration');
const ImportWorkerController = require('./modules/worker/import-worker-controller');
const ImportService = require('./modules/service/import-service');
const OtNodeClient = require('./modules/service/ot-node-client');
const PermissionedDataService = require('./modules/service/permissioned-data-service');
const RestoreService = require('./scripts/restore');
const { execSync } = require('child_process');

const semver = require('semver');

const pjson = require('./package.json');
const configjson = require('./config/config.json');

const log = require('./modules/logger');

global.__basedir = __dirname;

let context;
const defaultConfig = Utilities.copyObject(configjson[
    process.env.NODE_ENV &&
    ['development', 'testnet', 'mainnet'].indexOf(process.env.NODE_ENV) >= 0 ?
        process.env.NODE_ENV : 'development']);

let config;
try {
    // Load config.
    config = rc(pjson.name, defaultConfig);

    if (argv.configDir) {
        config.appDataPath = argv.configDir;
        models.sequelize.options.storage = path.join(config.appDataPath, 'system.db');
    } else {
        config.appDataPath = path.join(
            homedir,
            `.${pjson.name}rc`,
            process.env.NODE_ENV,
        );
    }
} catch (error) {
    console.error(`Failed to read configuration. ${error}.`);
    console.error(error.stack);
    process.abort();
}

process.on('unhandledRejection', (reason, p) => {
    if (reason.message.startsWith('Invalid JSON RPC response')) {
        return;
    }
    log.error(`Unhandled Rejection:\n${reason.stack}`);
});

process.on('uncaughtException', (err) => {
    if (process.env.NODE_ENV === 'development') {
        log.error(`Caught exception: ${err}.\n ${err.stack}`);
        process.exit(1);
    }
    log.error(`Caught exception: ${err}.\n ${err.stack}`);
});

process.on('warning', (warning) => {
    log.warn(warning.name);
    log.warn(warning.message);
    log.warn(warning.stack);
});

process.on('exit', (code) => {
    switch (code) {
    case 0:
        log.debug(`Normal exiting with code: ${code}`);
        break;
    case 4:
        log.trace('Exiting because of update.');
        break;
    default:
        log.error(`Whoops, terminating with code: ${code}`);
        break;
    }
});

process.on('SIGINT', () => {
    log.important('SIGINT caught. Exiting...');


    process.exit(0);
});

/**
 * Main node object
 */
class OTNode {
    /**
     * OriginTrail node system bootstrap function
     */
    async bootstrap() {
        try {
            // check if all dependencies are installed
            await Utilities.checkInstalledDependencies();
            log.info('npm modules dependencies check done');

            // Checking root folder structure
            Utilities.checkOtNodeDirStructure();
            log.info('ot-node folder structure check done');
        } catch (err) {
            console.log(err);
            process.exit(1);
        }

        log.important(`Running in ${process.env.NODE_ENV} environment.`);

        await this._runNetworkIdentityMigration(config);

        // Seal config in order to prevent adding properties.
        // Allow identity to be added. Continuity.
        config.identity = '';
        config.erc725Identity = '';
        config.publicKeyData = {};

        const appState = {};
        if (config.is_bootstrap_node) {
            await this.startBootstrapNode({ appState });
            return;
        }

        // check if ArangoDB service is running at all
        if (config.database.provider === 'arangodb') {
            try {
                if (process.env.OT_NODE_DISTRIBUTION === 'docker'
                    && (''.localeCompare(config.database.password) === 0
                    || 'root'.localeCompare(config.database.password) === 0)) {
                    await this._runArangoPasswordMigration(config);
                }

                // get password for database
                const databasePasswordFilePath = path
                    .join(config.appDataPath, config.database.password_file_name);
                if (fs.existsSync(databasePasswordFilePath)) {
                    log.info('Using existing graph database password.');
                    config.database.password = fs.readFileSync(databasePasswordFilePath).toString();
                } else {
                    log.notify('================================================================');
                    log.notify('          Using default database password for access            ');
                    log.notify('================================================================');
                }

                const { version } = await Utilities.getArangoDbVersion(config);

                log.info(`Arango server version ${version} is up and running`);
                if (semver.lt(version, '3.5.0')) {
                    if (process.env.OT_NODE_DISTRIBUTION === 'docker'
                        && config.autoUpdater.enabled) {
                        log.info('Your Arango version is lower than required. Starting upgrade...');
                        await this._runArangoMigration(config);

                        const { version } = await Utilities.getArangoDbVersion(config);
                        log.info(`Arango server is updated to version ${version}.`);
                    } else {
                        log.error('Arango version too old! Please update to version 3.5.0 or newer');
                        process.exit(1);
                    }
                }
            } catch (err) {
                log.error('Please make sure Arango server is up and running');
                console.log(err);
                process.exit(1);
            }
        }

        this._checkRestoreRequestStatus(config);

        // Checking if selected graph database exists
        try {
            await Utilities.checkDoesStorageDbExists(config);
            log.info('Storage database check done');
        } catch (err) {
            console.log(err);
            process.exit(1);
        }

        Object.seal(config);
        // Create the container and set the injectionMode to PROXY (which is also the default).
        const container = awilix.createContainer({
            injectionMode: awilix.InjectionMode.PROXY,
        });

        context = container.cradle;

        container.loadModules(['modules/command/**/*.js', 'modules/controller/**/*.js', 'modules/service/**/*.js', 'modules/Blockchain/plugin/hyperledger/*.js', 'modules/migration/*.js'], {
            formatName: 'camelCase',
            resolverOptions: {
                lifetime: awilix.Lifetime.SINGLETON,
                register: awilix.asClass,
            },
        });

        container.register({
            httpNetwork: awilix.asClass(HttpNetwork).singleton(),
            emitter: awilix.asClass(EventEmitter).singleton(),
            kademlia: awilix.asClass(Kademlia).singleton(),
            graph: awilix.asClass(Graph).singleton(),
            product: awilix.asClass(Product).singleton(),
            dvService: awilix.asClass(DVService).singleton(),
            profileService: awilix.asClass(ProfileService).singleton(),
            approvalService: awilix.asClass(ApprovalService).singleton(),
            config: awilix.asValue(config),
            appState: awilix.asValue(appState),
            schemaValidator: awilix.asClass(SchemaValidator).singleton(),
            blockchain: awilix.asClass(Blockchain).singleton(),
            blockchainPluginService: awilix.asClass(BlockchainPluginService).singleton(),
            gs1Utilities: awilix.asClass(GS1Utilities).singleton(),
            wotImporter: awilix.asClass(WOTImporter).singleton(),
            epcisOtJsonTranspiler: awilix.asClass(EpcisOtJsonTranspiler).singleton(),
            wotOtJsonTranspiler: awilix.asClass(WotOtJsonTranspiler).singleton(),
            graphStorage: awilix.asValue(new GraphStorage(config.database, log)),
            remoteControl: awilix.asClass(RemoteControl).singleton(),
            logger: awilix.asValue(log),
            kademliaUtilities: awilix.asClass(KademliaUtilities).singleton(),
            transport: awilix.asValue(Transport()),
            apiUtilities: awilix.asClass(APIUtilities).singleton(),
            minerService: awilix.asClass(MinerService).singleton(),
            replicationService: awilix.asClass(ReplicationService).singleton(),
            restApiController: awilix.asClass(RestApiController).singleton(),
            challengeService: awilix.asClass(ChallengeService).singleton(),
            importWorkerController: awilix.asClass(ImportWorkerController).singleton(),
            importService: awilix.asClass(ImportService).singleton(),
            permissionedDataService: awilix.asClass(PermissionedDataService).singleton(),
            otNodeClient: awilix.asClass(OtNodeClient).singleton(),
        });
        const blockchain = container.resolve('blockchain');
        await blockchain.loadContracts();

        const emitter = container.resolve('emitter');
        const dhService = container.resolve('dhService');
        const remoteControl = container.resolve('remoteControl');
        const profileService = container.resolve('profileService');
        const approvalService = container.resolve('approvalService');

        emitter.initialize();

        // Connecting to graph database
        const graphStorage = container.resolve('graphStorage');
        try {
            await graphStorage.connect();
            log.info(`Connected to graph database: ${graphStorage.identify()}`);
            await this._runArangoDatasetSignatureMigration(config, graphStorage);
        } catch (err) {
            log.error(`Failed to connect to the graph database: ${graphStorage.identify()}`);
            process.exit(1);
        }

        const houstonPasswordFilePath = path
            .join(config.appDataPath, config.houston_password_file_name);
        if (fs.existsSync(houstonPasswordFilePath)) {
            log.info('Using existing houston password.');
            config.houston_password = fs.readFileSync(houstonPasswordFilePath).toString();
        } else {
            config.houston_password = uuidv4();
            fs.writeFileSync(houstonPasswordFilePath, config.houston_password);
            log.notify('================================================================');
            log.notify('        Houston password generated and stored in file           ');
            log.notify('================================================================');
        }

        if (config.high_availability_setup) {
            const highAvailabilityService = container.resolve('highAvailabilityService');

            await highAvailabilityService.startHighAvailabilityNode();
        }

        // Starting the kademlia
        const transport = container.resolve('transport');
        await transport.init(container.cradle);

        // Starting event listener on Blockchain
        this.listenBlockchainEvents(blockchain);
        dhService.listenToBlockchainEvents();

        try {
            await profileService.initProfile();
            await this._runPayoutMigration(blockchain, config);
        } catch (e) {
            log.error('Failed to create profile');
            console.log(e);
            process.exit(1);
        }
        await transport.start();

        await profileService.validateAndUpdateProfiles();
        // Initialize bugsnag notification service
        const errorNotificationService = container.resolve('errorNotificationService');
        await errorNotificationService.initialize();
        // Initialise API
        const restApiController = container.resolve('restApiController');

        try {
            await restApiController.startRPC();
        } catch (err) {
            log.error('Failed to start RPC server');
            console.log(err);
            process.exit(1);
        }
        if (config.remote_control_enabled) {
            log.info(`Remote control enabled and listening on port ${config.node_remote_control_port}`);
            await remoteControl.connect();
        }

        const commandExecutor = container.resolve('commandExecutor');
        await commandExecutor.init();
        await commandExecutor.replay();
        await commandExecutor.start();
        appState.started = true;
    }

    /**
     * Backs up network identity files if they are from the old network version
     * @param config
     * @returns {Promise<void>}
     * @private
     */
    async _runNetworkIdentityMigration(config) {
        const migrationsStartedMills = Date.now();

        const migration = new M3NetowrkIdentityMigration({ logger: log, config });
        try {
            await migration.run();
        } catch (e) {
            log.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
            console.log(e);
            process.exit(1);
        }
    }

    async _runArangoMigration(config) {
        const migrationsStartedMills = Date.now();

        const m1PayoutAllMigrationFilename = '4_m4ArangoMigrationFile';
        const migrationDir = path.join(config.appDataPath, 'migrations');
        const migrationFilePath = path.join(migrationDir, m1PayoutAllMigrationFilename);
        if (!fs.existsSync(migrationFilePath)) {
            const migration = new M4ArangoMigration({ logger: log, config });

            try {
                log.info('Initializing Arango migration...');
                await migration.run();
                log.warn(`One-time Arango migration completed. Lasted ${Date.now() - migrationsStartedMills} millisecond(s)`);

                await Utilities.writeContentsToFile(migrationDir, m1PayoutAllMigrationFilename, 'PROCESSED');
            } catch (e) {
                log.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
                console.log(e);
                process.exit(1);
            }
        }
    }

    async _runArangoDatasetSignatureMigration(config, graphStorage) {
        const migrationsStartedMills = Date.now();

        const m7ArangoSignatureMigrationFilename = '7_m7ArangoDatasetSignatureMigrationFile';
        const migrationDir = path.join(config.appDataPath, 'migrations');
        const migrationFilePath = path.join(migrationDir, m7ArangoSignatureMigrationFilename);
        if (!fs.existsSync(migrationFilePath)) {
            const migration = new M7ArangoDatasetSignatureMigration({
                config,
                graphStorage,
            });

            try {
                log.info('Initializing Arango dataset signature migration...');
                await migration.run();
                log.warn(`One-time Arango dataset signature migration completed. Lasted ${Date.now() - migrationsStartedMills} millisecond(s)`);

                await Utilities.writeContentsToFile(migrationDir, m7ArangoSignatureMigrationFilename, 'PROCESSED');
            } catch (e) {
                log.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
                process.exit(1);
            }
        }
    }

    async _runArangoPasswordMigration(config) {
        const migrationsStartedMills = Date.now();

        const m5ArangoPasswordMigrationFilename = '5_m5ArangoPasswordMigrationFile';
        const migrationDir = path.join(config.appDataPath, 'migrations');
        const migrationFilePath = path.join(migrationDir, m5ArangoPasswordMigrationFilename);
        if (!fs.existsSync(migrationFilePath)) {
            const migration = new M5ArangoPasswordMigration({ log, config });
            try {
                log.info('Initializing Arango password migration...');
                const result = await migration.run();
                if (result === 0) {
                    log.notify(`One-time password migration completed. Lasted ${Date.now() - migrationsStartedMills} millisecond(s)`);
                    await Utilities.writeContentsToFile(migrationDir, m5ArangoPasswordMigrationFilename, 'PROCESSED');
                } else {
                    log.error('One-time password migration failed. Defaulting to previous implementation');
                }
            } catch (e) {
                log.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
                console.log(e);
                process.exit(1);
            }
        }
    }

    /**
     * Run one time payout migration
     * @param blockchain
     * @param config
     * @returns {Promise<void>}
     * @private
     */
    async _runPayoutMigration(blockchain, config) {
        const migrationsStartedMills = Date.now();
        log.info('Initializing payOut migration...');

        const m1PayoutAllMigrationFilename = '1_m1PayoutAllMigrationFile';
        const migrationDir = path.join(config.appDataPath, 'migrations');
        const migrationFilePath = path.join(migrationDir, m1PayoutAllMigrationFilename);
        if (!fs.existsSync(migrationFilePath)) {
            const migration = new M1PayoutAllMigration({ logger: log, blockchain, config });

            try {
                await migration.run();
                log.warn(`One-time payout migration completed. Lasted ${Date.now() - migrationsStartedMills} millisecond(s)`);

                await Utilities.writeContentsToFile(migrationDir, m1PayoutAllMigrationFilename, 'PROCESSED');
            } catch (e) {
                log.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
                console.log(e);
                process.exit(1);
            }
        }
    }

    _checkRestoreRequestStatus(config) {
        const restoreFile = path.join(config.appDataPath, 'restore_request_status.txt');

        if (fs.existsSync(restoreFile)) {
            log.info('Detected restore request file, checking status.');
            const restoreStatus = fs.readFileSync(restoreFile).toString();

            switch (restoreStatus) {
            case 'COMPLETED':
                log.info('Restore status is completed, continuing with node startup.');
                break;
            case 'FAILED':
                log.warn('Restore status is failed, cancelling node startup');
                if (fs.existsSync(path.join(config.appDataPath, 'restore_error_message.txt'))) {
                    log.warn(`Found error during restore procedure: \n${fs.readFileSync(path
                        .join(config.appDataPath, 'restore_error_message.txt')).toString()}`);
                }
                log.important('To start your node please fix the restoration error(s) or skip the restore process by deleting the restore request file.');
                process.exit(1);
                break;
            case 'REQUESTED':
            default:
                log.info('Restore status is requested, starting restore process');
                try {
                    const restorer = new RestoreService(log);
                    restorer.restore();
                    log.info('Successfully completed node restore, restarting to read restored files.');
                    fs.writeFileSync(restoreFile, 'COMPLETED');
                    // Exit with unexpected code, so that the node restarts
                    process.exit(2);
                } catch (e) {
                    log.error(`Failed to execute node restore. Error: ${e.toString()}`);
                    fs.writeFileSync(path.join(config.appDataPath, 'restore_error_message.txt'), e.toString());
                    fs.writeFileSync(restoreFile, 'FAILED');
                    process.exit(1);
                }
                break;
            }
        }
    }
    /**
     * Starts bootstrap node
     * @return {Promise<void>}
     */
    async startBootstrapNode({ appState }) {
        const container = awilix.createContainer({
            injectionMode: awilix.InjectionMode.PROXY,
        });

        container.loadModules(['modules/command/**/*.js', 'modules/controller/**/*.js', 'modules/service/**/*.js', 'modules/Blockchain/plugin/hyperledger/*.js', 'modules/migration/*.js'], {
            formatName: 'camelCase',
            resolverOptions: {
                lifetime: awilix.Lifetime.SINGLETON,
                register: awilix.asClass,
            },
        });

        container.register({
            emitter: awilix.asValue({}),
            blockchain: awilix.asClass(Blockchain).singleton(),
            blockchainPluginService: awilix.asClass(BlockchainPluginService).singleton(),
            kademlia: awilix.asClass(Kademlia).singleton(),
            dvService: awilix.asClass(DVService).singleton(),
            config: awilix.asValue(config),
            appState: awilix.asValue(appState),
            remoteControl: awilix.asClass(RemoteControl).singleton(),
            logger: awilix.asValue(log),
            kademliaUtilities: awilix.asClass(KademliaUtilities).singleton(),
            transport: awilix.asValue(Transport()),
            apiUtilities: awilix.asClass(APIUtilities).singleton(),
            restApiController: awilix.asClass(RestApiController).singleton(),
            graphStorage: awilix.asValue(new GraphStorage(config.database, log)),
            epcisOtJsonTranspiler: awilix.asClass(EpcisOtJsonTranspiler).singleton(),
            wotOtJsonTranspiler: awilix.asClass(WotOtJsonTranspiler).singleton(),
            schemaValidator: awilix.asClass(SchemaValidator).singleton(),
            importService: awilix.asClass(ImportService).singleton(),
        });
        const transport = container.resolve('transport');
        await transport.init(container.cradle);
        await transport.start();

        const restApiController = container.resolve('restApiController');
        try {
            await restApiController.startRPC();
        } catch (err) {
            log.error('Failed to start RPC server');
            console.log(err);
            process.exit(1);
        }
    }

    /**
     * Listen to all Bidding events
     * @param blockchain
     */
    listenBlockchainEvents(blockchain) {
        log.info('Starting blockchain event listener');

        const delay = 20000;
        let working = false;
        let deadline = Date.now();
        setInterval(async () => {
            if (!working && Date.now() > deadline) {
                try {
                    working = true;
                    await blockchain.getAllPastEvents('HUB_CONTRACT');
                    await blockchain.getAllPastEvents('HOLDING_CONTRACT');
                    await blockchain.getAllPastEvents('PROFILE_CONTRACT');
                    await blockchain.getAllPastEvents('APPROVAL_CONTRACT');
                    await blockchain.getAllPastEvents('LITIGATION_CONTRACT');
                    await blockchain.getAllPastEvents('MARKETPLACE_CONTRACT');
                    await blockchain.getAllPastEvents('REPLACEMENT_CONTRACT');
                    await blockchain.getAllPastEvents('OLD_HOLDING_CONTRACT'); // TODO remove after successful migration
                    deadline = Date.now() + delay;
                } catch (e) {
                    log.error(`Failed to get blockchain events. Error: ${e}`);
                } finally {
                    working = false;
                }
            }
        }, 5000);
    }
}


log.info(' ██████╗ ████████╗███╗   ██╗ ██████╗ ██████╗ ███████╗');
log.info('██╔═══██╗╚══██╔══╝████╗  ██║██╔═══██╗██╔══██╗██╔════╝');
log.info('██║   ██║   ██║   ██╔██╗ ██║██║   ██║██║  ██║█████╗');
log.info('██║   ██║   ██║   ██║╚██╗██║██║   ██║██║  ██║██╔══╝');
log.info('╚██████╔╝   ██║   ██║ ╚████║╚██████╔╝██████╔╝███████╗');
log.info(' ╚═════╝    ╚═╝   ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝');

log.info('======================================================');
log.info(`             OriginTrail Node v${pjson.version}`);
log.info('======================================================');
log.info('');


function main() {
    const otNode = new OTNode();
    otNode.bootstrap().then(() => {
        log.info('OT Node started');
    });
}

// Make sure the Sequelize meta table is migrated before running main.
if (process.env.DB_TYPE === constants.DB_TYPE.psql && process.env.NODE_ENV !== 'development') {
    execSync('/etc/init.d/postgresql start');
}
const migrationSequelizeMeta = new M2SequelizeMetaMigration({ logger: log });
migrationSequelizeMeta.run().then(main);
