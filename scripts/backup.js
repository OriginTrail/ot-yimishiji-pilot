const mkdirp = require('mkdirp');
const fs = require('fs');
const rc = require('rc');
const argv = require('minimist')(process.argv.slice(2));
const { exec, execSync } = require('child_process');
const path = require('path');
require('dotenv').config();

const Blockchain = require('../modules/Blockchain');
const Utilities = require('../modules/Utilities');

const pjson = require('../package.json');
const defaultConfigFile = require('../config/config.json');

// Get the environment name
let environment;
if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    environment = 'testnet';
} else if (['development', 'testnet', 'mainnet', 'mariner'].indexOf(process.env.NODE_ENV) < 0) {
    console.error(`Unsupported environment '${process.env.NODE_ENV}'`);
    return 1;
} else if (process.env.NODE_ENV === 'mariner') {
    environment = 'mainnet';
} else {
    environment = process.env.NODE_ENV;
}

// Get user specified config file
if (!argv.config) {
    argv.config_location = '/ot-node/';
    argv.config = '.origintrail_noderc';
} else {
    argv.config_location = path.dirname(argv.config);
    argv.config = path.basename(argv.config);
}

// Get location of node data storage
if (!argv.configDir) {
    argv.configDir = '/ot-node/data/';
}

// Get location of the backup folder
if (!argv.backup_directory) {
    argv.backup_directory = '/ot-node/backup/';
}

// [Optional] Get location of node SSL certificates
if (!argv.certs) {
    argv.certs = '/ot-node/certs/';
}

let config;
function loadConfiguration() {
    try {
        const defaultConfig = Utilities.copyObject(defaultConfigFile[environment]);
        const defaultBlockchainConfig = Utilities.copyObject(defaultConfig.blockchain);

        // Load config.
        config = rc(pjson.name, defaultConfig);

        config.appDataPath = argv.configDir;
        config.blockchain =
            Blockchain.attachDefaultConfig(config.blockchain, defaultBlockchainConfig);
    } catch (error) {
        console.error(`Failed to read configuration. ${error}.`);
        console.error(error.stack);
        process.abort();
    }
}

function getIdentityFileNames() {
    const identityFileNames = [];

    for (const blockchain of config.blockchain.implementations) {
        identityFileNames.push(blockchain.identity_filepath);
    }

    const { identity_filepath } = config;
    identityFileNames.push(identity_filepath);

    return identityFileNames;
}

function getCertificateFileNames() {
    const certificateFileNames = [];

    certificateFileNames.push('fullchain.pem');
    certificateFileNames.push('privkey.pem');

    return certificateFileNames;
}

function getDataFileNames() {
    return ['kademlia.crt', 'kademlia.key', 'houston.txt', 'system.db'];
}

function getMigrationFileNames() {
    const migrationFileNames = [];
    const directoryPath = path.join(config.appDataPath, 'migrations');
    if (fs.existsSync(directoryPath)) {
        fs.readdir(directoryPath, (err, files) => {
            files.forEach((file) => {
                migrationFileNames.push(file);
            });
        });
    }
    return migrationFileNames;
}

function moveFileFromNodeToBackup(fileName, nodeDir, backupDir, showErrors = true) {
    try {
        const source = path.join(nodeDir, fileName);
        if (!fs.existsSync(source)) {
            return false;
        }

        const destination = path.join(backupDir, fileName);
        const destinationDir = path.dirname(destination);
        if (!fs.existsSync(destinationDir)) {
            execSync(`mkdir -p ${destinationDir}`);
        }

        console.log(`Backup: ${source} -> ${destination}`);
        fs.copyFileSync(source, destination);
        return true;
    } catch (e) {
        if (showErrors) {
            console.log(e.toString());
        }
        return false;
    }
}

