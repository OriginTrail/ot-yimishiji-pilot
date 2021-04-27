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
        await queryInterface.createTable('data_provider_wallets', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            data_info_id: {
                allowNull: false,
                type: Sequelize.INTEGER,
            },
            blockchain_id: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            wallet: {
                allowNull: false,
                type: Sequelize.STRING,
            },
        });

        await queryInterface.sequelize.query(`
            INSERT INTO data_provider_wallets (data_info_id, wallet, blockchain_id) 
            SELECT di.id, di.data_provider_wallet, '${blockchain_id}' FROM data_info di`);

        await queryInterface.removeColumn('data_info', 'data_provider_wallet');

        await queryInterface.addConstraint('data_provider_wallets', ['data_info_id'], {
            type: 'foreign key',
            name: 'data_provider_wallet_fk_data_info_id',
            references: {
                table: 'data_info',
                field: 'id',
            },
            onDelete: 'cascade',
            onUpdate: 'cascade',
        });
    },
    down: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn(
            'data_info',
            'data_provider_wallet',
            {
                type: Sequelize.STRING,
            },
        );

        await queryInterface.sequelize.query(`
            UPDATE data_info
            SET di.data_provider_wallet = dpw.wallet
            FROM
                data_info di
                INNER JOIN data_provider_wallets dpw 
                ON dpw.data_info_id = di.id AND dpw.blockchain_id = '${blockchain_id}'
        `);

        await queryInterface.changeColumn(
            'data_info',
            'data_provider_wallet',
            {
                type: Sequelize.STRING,
                allowNull: false,
            },
        );

        await queryInterface.dropTable('data_provider_wallets');
    },
};
