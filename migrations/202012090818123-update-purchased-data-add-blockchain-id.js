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
        await queryInterface.addColumn(
            'purchased_data',
            'blockchain_id',
            {
                type: Sequelize.STRING,
            },
        );

        await queryInterface.addColumn(
            'purchased_data',
            'offer_id',
            {
                type: Sequelize.STRING,
            },
        );

        await queryInterface.sequelize.query(`UPDATE purchased_data SET blockchain_id = '${blockchain_id}'`);

        await queryInterface.changeColumn(
            'purchased_data',
            'blockchain_id',
            {
                type: Sequelize.STRING,
                allowNull: false,
            },
        );
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('purchased_data', 'blockchain_id');
        await queryInterface.removeColumn('purchased_data', 'offer_id');
    },
};
