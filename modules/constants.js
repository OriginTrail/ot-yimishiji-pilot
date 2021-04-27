/**
 * @constant {number} DEFAULT_NUMBER_OF_HOLDERS - Number of data holders for a dataset
 */
exports.DEFAULT_NUMBER_OF_HOLDERS = 3;
/**
 * @constant {number} REPLICATION_MIN_DELAY_MILLS - Default minimum delay for replication sending
 *        The value could be lower if the 10% of the DC choose time is shorter
 */
exports.REPLICATION_MIN_DELAY_MILLS = 4 * 60 * 1000;

/**
 * @constant {number} DEFAULT_CHALLENGE_NUMBER_OF_TESTS - Number of challenges per DH
 */
exports.DEFAULT_CHALLENGE_NUMBER_OF_TESTS = 2;

/**
 * @constant {number} DEFAULT_CHALLENGE_BLOCK_SIZE_BYTES - Block size in bytes used for Merkle tree
 */
exports.DEFAULT_CHALLENGE_BLOCK_SIZE_BYTES = 31;


/**
 * @constant {number} DEFAULT_CHALLENGE_RESPONSE_TIME_MILLS - Challenge response time
 */
exports.DEFAULT_CHALLENGE_RESPONSE_TIME_MILLS = 300000;

/**
 * @constant {number} DEFAULT_REPUTATION_UPDATE_PERIOD_MILLS - Period for updating reputation table
 */
exports.DEFAULT_REPUTATION_UPDATE_PERIOD_MILLS = 24 * 60 * 60 * 1000;

/**
 * @constant {number} DEFAULT_COMMAND_CLEANUP_TIME_MILLS - Command cleanup interval time
 */
exports.DEFAULT_COMMAND_CLEANUP_TIME_MILLS = 4 * 24 * 60 * 60 * 1000;

/**
 * @constant {number} EXPORT_COMMAND_CLEANUP_TIME_MILLS -
 * Export command cleanup interval time 1h
 */
exports.EXPORT_COMMAND_CLEANUP_TIME_MILLS = 60 * 60 * 1000;

/**
 * @constant {number} TRAIL_COMMAND_CLEANUP_TIME_MILLS -
 * Trail command cleanup interval time 1h
 */
exports.TRAIL_COMMAND_CLEANUP_TIME_MILLS = 60 * 60 * 1000;

/**
 * @constant {number} HANDLER_IDS_COMMAND_CLEANUP_TIME_MILLS -
 * Export command cleanup interval time 1h
 */
exports.HANDLER_IDS_COMMAND_CLEANUP_TIME_MILLS = 60 * 60 * 1000;

/**
 * @constant {number} DATASET_PRUNING_COMMAND_TIME_MILLS -
 * Datasets pruning command interval 24h
 */
exports.DATASET_PRUNING_COMMAND_TIME_MILLS = 24 * 60 * 60 * 1000;

/**
 * @constant {Array} PERMANENT_COMMANDS - List of all permanent commands
 */
exports.PERMANENT_COMMANDS = [
    'cleanerCommand', 'dcChallengesCommand', 'dhLitigationInitiatedCommand',
    'reputationUpdateCommand', 'autoupdaterCommand', 'exportCleanerCommand',
    'trailCleanerCommand', 'handlerIdsCleanerCommand', 'datasetPruningCommand',
];

/**
 * @constant {number} MAX_COMMAND_DELAY_IN_MILLS - Maximum delay for commands
 */
exports.MAX_COMMAND_DELAY_IN_MILLS = 14400 * 60 * 1000; // 10 days


/**
 * @constant {number} DEFAULT_COMMAND_REPEAT_IN_MILLS - Default repeat interval
 */
exports.DEFAULT_COMMAND_REPEAT_INTERVAL_IN_MILLS = 5000; // 5 seconds
/**
 *
 * @constant {number} GAS_PRICE_VALIDITY_TIME_IN_MILLS - gas price maximum validity time
 */
