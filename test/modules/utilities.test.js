const {
    describe, it, after, before,
} = require('mocha');
const { assert, expect } = require('chai');
const fs = require('fs');
const Utilities = require('../../modules/Utilities');

const databaseData = require('./test_data/arangodb-data.js');

describe('Utilities module', () => {
    const environments = ['development', 'mainnet', 'testnet'];
    const configJson = JSON.parse(fs.readFileSync(`${__dirname}/../../config/config.json`).toString());

    it('node_config should contain certain entries', () => {
        environments.forEach((environment) => {
            const config = configJson[environment];
            assert.hasAllKeys(
                config, ['node_rpc_ip', 'node_port', 'blockchain', 'database', 'identity', 'logs_level_debug',
                    'request_timeout', 'ssl_keypath', 'node_remote_control_port', 'send_logs',
                    'ssl_certificate_path', 'identity_filepath', 'cpus', 'high_availability',
                    'embedded_peercache_path', 'onion_virtual_port', 'traverse_nat_enabled', 'traverse_port_forward_ttl', 'verbose_logging',
                    'control_port_enabled', 'control_port', 'control_sock_enabled', 'control_sock', 'onion_enabled',
                    'ssl_authority_paths', 'node_rpc_port', 'default_data_price', 'operational_db',
                    'remote_control_enabled', 'dc_challenge_retry_delay_in_millis', 'dh_challenge_retry_delay_in_millis',
                    'read_stake_factor', 'send_logs_to_origintrail', 'dataset_pruning',
                    'dh_min_reputation', 'dh_min_stake_amount', 'houston_password_file_name',
                    'is_bootstrap_node', 'houston_password', 'reverse_tunnel_address', 'reverse_tunnel_port',
                    'autoUpdater', 'bugSnag', 'network', 'dataSetStorage', 'dc_holding_time_in_minutes', 'dc_choose_time', 'dc_litigation_interval_in_minutes',
                    'dh_max_holding_time_in_minutes', 'dh_min_litigation_interval_in_minutes',
                    'requireApproval', 'dh_maximum_dataset_filesize_in_mb', 'latest_api_version', 'litigationEnabled', 'commandExecutorVerboseLoggingEnabled',
                    'reputationWindowInMinutes', 'send_challenges_log', 'node_rpc_use_ssl', 'node_rpc_ssl_key_path', 'node_rpc_ssl_cert_path'],
                `Some config items are missing in config for environment '${environment}'`,
            );
            assert.hasAllKeys(
                config.database, ['provider', 'username', 'password', 'password_file_name', 'database', 'port', 'host', 'max_path_length', 'replication_info'],
                `Some config items are missing in config.database for environment '${environment}'`,
            );
            assert.hasAllKeys(
                config.blockchain, [
                    'implementations'],
                `Some config items are missing in config.blockchain for environment '${environment}'`,
            );

            assert.hasAllKeys(
                config.blockchain.implementations[0], [
                    'blockchain_title', 'network_id', 'gas_limit', 'gas_price', 'max_allowed_gas_price',
                    'hub_contract_address', 'plugins', 'dc_price_factor', 'dh_price_factor', 'trac_price_in_base_currency', 'identity_filepath', 'node_wallet', 'node_private_key', 'management_wallet'],
                `Some config items are missing in config.blockchain.implementations for environment '${environment}'`,
            );


            assert.hasAllKeys(
                config.network, [
                    'id', 'hostname', 'bootstraps', 'churnPlugin',
                    'remoteWhitelist', 'identityDifficulty', 'bucket_size',
                    'solutionDifficulty', 'routing_table_validity_period_in_hours',
                ],
                `Some config items are missing in config.network for environment '${environment}'`,
            );
            assert.hasAllKeys(
                config.network.churnPlugin, [
                    'cooldownBaseTimeout', 'cooldownMultiplier', 'cooldownResetTime',
                ],
                `Some config items are missing in config.network.churnPlugin for environment '${environment}'`,
            );
            assert.hasAllKeys(
                config.bugSnag, ['releaseStage'],
                `Some config items are missing in config.bugSnag for environment '${environment}'`,
            );
            assert.hasAllKeys(
                config.autoUpdater, ['archiveUrl', 'enabled', 'packageJsonUrl'],
                `Some config items are missing in config.autoUpdater for environment '${environment}'`,
            );
        });
    });

    // way to check is rinkeby with our token healthy
    it.skip('getInfuraRinkebyApiMethods()', async () => {
        const response = await Utilities.getInfuraRinkebyApiMethods();
        assert.equal(response.statusCode, 200);
        assert.containsAllKeys(response.body, ['get', 'post']);
    });

    // way to chech is method from rinkeby with our token healthy
    it.skip('getBlockNumberInfuraRinkebyApiMethod()', async () => {
        const responseFromApi = await Utilities.getBlockNumberInfuraRinkebyApiMethod();
        assert.equal(responseFromApi.statusCode, 200);
        const responseFromWeb3 = await Utilities.getBlockNumberFromWeb3();
        // assert.equal(responseFromApi.body.result, responseFromWeb3);
        // Not possible to match exactly the block every time as new ones get mined,
        // so range is used
        expect(Utilities.hexToNumber(responseFromApi.body.result))
            .to.be.closeTo(Utilities.hexToNumber(responseFromWeb3), 5);
    });

    it('loadSelectedBlockchainInfo()', async () => {
        environments.forEach((environment) => {
            const config = configJson[environment];
            assert.hasAllKeys(config.blockchain.implementations[0], ['blockchain_title', 'network_id', 'gas_limit', 'plugins',
                'gas_price', 'hub_contract_address', 'max_allowed_gas_price', 'dc_price_factor', 'dh_price_factor', 'trac_price_in_base_currency', 'identity_filepath', 'node_wallet', 'node_private_key', 'management_wallet']);
            assert.equal(config.blockchain.implementations[0].blockchain_title, 'Ethereum');
        });
    });

    it('isEmptyObject check', () => {
        assert.isTrue(Utilities.isEmptyObject({}));
        assert.isFalse(Utilities.isEmptyObject([]));
        assert.isFalse(Utilities.isEmptyObject(0));
        const myObj = {
            myKey: 'Some Value',
        };
        assert.isFalse(Utilities.isEmptyObject(myObj));
    });

    it('getRandomInt check', () => {
        const max11 = Utilities.getRandomInt(11);
        assert.isAtLeast(max11, 0);
        assert.isAtMost(max11, 11);
    });

    it('getRandomIntRange check', () => {
        const max15max33 = Utilities.getRandomIntRange(15, 33);
        assert.isAtLeast(max15max33, 15);
        assert.isAtMost(max15max33, 33);
    });

    it('getRandomString check', () => {
        const mediumLong = 25;
        const randomStr = Utilities.getRandomString(mediumLong);
        assert.typeOf(randomStr, 'string');
        assert.isTrue(randomStr.length === 25);
    });

    it('isIpEqual() check', () => {
        assert.isTrue(Utilities.isIpEqual('10.234.52.124', '10.234.52.124'));
        assert.isFalse(Utilities.isIpEqual('192.168.0.1', '10.234.52.124'));
    });

    it.skip('generateSelfSignedCertificate() should gen kademlia.key and kademlia.crt', async () => {
        await Promise.all(environments.map(async (environment) => {
            const config = configJson[environment];
            const result = await Utilities.generateSelfSignedCertificate(config);
            const myKey = fs.readFileSync(`${__dirname}/../../keys/${config.ssl_keypath}`, 'utf8');
            expect(myKey).to.be.a('string');
            assert.isTrue(/^\r?\n*-----BEGIN RSA PRIVATE KEY-----\r?\n/.test(myKey));
            assert.isTrue(/\r?\n-----END RSA PRIVATE KEY-----\r?\n*$/.test(myKey));
            const myCert = fs.readFileSync(`${__dirname}/../../keys/${config.ssl_certificate_path}`, 'utf8');
            expect(myCert).to.be.a('string');
            assert.isTrue(/^\r?\n*-----BEGIN CERTIFICATE-----\r?\n/.test(myCert));
            assert.isTrue(/\r?\n-----END CERTIFICATE-----\r?\n*$/.test(myCert));
        }));
    });

    it('database settings', async () => {
        environments.forEach((environment) => {
            const config = configJson[environment];
            assert.hasAllKeys(config.database, ['provider', 'username', 'password', 'replication_info',
                'host', 'port', 'password_file_name', 'database', 'max_path_length']);
            assert.hasAllKeys(config.database.replication_info, ['endpoint', 'username', 'password', 'port']);
            assert.equal(config.database.provider, 'arangodb');
        });
    });


    it('sortObject() should return object sorted by keys', () => {
        const unsorted = {
            b: 'asdsad',
            36: 'masdas',
            '-1': 'minus one',
            a: 'dsfdsfsdf',
            A: 'dsfdsfsdf',
            p: '12345',
            _: '???????',
            D: {
                b: 'asdsad', c: 'masdas', a: 'dsfdsfsdf', p: 'mmmmmmmm', _: '???????',
            },
        };

        const expectedSorted = {
            36: 'masdas',
            '-1': 'minus one',
            _: '???????',
            a: 'dsfdsfsdf',
            A: 'dsfdsfsdf',
            b: 'asdsad',
            D:
                {
                    _: '???????',
                    a: 'dsfdsfsdf',
                    b: 'asdsad',
                    c: 'masdas',
                    p: 'mmmmmmmm',
                },
            p: '12345',
        };

        const actualSorted = Utilities.sortObject(unsorted);
        // compare values at indexes
        for (let index = 0; index < Object.keys(expectedSorted).length; index += 1) {
            assert.equal(actualSorted.index, expectedSorted.index);
        }
    });

    it('copyObject() check', () => {
        const edgeOne = databaseData.edges[0];
        const copyEdgeOne = Utilities.copyObject(edgeOne);
        assert.deepEqual(edgeOne, copyEdgeOne);
    });

    it('hexToNumber() and numberToHex check', () => {
        const hexValue = Utilities.numberToHex(500);
        const intValue = Utilities.hexToNumber(hexValue);
        assert.equal(hexValue, intValue);
    });


    it('executeCallback() callback not defined scenario', async () => {
        // helper function
        function first(timeInterval) {
            setTimeout(() => {
                console.log('Helper function log');
            }, 1000);
        }
        try {
            const result = await Utilities.executeCallback(first(), false);
            assert.isUndefined(result);
        } catch (error) {
            console.log(error);
        }
    });

    it('flattenObject() regular', () => {
        const regularObj = {
            name: 'fiiv',
            birthYear: 1986,
            favoriteColors: ['red', 'orange'],
            isWearing: {
                shirt: {
                    color: 'white',
                },
                shorts: {
                    color: 'blue',
                },
            },
        };
        const expectedFlattened = {
            name: 'fiiv',
            birthYear: 1986,
            favoriteColors_0: 'red',
            favoriteColors_1: 'orange',
            isWearing_shirt_color: 'white',
            isWearing_shorts_color: 'blue',
        };

        const flattened = Utilities.flattenObject(regularObj);
        assert.deepEqual(flattened, expectedFlattened);
    });

    it('flattenObject() null', () => {
        const flattened = Utilities.flattenObject(null);
        assert.deepEqual(flattened, null);
    });

    it('flattenObject() empty', () => {
        const flattened = Utilities.flattenObject({});
        assert.deepEqual(flattened, {});
    });

    it('objectDistance() test 1', () => {
        const obj1 = {
            a: 'abc',
        };
        const obj2 = {
            a: 'abc',
        };

        const distance = Utilities.objectDistance(obj1, obj2);
        assert.equal(distance, 100);
    });

    it('objectDistance() test 2', () => {
        const obj1 = {
            a: 'abc',
        };
        const obj2 = {
            b: 'abc',
        };

        const distance = Utilities.objectDistance(obj1, obj2);
        assert.equal(distance, 0);
    });

    it('objectDistance() test 3', () => {
        const obj1 = {
            a: {
                b: {
                    c: 'asdf',
                },
            },
        };
        const obj2 = {
            a: {
                b: {
                    c: 'asdf',
                },
            },
        };

        const distance = Utilities.objectDistance(obj1, obj2);
        assert.equal(distance, 100);
    });

    it('check shuffle() ', () => {
        const UnShuffledArray = ['a', 'b', 'c', 'd', 'e'];
        const ShuffledArray = Utilities.shuffle(UnShuffledArray);
        assert.sameMembers(UnShuffledArray, ShuffledArray, 'No blind passangers allowed on this boat');
        assert.equal(UnShuffledArray.length, ShuffledArray.length, 'Both arrays should have same lengths');
    });

    it('check unionArrays()', () => {
        const firstArray = ['1', '2', 'c', 'd', 'e'];
        const secondArray = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const result = Utilities.unionArrays(firstArray, secondArray);
        assert.includeMembers(result, firstArray);
        assert.includeMembers(result, secondArray);
        assert.equal(result.length, 9);
    });

    it('check normalizeHex', () => {
        const myNormalizedHex = Utilities.normalizeHex('123456789');
        assert.equal(myNormalizedHex.indexOf('0x'), 0, 'myNormalizedHex doesnt start with 0x');
        assert.equal(myNormalizedHex.length - 2, 9);
    });

    // TODO enable after() step after above .skip()ed tests are fixed
    // after('cleanup', () => {
    //     const keyToDelete = `${__dirname}/../../keys/${myConfig.ssl_keypath}`;
    //     const certToDelete = `${__dirname}/../../keys/${myConfig.ssl_certificate_path}`;
    //     const prvKeyToDelete = `${__dirname}/../../keys/${myConfig.private_extended_key_path}`;

    //     try {
    //         fs.unlinkSync(keyToDelete);
    //     } catch (error) {
    //         console.log(error);
    //     }
    //     try {
    //         fs.unlinkSync(certToDelete);
    //     } catch (error) {
    //         console.log(error);
    //     }
    //     try {
    //         fs.unlinkSync(prvKeyToDelete);
    //     } catch (error) {
    //         console.log(error);
    //     }
    //     myConfig = {};
    // });
});