function createBackupFolder() {
    let timestamp = new Date().toISOString();

    while (fs.existsSync(path.join(argv.backup_directory, timestamp))) {
        console.log(`Directory ${path.join(argv.backup_directory, timestamp)} already exists. Generating new timestamp...`);
        timestamp = new Date().toISOString();
    }

    console.log(`Creating ${argv.backup_directory}/${timestamp} directories...`);
    mkdirp.sync(`${argv.backup_directory}/${timestamp}`);
    mkdirp.sync(`${argv.backup_directory}/${timestamp}/migrations`);

    return path.join(argv.backup_directory, timestamp);
}

function main() {
    let backupDir;
    try {
        loadConfiguration();
        const identityFiles = getIdentityFileNames();
        const certs = getCertificateFileNames();
        const dataFiles = getDataFileNames();
        const migrationFiles = getMigrationFileNames();

        backupDir = createBackupFolder();

        const res = moveFileFromNodeToBackup(argv.config, argv.config_location, backupDir);
        if (!res) {
            throw Error(`Cannot backup file ${argv.config}`);
        }

        for (const file of identityFiles) {
            const res = moveFileFromNodeToBackup(file, config.appDataPath, backupDir);
            if (!res) {
                throw Error(`Cannot backup file ${file}`);
            }
        }

        for (const file of dataFiles) {
            const res = moveFileFromNodeToBackup(file, config.appDataPath, backupDir);
            if (!res) {
                throw Error(`Cannot backup file ${file}`);
            }
        }

        for (const file of certs) {
            moveFileFromNodeToBackup(file, argv.certs, backupDir, false);
        }

        for (const file of migrationFiles) {
            moveFileFromNodeToBackup(file, path.join(config.appDataPath, 'migrations'), path.join(backupDir, 'migrations'));
        }

        console.log('Database export...');

        if (config.database.password_file_name) {
            // eslint-disable-next-line max-len
            const databasePasswordFilePath = path.join(argv.configDir, config.database.password_file_name);
            if (fs.existsSync(databasePasswordFilePath)) {
                console.log('Using existing graph database password.');
                config.database.password = fs.readFileSync(databasePasswordFilePath).toString();
            } else {
                console.log('================================================================');
                console.log('          Using default database password for access            ');
                console.log('================================================================');
            }
        }

        let databaseName;
        switch (config.database.provider) {
        case 'arangodb':
            databaseName = 'arangodb';
            exec(
                `arangodump --server.database ${config.database.database} --server.username ${config.database.username} --server.password ${config.database.password === '' ? '\'\'' : `'${config.database.password}'`} --output-directory '${backupDir}/arangodb' --overwrite true`,
                (error, stdout, stderr) => {
                    console.log(`${stdout}`);
                    if (error !== null) {
                        console.log('***********************************************');
                        console.log('*****                                     *****');
                        console.log('***        Backup process FAILED!           ***');
                        console.log('*****                                     *****');
                        console.log('***********************************************');

                        console.log('Database backup process failed, aborting!');
                        console.error(`${error}`);

                        console.log('Please contact support for alternative instructions on backing up your node');

                        if (fs.existsSync(`${backupDir}`)) {
                            exec(`rm -rf ${backupDir}`);
                        }

                        return 1;
                    }
                    console.log('***********************************************');
                    console.log('*****                                     *****');
                    console.log('***        Backup process complete!         ***');
                    console.log('*****                                     *****');
                    console.log('***********************************************');

                    fs.writeFileSync(`${backupDir}/arangodb/username.txt`, config.database.username);
                    fs.writeFileSync(`${backupDir}/arangodb/database.txt`, config.database.database);

                    process.exit(0);
                },
            );
            break;
        default:
            break;
        }

        return 0;
    } catch (error) {
        console.log('***********************************************');
        console.log('*****                                     *****');
        console.log('***        Backup process FAILED!           ***');
        console.log('*****                                     *****');
        console.log('***********************************************');

        console.log(error.message);
        console.log('Please contact support for alternative instructions on backing up your node');

        if (fs.existsSync(`${backupDir}`)) {
            exec(`rm -rf ${backupDir}`);
        }

        return 1;
    }
}

console.log('Backup OT node...');
return main();
