module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn(
            'offers',
            'replication_start_timestamp',
            {
                type: Sequelize.STRING,
            },
        );
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('offers', 'replication_start_timestamp');
    },
};
