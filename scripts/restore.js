const fs = require('fs');
const rc = require('rc');
const argv = require('minimist')(process.argv.slice(2));
const { exec, execSync } = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');
require('dotenv').config();

const Blockchain = require('../modules/Blockchain');
const Utilities = require('../modules/Utilities');

const pjson = require('../package.json');
const defaultConfigFile = require('../config/config.json');

class RestoreService {
    constructor(logger) {
        this.logger = logger;

        // Get the environment name
        if (!process.env.NODE_ENV) {
            // Environment not set. Use the production.
            this.environment = 'testnet';
        } else if (['development', 'testnet', 'mainnet', 'mariner'].indexOf(process.env.NODE_ENV) < 0) {
            const message = `Unsupported environment '${process.env.NODE_ENV}'`;
            this.logger.error(message);
            throw Error(message);
        } else if (process.env.NODE_ENV === 'mariner') {
            this.environment = 'mainnet';
        } else {
            this.environment = process.env.NODE_ENV;
        }

        if (!argv.restore_directory) {
            this.restore_directory = this._getLatestBackup();
        } else {
            this.restore_directory = argv.restore_directory;
        }
        if (!fs.existsSync(this.restore_directory)) {
            const message = `Could not find backup directory ${this.restore_directory}`;
            this.logger.error(message);
            throw Error(message);
        }

        // Get user specified config file
        if (!argv.config) {
            this.config_location = '/ot-node/';
            this.config_name = '.origintrail_noderc';
            argv.config = path.join(this.config_location, this.config_name);
        } else {
            this.config_location = path.dirname(argv.config);
            this.config_name = path.basename(argv.config);
        }

        // Get location of node data storage
        if (!argv.configDir) {
            this.configDir = '/ot-node/data/';
        } else {
            this.configDir = argv.configDir;
        }

        // [Optional] Get location of node SSL certificates
        if (!argv.certs) {
            this.certs = '/ot-node/certs/';
        } else {
            this.certs = argv.certs;
        }

        this.config = this._loadConfiguration();
    }

    restore() {
        const identityFiles = this._getIdentityFileNames();
        const certs = this._getCertificateFileNames();
        const dataFiles = this._getDataFileNames();
        const migrationFiles = this._getMigrationFileNames();

        this._checkFolderStruct();

        const res = this._moveFileFromBackupToNode(
            this.config_name,
            this.restore_directory, this.config_location,
        );
        if (!res) {
            throw Error(`Cannot restore file ${this.config_name}`);
        }

        this.config = this._loadConfiguration();

        for (const file of identityFiles) {
            const res = this
                ._moveFileFromBackupToNode(file, this.restore_directory, this.config.appDataPath);
            if (!res) {
                throw Error(`Cannot restore file ${file}`);
            }
        }

        for (const file of dataFiles) {
            const res = this
                ._moveFileFromBackupToNode(file, this.restore_directory, this.config.appDataPath);
            if (!res) {
                throw Error(`Cannot restore file ${file}`);
            }
        }

        for (const file of certs) {
            this._moveFileFromBackupToNode(file, this.restore_directory, this.certs, false);
        }

        for (const file of migrationFiles) {
            this._moveFileFromBackupToNode(file, path.join(this.restore_directory, 'migrations'), path.join(this.config.appDataPath, 'migrations'));
        }

        this._moveDatabaseFromBackupToNode();

        this.logger.log('***********************************************');
        this.logger.log('*****                                     *****');
        this.logger.log('***        Restore process complete!        ***');
        this.logger.log('*****                                     *****');
        this.logger.log('***********************************************');
    }

    _getLatestBackup() {
        const backupRepository = '/ot-node/backup/';

        if (!fs.existsSync(backupRepository)) {
            throw Error('Could not find backup directory /ot-node/backup/');
        }

        const backupContents = fs.readdirSync(backupRepository);

        const out = [];
        backupContents.forEach((directory) => {
            const stats = fs.statSync(path.join(backupRepository, directory));
            if (stats.isDirectory()) {
                out.push({ directory, mtime: stats.mtime.getTime() });
            }
        });

        if (out.length === 0) {
            throw Error('Could not find latest backup directory');
        }
        out.sort((a, b) => b.mtime - a.mtime);

        return path.join(backupRepository, out[0].directory);
    }

