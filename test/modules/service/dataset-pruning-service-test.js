const {
    describe, before, beforeEach, it,
} = require('mocha');
const { assert } = require('chai');
const logger = require('../../../modules/logger');
const DatasetPruningService = require('../../../modules/service/dataset-pruning-service');

const datasetPruningService = new DatasetPruningService({ logger });
const importedPruningDelayInMinutes = 5;
const replicatedPruningDelayInMinutes = 5;

const repackedDatasets = {
    expired_dataset_id_1: {
        dataInfo: [{ id: 'expired_data_info_id_1' }],
        offers: [],
        bids: [],
    },
    expired_dataset_id_2: {
        dataInfo: [{ id: 'expired_data_info_id_2' }],
        offers: [{ id: 'expired_offer_id_1' }],
        bids: [],
    },
    expired_dataset_id_3: {
        dataInfo: [{ id: 'expired_data_info_id_3' }],
        offers: [],
        bids: [{ id: 'expired_bid_id_1' }],
    },
    expired_dataset_id_4: {
        dataInfo: [{ id: 'expired_data_info_id_4' }],
        offers: [{ id: 'expired_offer_id_2' }],
        bids: [{ id: 'expired_bid_id_2' }],
    },
    valid_dataset_id_1: {
        dataInfo: [{ id: 'expired_data_info_id_6' }],
        offers: [{ id: 'valid_offer_id_1' }],
        bids: [],
    },
    valid_dataset_id_2: {
        dataInfo: [{ id: 'expired_data_info_id_6' }],
        offers: [{ id: 'valid_offer_id_2' }, { id: 'expired_offer_id_3' }],
        bids: [],
    },
    valid_dataset_id_3: {
        dataInfo: [{ id: 'expired_data_info_id_7' }],
        offers: [],
        bids: [{ id: 'valid_bid_id_1' }],
    },
    valid_dataset_id_4: {
        dataInfo: [{ id: 'expired_data_info_id_8' }],
        offers: [],
        bids: [{ id: 'valid_bid_id_2' }, { id: 'expired_bid_id_4' }],
    },
    valid_dataset_id_5: {
        dataInfo: [{ id: 'expired_data_info_id_9' }],
        offers: [{ id: 'valid_offer_id_3' }],
        bids: [{ id: 'valid_bid_id_3' }],
    },
    valid_dataset_id_6: {
        dataInfo: [{ id: 'expired_data_info_id_10' }],
        offers: [{ id: 'expired_offer_id_4' }],
        bids: [{ id: 'valid_bid_id_4' }],
    },
    valid_dataset_id_7: {
        dataInfo: [{ id: 'expired_data_info_id_11' }],
        offers: [{ id: 'valid_offer_id_4' }],
        bids: [{ id: 'expired_bid_id_5' }],
    },
    valid_dataset_id_8: {
        dataInfo: [{ id: 'valid_data_info_id_1' }],
        offers: [{ id: 'expired_offer_id_5' }],
        bids: [{ id: 'expired_bid_id_6' }],
    },
    valid_dataset_id_9: {
        dataInfo: [{ id: 'valid_data_info_id_2' }, { id: 'expired_data_info_id_12' }],
        offers: [{ id: 'expired_offer_id_6' }],
        bids: [{ id: 'expired_bid_id_7' }],
    },
};

const datasetsIdForPruning = [
    'expired_dataset_id_1',
    'expired_dataset_id_2',
    'expired_dataset_id_3',
    'expired_dataset_id_4',
];
const offerIdForPruning = [
    'expired_offer_id_1',
    'expired_offer_id_2',
    'expired_offer_id_3',
    'expired_offer_id_4',
];
const dataInfoIdForPruning = [
    'expired_data_info_id_1',
    'expired_data_info_id_2',
    'expired_data_info_id_3',
    'expired_data_info_id_4',
];

describe('Dataset pruning service test', () => {
    beforeEach('Setup container', async () => {
        const now = Date.now();
        const expiredTimestamp = now - (2 * importedPruningDelayInMinutes * 60 * 1000);
        const expiredHoldingTimeInMinutes = 1;
        const validHoldingTimeInMinutes = 10;

        Object.keys(repackedDatasets).forEach((key) => {
            const dataset = repackedDatasets[key];
            dataset.dataInfo.forEach((dataInfo) => {
                dataInfo.importTimestamp = dataInfo.id.startsWith('expired') ? expiredTimestamp : now;
            });
            dataset.offers.forEach((offer) => {
                offer.holdingTimeInMinutes = offer.id.startsWith('expired') ? expiredHoldingTimeInMinutes : validHoldingTimeInMinutes;
            });
            dataset.bids.forEach((bid) => {
                bid.holdingTimeInMinutes = bid.id.startsWith('expired') ? expiredHoldingTimeInMinutes : validHoldingTimeInMinutes;
            });
        });
    });

    it('Get ids for pruning method test', async () => {
        const idsForPruning = datasetPruningService.getIdsForPruning(
            repackedDatasets,
            importedPruningDelayInMinutes,
            replicatedPruningDelayInMinutes,
        );

        assert.deepEqual(idsForPruning.dataInfoIdToBeDeleted, dataInfoIdForPruning, 'Wrong datainfo ids for pruning');
        assert.deepEqual(idsForPruning.offerIdToBeDeleted, offerIdForPruning, 'Wrong offer ids for pruning');
        assert.deepEqual(idsForPruning.datasetsToBeDeleted.map(e => e.datasetId), datasetsIdForPruning, 'Wrong dataset ids for pruning');
    });
});
