const mkdirp = require('mkdirp');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const { exec } = require('child_process');

const timestamp = new Date().toISOString();

if (!argv.config) {
    throw Error('Please provide config parameter');
}

if (!argv.backup_directory) {
    throw Error('Please provide backup_directory parameter');
}

console.log('Backup OT node...');

const configPath = argv.config.slice(0, argv.config.lastIndexOf('/'));
const configName = argv.config.slice(argv.config.lastIndexOf('/') + 1);
const configDirectory = `${configName.split('.').slice(0, -1).join('.')}-config`;
const databaseDirectory = `${configName.split('.').slice(0, -1).join('.')}-database`;
const backupPath = argv.backup_directory.replace(/\/$/, '');

console.log('Setup path variables...');

const files = ['identity.json', 'kademlia.crt', 'kademlia.key', 'houston.txt', 'system.db', configName];
const configFile = JSON.parse(fs.readFileSync(`${configPath}/${configName}`));

if (fs.existsSync(`${backupPath}/${timestamp}`)) {
    fs.rmdirSync(`${backupPath}/${timestamp}`);
    console.log(`Directory ${backupPath}/${timestamp} already exists. Removing...`);
}

console.log(`Creating ${backupPath}/${timestamp} directories...`);
mkdirp.sync(`${backupPath}/${timestamp}/${configDirectory}`, (err) => { if (err) throw err; });
mkdirp.sync(`${backupPath}/${timestamp}/${databaseDirectory}`, (err) => { if (err) throw err; });

for (const file of files) {
    let src = `${configPath}/${configDirectory}/${file}`;
    let dest = `${backupPath}/${timestamp}/${configDirectory}/${file}`;
    if (file === configName) {
        src = `${configPath}/${file}`;
        dest = `${backupPath}/${timestamp}/${file}`;
    }

    console.log(`Backup: ${src} -> ${dest}`);
    fs.copyFile(src, dest, (err) => { if (err) throw err; });
}

console.log('Database export...');

switch (configFile.database.provider) {
case 'arangodb':
    exec(
        `arangodump --server.database ${configFile.database.database} --server.username ${configFile.database.username} --server.password ${configFile.database.password === '' ? '\'\'' : configFile.database.password} --output-directory '${backupPath}/${timestamp}/${databaseDirectory}/arangodb' --overwrite true`,
        (error, stdout, stderr) => {
            console.log(`${stdout}`);
            if (error !== null) {
                console.error(`${error}`);
            } else {
                console.log('Backup finished.');
            }
        },
    );
    break;
default:
}
