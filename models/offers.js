const uuidv4 = require('uuid/v4');

module.exports = (sequelize, DataTypes) => {
    const offers = sequelize.define('offers', {
        id: {
            type: DataTypes.STRING,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        offer_id: DataTypes.STRING,
        data_set_id: DataTypes.STRING,
        holding_time_in_minutes: DataTypes.INTEGER,
        token_amount_per_holder: DataTypes.STRING,
        litigation_interval_in_minutes: DataTypes.INTEGER,
        red_litigation_hash: DataTypes.STRING,
        blue_litigation_hash: DataTypes.STRING,
        green_litigation_hash: DataTypes.STRING,
        task: DataTypes.STRING,
        urgent: DataTypes.BOOLEAN,
        status: DataTypes.STRING,
        global_status: DataTypes.STRING,
        message: DataTypes.STRING,
        transaction_hash: DataTypes.STRING(128),
        number_of_replications: DataTypes.INTEGER,
        number_of_verified_replications: DataTypes.INTEGER,
        trac_in_base_currency_used_for_price_calculation: DataTypes.STRING,
        gas_price_used_for_price_calculation: DataTypes.STRING,
        price_factor_used_for_price_calculation: DataTypes.INTEGER,
        offer_finalize_transaction_hash: DataTypes.STRING(128),
        blockchain_id: DataTypes.STRING,
        replication_start_timestamp: DataTypes.STRING,
    }, {});
    offers.associate = (models) => {
    // associations can be defined here
    };
    return offers;
};