exports.GAS_PRICE_VALIDITY_TIME_IN_MILLS = 30 * 60 * 1000; // 30 min
/**
 *
 * @constant {number} TRAC_PRICE_IN_ETH_VALIDITY_TIME_IN_MILLS - trac price maximum validity time
 */
exports.TRAC_PRICE_IN_ETH_VALIDITY_TIME_IN_MILLS = 30 * 60 * 1000; // 30 min

/**
 *
 * @constant {number} AVERAGE_GAS_PRICE_MULTIPLIER - gas price multiplier
 */
exports.AVERAGE_GAS_PRICE_MULTIPLIER = 1.2;

/**
 *
 * @constant {number} BASE_PAYOUT_GAS - Gas used for payout
 */
exports.BASE_PAYOUT_GAS = 150000;

/**
 *
 * @constant {number} BLOCKCHAIN_RETRY_DELAY_IN_MILLS - Delay length for blockchain reading
 */
exports.BLOCKCHAIN_RETRY_DELAY_IN_MILLS = 20000;

/**
 *
 * @constant {number} ANSWER_LITIGATION_COMMAND_RETRIES - dhLitigationAnswerCommand retries
 */
exports.ANSWER_LITIGATION_COMMAND_RETRIES = 2;
/**
 *
 * @constant {number} ANSWER_LITIGATION_GAS_LIMIT - answerLitigation transaction gas limit
 */
exports.ANSWER_LITIGATION_GAS_LIMIT = 200000;
/**
 *
 * @constant {array} NUMBER_OF_PERMISSIONED_DATA_FIRST_LEVEL_BLOCKS -
 *  Minimal number of blocks which are used for creating permissioned data merkle tree
 */
exports.NUMBER_OF_PERMISSIONED_DATA_FIRST_LEVEL_BLOCKS = 256;
/**
 *
 * @constant {object} PURCHASE_ERROR_TYPE -
 *  Types of errors supported for permissioned data purchase
 */
exports.PURCHASE_ERROR_TYPE = {
    NODE_ERROR: 'node_error',
    ROOT_ERROR: 'root_error',
};
/**
 *
 * @constant {integer} PUBLIC_KEY_VALIDITY_IN_MILLS -
 *  Amount of time one node's public key hash is valid
 */
exports.PUBLIC_KEY_VALIDITY_IN_MILLS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 *
 * @constant {integer} PROCESS_NAME -
 *  Name of the process for grouping events for bugsnag
 */
exports.PROCESS_NAME = {
    other: 'other',
    offerHandling: 'offer-handling',
    challengesHandling: 'challenges-handling',
    litigationHandling: 'litigation-handling',
};

/**
 *
 * @constant {integer} PROCESS_NAME -
 *  Name of the process for grouping events for bugsnag
 */
exports.TRAIL_REACH_PARAMETERS = {
    extended: 'extended',
    narrow: 'narrow',
};

/**
 *
 * @constant {string} PERMISSIONED_DATA_VISIBILITY_SHOW_ATTRIBUTE -
 * visibility option for storing only attribute value to permissioned data
 */
exports.PERMISSIONED_DATA_VISIBILITY_SHOW_ATTRIBUTE = 'permissioned.show_attribute';

/**
 *
 * @constant {string} PERMISSIONED_DATA_VISIBILITY_HIDE_ATTRIBUTE -
 * visibility option for storing attribute to permissioned data
 */
exports.PERMISSIONED_DATA_VISIBILITY_HIDE_ATTRIBUTE = 'permissioned.hide_attribute';

/**
 *
 * @constant {Number} REINITIALIZE_DELAY_IN_MILLS -
 * The delay for a reinitialize attempt if a profile initialization failed
 */
exports.REINITIALIZE_DELAY_IN_MILLS = 15 * 60 * 1000;

exports.NODE_STATUS = {
    active: 'ACTIVE',
    fallback: 'FALLBACK',
    updating: 'UPDATING',
};

exports.DB_TYPE = {
    psql: 'psql',
};
