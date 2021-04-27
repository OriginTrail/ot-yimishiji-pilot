const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const pruning_history = sequelize.define('pruning_history', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        data_set_id: DataTypes.STRING,
        imported_timestamp: DataTypes.STRING,
        pruned_timestamp: DataTypes.STRING,
    }, {});
    pruning_history.associate = (models) => {
        // associations can be defined here
    };
    return pruning_history;
};
