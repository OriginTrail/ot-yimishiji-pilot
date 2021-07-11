const {
    describe, before, after, it,
} = require('mocha');
const { assert } = require('chai');

const sleep = require('sleep-async')().Promise;
const awilix = require('awilix');
const rc = require('rc');
const constants = require('./../../../../modules/constants');

const models = require('../../../../models/index');
const CommandResolver = require('../.././../../modules/command/command-resolver');
const DCReplicationSendCommand = require('../.././../../modules/command/dc/dc-replication-send-command');

const defaultConfig = require('../../../../config/config.json').development;
const pjson = require('../../../../package.json');

const testUtilities = require('../../test-utilities');

describe('Checks DCReplicationSendCommand execute() logic', function () {
    this.timeout(5000);
    let config;
    let container;
    let myCommand;
    let mockLogger;

    before('Setup preconditions and call DCReplicationSendCommand execute function', async () => {
        config = rc(pjson.name, defaultConfig);
        await testUtilities.recreateDatabase();

        // Create the container and set the injectionMode to PROXY (which is also the default).
        container = awilix.createContainer({
            injectionMode: awilix.InjectionMode.PROXY,
        });

        const mockBlockchain = {
            getWalletPurposes: () => ({
                response: [constants.IDENTITY_PERMISSION.action],
            }),
        };

        const mockConfig = {
            dc_choose_time: 72000,
        };

        container.register({
            config: awilix.asValue(mockConfig),
            blockchain: awilix.asValue(mockBlockchain),
            commandResolver: awilix.asClass(CommandResolver),
            transport: awilix.asValue({}),
            dcService: awilix.asValue({}),
            permissionedDataService: awilix.asValue({}),
            importService: awilix.asValue({}),
            profileService: awilix.asValue({}),
            replicationService: awilix.asValue({}),
            dcReplicationSendCommand: awilix.asClass(DCReplicationSendCommand),
        });
    });


    it('DC should not create new replicated data entry for same offer id and identity', async () => {
        myCommand = {
            data: {
                identity: `0x${'1234'.padStart(64, '0')}`,
                wallet: `0x${'7890'.padStart(64, '0')}`,
                dhIdentity: '0xfe109af514aef462b86a02e032d1add2ce59a224cd095aa87716b1ad26aa08ca',
                offerId: `0x${'2456'.padStart(64, '0')}`,
                replicationStartTime: Date.now(),
            },
        };

        await models.replicated_data.create({
            dh_id: myCommand.data.identity,
            dh_wallet: myCommand.data.wallet,
            dh_identity: myCommand.data.dhIdentity,
            offer_id: myCommand.data.offerId,
            color: 1,
            litigation_public_key: '',
            distribution_public_key: '',
            distribution_private_key: '',
            litigation_root_hash: '',
            distribution_root_hash: '',
            distribution_epk: '',
            status: '',
        });
        let loggerCalled = false;
        mockLogger = {
            warn: (message) => {
                loggerCalled = message ===
                    `Already sent replication data for offer ${myCommand.data.offerId} to ${myCommand.data.identity}`;
            },
        };
        container.register({
            logger: awilix.asValue(mockLogger),
        });
        const dcReplicationSendCommand = container.resolve('dcReplicationSendCommand');

        // call command's execute function
        models.sequelize.transaction(async t => dcReplicationSendCommand.execute(myCommand, t));
        // allow some time for command to be executed
        await sleep.sleep(1000);

        assert.isTrue(loggerCalled);
    });
});