    _loadConfiguration() {
        try {
            const defaultConfig = Utilities.copyObject(defaultConfigFile[this.environment]);
            const defaultBlockchainConfig = Utilities.copyObject(defaultConfig.blockchain);

            // Load config.
            const config = rc(pjson.name, defaultConfig);

            config.appDataPath = this.configDir;
            config.blockchain =
                Blockchain.attachDefaultConfig(config.blockchain, defaultBlockchainConfig);

            return config;
        } catch (error) {
            throw Error(`Failed to read configuration. ${error}.`);
        }
    }

    _getIdentityFileNames() {
        const identityFileNames = [];

        for (const blockchain of this.config.blockchain.implementations) {
            identityFileNames.push(blockchain.identity_filepath);
        }

        const { identity_filepath } = this.config;
        identityFileNames.push(identity_filepath);

        return identityFileNames;
    }

    _getCertificateFileNames() {
        const certificateFileNames = [];

        certificateFileNames.push('fullchain.pem');
        certificateFileNames.push('privkey.pem');

        return certificateFileNames;
    }

    _getDataFileNames() {
        const dataFileNames = [];

        const dataFiles = ['kademlia.crt', 'kademlia.key', 'houston.txt', 'system.db'];
        for (const dataFile of dataFiles) {
            dataFileNames.push(dataFile);
        }

        return dataFileNames;
    }


    _getMigrationFileNames() {
        const migrationFileNames = [];
        const directoryPath = path.join(this.restore_directory, 'migrations');
        if (fs.existsSync(directoryPath)) {
            fs.readdir(directoryPath, (err, files) => {
                files.forEach((file) => {
                    migrationFileNames.push(file);
                });
            });
        }
        return migrationFileNames;
    }

    _checkFolderStruct() {
        if (fs.existsSync(path.join(this.config.appDataPath, 'migrations'))) {
            console.log(`Directory ${path.join(this.config.appDataPath, 'migrations')} already exists.`);
            return;
        }

        console.log(`Creating ${this.config.appDataPath}/migrations directories...`);
        mkdirp.sync(`${this.config.appDataPath}/migrations`);
    }

    _moveFileFromBackupToNode(fileName, backupDir, restoreDir, showErrors = true) {
        try {
            const source = path.join(backupDir, fileName);
            if (!fs.existsSync(source)) {
                return false;
            }

            const destination = path.join(restoreDir, fileName);
            const destinationDir = path.dirname(destination);
            if (!fs.existsSync(destinationDir)) {
                execSync(`mkdir -p ${destinationDir}`);
            }

            this.logger.log(`Restore: ${source} -> ${destination}`);
            fs.copyFileSync(source, destination);
            return true;
        } catch (e) {
            if (showErrors) {
                this.logger.error(e.toString());
            }
            return false;
        }
    }

    _moveDatabaseFromBackupToNode() {
        console.log('Database import...');

        if (this.config.database.password_file_name) {
            const databasePasswordFilePath =
                path.join(this.config.appDataPath, this.config.database.password_file_name);
            if (fs.existsSync(databasePasswordFilePath)) {
                this.logger.log('Using existing graph database password.');
                this.config.database.password =
                    fs.readFileSync(databasePasswordFilePath).toString();
            } else {
                this.logger.log('================================================================');
                this.logger.log('          Using default database password for access            ');
                this.logger.log('================================================================');
            }
        }

        switch (this.config.database.provider) {
        case 'arangodb':
            execSync(
                `arangorestore --server.database ${this.config.database.database} --server.username ${this.config.database.username} --server.password ${this.config.database.password === '' ? '\'\'' : `'${this.config.database.password}'`} --input-directory '${this.restore_directory}/arangodb/' --overwrite true`,
                (error, stdout, stderr) => {
                    this.logger.log(`${stdout}`);
                    if (error !== null) {
                        throw Error(error);
                    }
                    this.logger.log('Database restore finished.');
                },
            );
            break;
        default:
        }
    }
}

module.exports = RestoreService;
