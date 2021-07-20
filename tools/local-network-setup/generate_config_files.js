require('dotenv').config({ path: `${__dirname}/../../.env` });

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const wallets = require('./pregenerated-values/wallets');
const template = require('./config_template');

const argv = require('minimist')(process.argv.slice(2), {
    string: ['number_of_nodes', 'config_path'],
});

const path_to_node = path.join(__dirname, '../..');

const number_of_nodes = argv.number_of_nodes ? parseInt(argv.number_of_nodes, 10) : 4;
const path_to_config = argv.config_path ? argv.config_path : path.join(__dirname, 'temporary-config-files');
console.log(`Set path to config files to ${path_to_config}`);

console.log(`Generating ${number_of_nodes} total nodes`);

try {
    execSync(`rm -rf ${path_to_config}`);
// eslint-disable-next-line no-empty
} catch (e) {}
execSync(`mkdir ${path_to_config}`);

for (let i = 0; i < number_of_nodes; i += 1) {
    let node_name;
    if (i === 0) {
        console.log('Using the preexisting identity for the first node (bootstrap)');
        node_name = 'DC';
    } else {
        node_name = `DH${i}`;
    }
    console.log(`Configuring node ${node_name}`);

    const configDir = path.join(path_to_config, `${node_name}-config-data`);
    const configPath = path.join(path_to_config, `${node_name}.json`);
    execSync(`touch ${configPath}`);

    const parsedTemplate = JSON.parse(JSON.stringify(template));

    parsedTemplate.node_rpc_port = 8900 + i;
    parsedTemplate.node_port = 5278 + i;
    parsedTemplate.node_remote_control_port = 3000 + i;
    parsedTemplate.control_port = 5800 + i;
    parsedTemplate.database.database = `origintrail-${node_name}`;
    // parsedTemplate.disableAutoPayouts = true;

    if (i === 0) {
        parsedTemplate.blockchain.implementations[0].node_wallet =
            process.env.PARACHAIN_ADDRESS;
        parsedTemplate.blockchain.implementations[0].node_private_key =
            process.env.PARACHAIN_PRIVATE_KEY;
        parsedTemplate.blockchain.implementations[0].management_wallet =
            process.env.PARACHAIN_ADDRESS;
    } else if (i === 1) {
        parsedTemplate.blockchain.implementations[0].node_wallet =
            process.env.PARACHAIN_ADDRESS_1;
        parsedTemplate.blockchain.implementations[0].node_private_key =
            process.env.PARACHAIN_PRIVATE_KEY_1;
        parsedTemplate.blockchain.implementations[0].management_wallet =
            process.env.PARACHAIN_ADDRESS_1;
    } else if (i === 2) {
        parsedTemplate.blockchain.implementations[0].node_wallet =
            process.env.PARACHAIN_ADDRESS_2;
        parsedTemplate.blockchain.implementations[0].node_private_key =
            process.env.PARACHAIN_PRIVATE_KEY_2;
        parsedTemplate.blockchain.implementations[0].management_wallet =
            process.env.PARACHAIN_ADDRESS_2;
    } else if (i === 3) {
        parsedTemplate.blockchain.implementations[0].node_wallet =
            process.env.PARACHAIN_ADDRESS_3;
        parsedTemplate.blockchain.implementations[0].node_private_key =
            process.env.PARACHAIN_PRIVATE_KEY_3;
        parsedTemplate.blockchain.implementations[0].management_wallet =
            process.env.PARACHAIN_ADDRESS_3;
    }

    parsedTemplate.blockchain.implementations[0].rpc_server_url =
        process.env.PARACHAIN_ACCESS_KEY;
    parsedTemplate.blockchain.implementations[0].hub_contract_address =
        process.env.PARACHAIN_HUB_ADDRESS;

    // Uncomment if you want nodes to have different blockchain setups and for some nodes to be DVs
    // if (node_name === 'DH2' || node_name === 'DH6') {
    //     parsedTemplate.blockchain.implementations.splice(0,1);
    //     if (node_name === 'DH6') {
    //         parsedTemplate.blockchain.implementations[0].dh_price_factor = '10000000';
    //     }
    // } else if (node_name === 'DH3' || node_name === 'DH7') {
    //     parsedTemplate.blockchain.implementations.splice(1,1);
    //     if (node_name === 'DH7') {
    //         parsedTemplate.blockchain.implementations[0].dh_price_factor = '10000000';
    //     }
    // } else if (node_name === 'DH4' || node_name === 'DH8') {
    //     parsedTemplate.blockchain.implementations.splice(1,1);
    //     if (node_name === 'DH7') {
    //         parsedTemplate.blockchain.implementations[0].dh_price_factor = '10000000';
    //     }
    // } else if (node_name === 'DH5' || node_name === 'DH9') {
    //     parsedTemplate.blockchain.implementations.reverse();
    //     if (node_name === 'DH9') {
    //         parsedTemplate.blockchain.implementations[0].dh_price_factor = '10000000';
    //         parsedTemplate.blockchain.implementations[1].dh_price_factor = '10000000';
    //         parsedTemplate.blockchain.implementations[2].dh_price_factor = '10000000';
    //     }
    // }

    // Uncomment if you want DH4 to be a DV
    // if (node_name === 'DH4') {
    //     parsedTemplate.blockchain.implementations[0].dh_price_factor = '10000000';
    //     parsedTemplate.blockchain.implementations[1].dh_price_factor = '10000000';
    //     parsedTemplate.blockchain.implementations[2].dh_price_factor = '10000000';
    // }

    fs.writeFileSync(`${configPath}`, JSON.stringify(parsedTemplate, null, 2));
    try {
        execSync(`mkdir ${configDir}`);
        execSync(`cd ${path_to_node} && npm run setup:hard -- --configDir=${configDir} --config=${configPath}`);
    } catch (e) {
        process.exit(1);
    }

    if (node_name === 'DC') {
        const identityFilePath = path.join(__dirname, 'pregenerated-values');
        execSync(`cp ${identityFilePath}/kademlia.crt ${configDir}/kademlia.crt`);
        execSync(`cp ${identityFilePath}/kademlia.key ${configDir}/kademlia.key`);
        execSync(`cp ${identityFilePath}/dc_network_identity.json ${configDir}/identity.json`);
    }
}
