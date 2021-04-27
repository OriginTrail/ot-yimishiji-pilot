const global_config = require('../config/config');

if (!process.env.NODE_ENV) {
    // Environment not set. Use the production.
    process.env.NODE_ENV = 'testnet';
}

const environment = process.env.NODE_ENV === 'mariner' ? 'mainnet' : process.env.NODE_ENV;
if (['mainnet', 'testnet', 'development'].indexOf(environment) < 0) {
    throw Error(`Unsupported node environment ${environment}`);
}
const environmentConfig = global_config[environment];
const blockchain_id = environmentConfig.blockchain.implementations[0].network_id;

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const commands = await queryInterface.sequelize.query('SELECT * FROM commands WHERE name = \'dcOfferCleanupCommand\'');

        for (let i = 0; i < commands[0].length; i += 1) {
            const command = commands[0][i];
            const commandData = JSON.parse(command.data);
            commandData.blockchain_id = blockchain_id;
            // eslint-disable-next-line no-await-in-loop
            await queryInterface.sequelize.query(`UPDATE commands SET data = '${JSON.stringify(commandData)}' WHERE id = '${command.id}'`);
        }
    },
    down: async (queryInterface) => {
    },
};

