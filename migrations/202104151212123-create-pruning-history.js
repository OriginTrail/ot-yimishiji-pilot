module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('pruning_history', {
            id: {
                allowNull: false,
                primaryKey: true,
                type: Sequelize.STRING,
            },
            data_set_id: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            imported_timestamp: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            pruned_timestamp: {
                allowNull: false,
                type: Sequelize.STRING,
            },
        });
    },
    down: async (queryInterface) => {
        await queryInterface.dropTable('pruning_history');
    },
};
