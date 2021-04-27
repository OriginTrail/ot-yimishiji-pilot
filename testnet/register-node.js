require('dotenv').config({ path: '../.env' });

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'stable' || process.env.NODE_ENV === 'staging') {
    process.env.NODE_ENV = 'testnet';
} else if (process.env.NODE_ENV === 'mariner') {
    process.env.NODE_ENV = 'mainnet';
}

const fs = require('fs');
const rc = require('rc');
const path = require('path');
const homedir = require('os').homedir();
const Web3 = require('web3');
const deepExtend = require('deep-extend');
const pjson = require('../package.json');
const argv = require('minimist')(process.argv.slice(2));
const { execSync, spawn } = require('child_process');

const logger = require('../modules/logger');
const configjson = require('../config/config.json');
const Utilities = require('../modules/Utilities');

const defaultConfig = Utilities.copyObject(configjson[process.env.NODE_ENV]);
const localConfiguration = rc(pjson.name, defaultConfig);
const web3 = new Web3();
const constants = require('../modules/constants');

const otNodeRootPath = path.resolve(__dirname, '..');
const M6OperationalDBMigration = require('../modules/migration/m6-operational-db-migration');

if (argv.configDir) {
    localConfiguration.appDataPath = argv.configDir;
    logger.trace(`configDir given as param '${argv.configDir}'.`);
} else {
    localConfiguration.appDataPath = path.join(
        homedir,
        `.${pjson.name}rc`,
        process.env.NODE_ENV,
    );
}

class RegisterNode {
    async start() {
        if (this.upgradeContainer()) {
            return;
        }
        await this.checkForUpdate();
        this.main();
    }

    async checkForUpdate() {
        try {
            if (process.env.DB_TYPE === constants.DB_TYPE.psql && process.env.NODE_ENV !== 'development') {
                execSync('/etc/init.d/postgresql start');
                await this.runOperationDbMigration();
                execSync('./node_modules/.bin/sequelize --config=./config/sequelizeConfig.js db:migrate');
            }
            // Important: this file is running in the context of older version so
            // all the migrations has to be run in the context of updated version
            // of the node. This particularly means that newer version may have
            // completely different node modules and all scripts has to be run
            // there.
            const updateFilePath = path.join(otNodeRootPath, 'UPDATE');
            if (!fs.existsSync(updateFilePath)) {
                logger.trace('No update found.');
                return;
            }

            const updateInfo = JSON.parse(fs.readFileSync(updateFilePath, 'utf8'));
            const configDir = localConfiguration.appDataPath;
            /*
                Expected content:
                {
                    version: '1.1.1',
                    path: '/ot-node/1.1.1',
                    configPath: config.appDataPath,
                }
             */

            // Remove UPDATE file before proceeding to avoid loop in case of error.
            execSync(`rm ${updateFilePath}`);

            // Run pre-update script if available.
            const preupdateScriptPath = path.join(updateInfo.path, 'testnet', 'preupdate.js');
            if (fs.existsSync(preupdateScriptPath)) {
                execSync(`node ${preupdateScriptPath} --configDir=${configDir}`, { cwd: updateInfo.path });
            }

            // Copy app data and merge configs
            const appMigrationDirName = 'data-migration';
            const appMigrationDirPath = path.join(updateInfo.path, appMigrationDirName);
            execSync(`mkdir -p ${appMigrationDirPath} && cp -a ${configDir}/. ${appMigrationDirPath}`);

            if (process.env.DB_TYPE === constants.DB_TYPE.psql && process.env.NODE_ENV !== 'development') {
                execSync('/etc/init.d/postgresql start');
            } else {
                process.env.SEQUELIZEDB = path.join(appMigrationDirPath, 'system.db');
            }
            // Run migrations
            let output = execSync(
                './node_modules/.bin/sequelize db:migrate --config config/sequelizeConfig.js',
                { cwd: updateInfo.path },
            );
            logger.trace(output.toString('utf8'));

            output = execSync(
                './node_modules/.bin/sequelize db:seed:all --config config/sequelizeConfig.js',
                { cwd: updateInfo.path },
            );
            logger.trace(output.toString('utf8'));

            // Run post-update script if available.
            const postupdateScriptPath = path.join(updateInfo.path, 'testnet', 'postupdate.js');
            if (fs.existsSync(postupdateScriptPath)) {
                execSync(`node ${postupdateScriptPath} --configDir=${configDir}`, { cwd: updateInfo.path });
            }

            // Copy all the logs if any.
            execSync(`cp -r ${path.join(otNodeRootPath, 'logs')} ${updateInfo.path} || true`);

            // Return back migrated 'application-data'.
            execSync(`cp -af ${appMigrationDirPath}/. ${configDir}`);

            // Potential risk of race condition here. Coping and linking has to be atomic operation.
            const previousVersionPath = fs.realpathSync('/ot-node/current');
            // Just replace current link.
            execSync(`ln -fns ${updateInfo.path} /ot-node/current`);

            const fileList = fs.readdirSync('/ot-node');
            fileList.forEach((fileName) => {
                const filePath = `/ot-node/${fileName}`;
                if (fs.lstatSync(filePath).isDirectory()
                    && filePath !== updateInfo.path
                    && filePath !== previousVersionPath
                    && /^\d+\.\d+\.\d+$/.test(fileName)) {
                    execSync(`rm -r ${filePath}`);
                    logger.trace(`Successfully removed old version directory: ${filePath}`);
                }
            });

            logger.important(`OT Node updated to ${updateInfo.version}. Resetting...`);
            process.exit(2);
        } catch (error) {
            logger.error(`Failed to run update. ${error}.\n${error.stack}`);
        }
        // Potential problems:
        // * If Supervisor's config was changed then docker container has to
        //   be restarted to take all the effects.
    }

