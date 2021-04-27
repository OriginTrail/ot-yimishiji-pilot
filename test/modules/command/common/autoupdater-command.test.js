/* eslint-disable no-unused-expressions */
const {
    describe, before, after, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const semver = require('semver');
const fs = require('fs');
const rc = require('rc');
const restify = require('restify');
const request = require('request');
const path = require('path');
const tmpdir = require('os').tmpdir();
const uuidv4 = require('uuid/v4');
const { execSync } = require('child_process');

const Command = require('../.././../../modules/command/command');
const AutoupdaterCommand = require('../.././../../modules/command/common/autoupdater-command');

const defaultConfig = require('../../../../config/config.json').development;
const pjson = require('../../../../package.json');

const logger = require('../../../../modules/logger');

const patchVersion = semver.patch(pjson.version);
const majorVersion = semver.major(pjson.version);
const minorVersion = semver.minor(pjson.version);
const newPatchVersion = `${majorVersion}.${minorVersion}.${patchVersion + 1}`;
const newMajorVersion = `${majorVersion + 1}.${minorVersion}.${patchVersion}`;

class MockProcess {
    constructor() {
        this.env = process.env;
        this.exit = () => {};
    }
}

describe('Checks AutoupdaterCommand logic', () => {
    let nodeProcess;
    let context;
    let config;

    beforeEach('Preparation', async () => {
        config = rc(pjson.name, defaultConfig);
        config.appDataPath = '/dummy/path';
        nodeProcess = new MockProcess();
        context = {
            logger,
            config,
        };

        nodeProcess.env.OT_NODE_DISTRIBUTION = 'docker';
    });

    it('should construct normally', () => {
        const command = new AutoupdaterCommand(context, nodeProcess);
        expect(command).to.be.ok;
    });

    it('should not execute outside docker environment', async () => {
        nodeProcess.env.OT_NODE_DISTRIBUTION = '';

        const command = new AutoupdaterCommand(context, { process: nodeProcess });
        expect(await command.execute()).to.deep.equal(Command.empty());
    });

    it('should not execute outside docker environment', async () => {
        nodeProcess.env.OT_NODE_DISTRIBUTION = '';

        const command = new AutoupdaterCommand(context, { process: nodeProcess });
        expect(await command.execute()).to.deep.equal(Command.empty());
    });

    describe('Checks basic functionality', () => {
        const serverAddress = 'localhost';
        const serverPort = 8080;
        const serverBaseUrl = `http://${serverAddress}:${serverPort}`;
        let server;
        const dummyAppPackageJson = {
            name: 'dummyapp',
            version: '1.0.0',
            description: '',
            main: 'index.js',
            scripts: {
                test: 'echo "Error: no test specified" && exit 1',
            },
            author: '',
            license: 'ISC',
        };

        beforeEach('prepare local server', (done) => {
            server = restify.createServer();

            server.listen(serverPort, serverAddress, err => done(err));
        });

        it('should check for update and ignore it', async () => {
            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                // Return current package JSON. Version is the same.
                res.send(pjson);
                next();
            });

            const command = new AutoupdaterCommand(context, { process: nodeProcess });
            expect(await command.execute()).to.deep.equal(Command.repeat());
        });

        it('should check for update and prepare the update', async () => {
            const remotePjson = Object.assign({}, dummyAppPackageJson);
            remotePjson.version = newPatchVersion;

            const remoteSourceDirname = uuidv4();
            const remoteSourcePath = path.join(tmpdir, remoteSourceDirname);
            const remoteZipPath = path.join(tmpdir, `${uuidv4()}.zip`);
            const basePath = path.join(tmpdir, uuidv4());
            const initPath = path.join(basePath, 'init');
            const currentPath = path.join(basePath, 'current');
            fs.mkdirSync(basePath);
            fs.mkdirSync(initPath);
            fs.symlinkSync(initPath, currentPath);

            fs.mkdirSync(remoteSourcePath);
            fs.writeFileSync(
                path.join(remoteSourcePath, 'package.json'),
                JSON.stringify(remotePjson, null, 4),
            );
            fs.writeFileSync(
                path.join(remoteSourcePath, 'index.js'),
                '',
            );
            execSync(
                `zip -r ${remoteZipPath} ${remoteSourceDirname}/`,
                { cwd: tmpdir },
            );

            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                res.send(remotePjson);
                next();
            });

            server.get('/release.zip', (req, res, next) => {
                const file = fs.readFileSync(remoteZipPath);
                res.writeHead(200);
                res.write(file);
                res.end();
                return next();
            });

            const command = new AutoupdaterCommand(
                context,
                {
                    process: nodeProcess,
                    updateFilepath: path.join(currentPath, 'UPDATE'),
                    destinationBasedir: basePath,
                },
            );

            let returnedErrorCode = 0;
            nodeProcess.exit = (errorCode) => {
                returnedErrorCode = errorCode;
            };
            expect(await command.execute()).to.deep.equal(Command.repeat());
            expect(returnedErrorCode).to.equal(4);

            const expectedUpdateFile = {
                version: remotePjson.version,
                path: path.join(basePath, remotePjson.version),
                configPath: config.appDataPath,
            };

            const generatedUpdateFile = JSON.parse(fs.readFileSync(path.join(currentPath, 'UPDATE'), 'utf8'));
            expect(expectedUpdateFile).to.deep.equal(generatedUpdateFile);
        }).timeout(60000);

        it('should fail to prepare update if server wont send archive', async () => {
            const remotePjson = Object.assign({}, dummyAppPackageJson);
            remotePjson.version = newPatchVersion;

            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                res.send(remotePjson);
                next();
            });

            server.get('/release.zip', (req, res, next) => {
                res.writeHead(500);
                res.end();
                return next();
            });

            const command = new AutoupdaterCommand(
                context,
                {
                    process: nodeProcess,
                    updateFilepath: path.join(tmpdir, 'UPDATE'),
                    destinationBasedir: tmpdir,
                },
            );

            let returnedErrorCode = -1;
            nodeProcess.exit = (errorCode) => {
                returnedErrorCode = errorCode;
            };
            expect(await command.execute()).to.deep.equal(Command.repeat());
            expect(returnedErrorCode).to.equal(-1); // Should not be called.
        });

        it('should fail to prepare update if remote package.json not available', async () => {
            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                res.writeHead(500);
                res.end();
                return next();
            });

            const command = new AutoupdaterCommand(
                context,
                {
                    process: nodeProcess,
                    updateFilepath: path.join(tmpdir, 'UPDATE'),
                    destinationBasedir: tmpdir,
                },
            );

            let returnedErrorCode = -1;
            nodeProcess.exit = (errorCode) => {
                returnedErrorCode = errorCode;
            };
            expect(await command.execute()).to.deep.equal(Command.repeat());
            expect(returnedErrorCode).to.equal(-1); // Should not be called.
        });

        it('should fail if invalid archive returned', async () => {
            const remotePjson = Object.assign({}, dummyAppPackageJson);
            remotePjson.version = newPatchVersion;

            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                res.send(remotePjson);
                next();
            });

            server.get('/release.zip', (req, res, next) => {
                res.writeHead(200);
                res.write(Buffer.from('this is not a zip archive content'));
                res.end();
                return next();
            });

            const command = new AutoupdaterCommand(
                context,
                {
                    process: nodeProcess,
                    updateFilepath: tmpdir,
                    destinationBasedir: tmpdir,
                },
            );

            let returnedErrorCode = -1;
            nodeProcess.exit = (errorCode) => {
                returnedErrorCode = errorCode;
            };
            expect(await command.execute()).to.deep.equal(Command.repeat());
            expect(returnedErrorCode).to.equal(-1); // Should not be called.
        });

        it('should fail if major version is updated', async () => {
            const remotePjson = Object.assign({}, dummyAppPackageJson);
            remotePjson.version = newMajorVersion;

            const remoteSourceDirname = uuidv4();
            const remoteSourcePath = path.join(tmpdir, remoteSourceDirname);
            const remoteZipPath = path.join(tmpdir, `${uuidv4()}.zip`);
            const basePath = path.join(tmpdir, uuidv4());
            const initPath = path.join(basePath, 'init');
            const currentPath = path.join(basePath, 'current');
            fs.mkdirSync(basePath);
            fs.mkdirSync(initPath);
            fs.symlinkSync(initPath, currentPath);

            fs.mkdirSync(remoteSourcePath);
            fs.writeFileSync(
                path.join(remoteSourcePath, 'package.json'),
                JSON.stringify(remotePjson, null, 4),
            );
            fs.writeFileSync(
                path.join(remoteSourcePath, 'index.js'),
                '',
            );
            execSync(
                `zip -r ${remoteZipPath} ${remoteSourceDirname}/`,
                { cwd: tmpdir },
            );

            config.autoUpdater = {
                enabled: true,
                packageJsonUrl: `${serverBaseUrl}/package.json`,
                archiveUrl: `${serverBaseUrl}/release.zip`,
            };

            server.get('/package.json', (req, res, next) => {
                res.send(remotePjson);
                next();
            });

            server.get('/release.zip', (req, res, next) => {
                const file = fs.readFileSync(remoteZipPath);
                res.writeHead(200);
                res.write(file);
                res.end();
                return next();
            });

            const command = new AutoupdaterCommand(
                context,
                {
                    process: nodeProcess,
                    updateFilepath: path.join(currentPath, 'UPDATE'),
                    destinationBasedir: basePath,
                },
            );

            let returnedErrorCode = 0;
            nodeProcess.exit = (errorCode) => {
                returnedErrorCode = errorCode;
            };
            expect(await command.execute()).to.deep.equal(Command.repeat());
            expect(returnedErrorCode).to.equal(0);
        });

        afterEach('shutdown local server', (done) => {
            server.close(done);
        });
    });
});