    upgradeContainer() {
        // Check if container is in old format.
        const currentPath = '/ot-node/current';

        if (fs.existsSync(currentPath)) {
            if (fs.existsSync('/ot-node/testnet/start.sh')) {
                logger.info('Running upgraded container. Consider creating new one.');
            }
            return false;
        }

        logger.info('Upgrading the container\'s filesystem.');

        const initPath = '/ot-node/init';
        const basePath = '/ot-node';

        // Move files to the '/ot-node/init'.
        execSync(`mkdir -p ${initPath}`);

        execSync(
            'find . ! -path . -a -not \\( -name ".origintrail_noderc" -o -name "init" -o -name "data" -o -name "certs" \\) -maxdepth 1 -exec mv {} init/ \\;',
            { cwd: basePath },
        );
        execSync(`rm -rf ${path.join(initPath, 'node_modules')}`);
        execSync(`ln -s ${initPath} ${currentPath}`);

        logger.info('Installing new node modules.');
        try {
            execSync('npm install', { cwd: initPath });
        } catch (err) {
            if (err.stdout) {
                logger.error(`STDOUT: ${err.stdout.toString()}`);
            }
            if (err.stderr) {
                logger.error(`STDERR: ${err.stderr.toString()}`);
            }
            if (err.pid) {
                logger.error(`PID: ${err.pid}`);
            }
            if (err.signal) {
                logger.error(`SIGNAL: ${err.signal}`);
            }
            if (err.status) {
                logger.error(`STATUS: ${err.status}`);
            }
            logger.error(`npm install failed. ${err}.`);
            logger.error(`Failed to install modules. Please install it manually in ${initPath} path.`);
        }

        logger.info('Update entrypoint.');

        const startSh =
            `#!/usr/bin/env bash
export OT_NODE_DISTRIBUTION=docker
exec /usr/bin/supervisord -c /ot-node/current/testnet/supervisord.conf
`;

        execSync('mkdir -p /ot-node/testnet/');
        fs.writeFileSync('/ot-node/testnet/start.sh', startSh);
        execSync('chmod a+x /ot-node/testnet/start.sh');
        logger.info('Upgrading container finished. Shutting down the Docker container.');
        // Because the older version of the OT's docker container use shell script (start.sh) for
        // a parent process we cannot call process.kill(1, 'SIGTERM') on it, since shell won't
        // forward signal to its child process. We have to kill supervisor daemon directly.
        // Note above, we created shell script with the 'exec' inside to replace the shell process,
        // allowing for supervisor process to collect the signals.
        execSync('kill -9 $(cat /run/supervisord.pid)');
        return true;
    }


    async runOperationDbMigration() {
        const migrationsStartedMills = Date.now();

        const m6OperationalDBMigrationFilename = '6_m6OperationalDBMigrationFile';
        const migrationDir = path.join(localConfiguration.appDataPath, 'migrations');
        const migrationFilePath = path.join(migrationDir, m6OperationalDBMigrationFilename);
        if (!fs.existsSync(migrationFilePath)) {
            const migration = new M6OperationalDBMigration({
                log: logger,
                config: localConfiguration,
            });
            try {
                logger.info('Initializing operational db migration...');
                const result = await migration.run();
                if (result === 0) {
                    logger.notify(`One-time operational db migration completed. Lasted ${Date.now() - migrationsStartedMills} millisecond(s)`);
                    await Utilities.writeContentsToFile(migrationDir, m6OperationalDBMigrationFilename, 'PROCESSED');
                } else {
                    logger.error('Operational db migration failed. Defaulting to previous implementation');
                }
            } catch (e) {
                logger.error(`Failed to run code migrations. Lasted ${Date.now() - migrationsStartedMills} millisecond(s). ${e.message}`);
                console.log(e);
                process.exit(1);
            }
        }
    }

    main() {
        const localConfigPath = path.join('/ot-node/', `.${pjson.name}rc`);
        let externalConfig = {};

        // Use any previous saved configuration
        if (fs.existsSync(localConfigPath)) {
            externalConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
        }

        deepExtend(localConfiguration, externalConfig);
        logger.info('Configuration:');
        // Mask private key before printing it.
        const externalConfigClean = Utilities.copyObject(externalConfig);
        externalConfigClean.blockchain.implementations.forEach((implementation) => {
            implementation.node_private_key = '*** MASKED ***';
        });
        if (externalConfigClean.node_private_key) {
            externalConfigClean.node_private_key = '*** MASKED ***';
        }
        logger.info(JSON.stringify(externalConfigClean, null, 4));

        fs.writeFileSync(`.${pjson.name}rc`, JSON.stringify(externalConfig, null, 4));

        // eslint-disable-next-line
        require('../ot-node');
    }
}

const registerNode = new RegisterNode();
registerNode.start();
