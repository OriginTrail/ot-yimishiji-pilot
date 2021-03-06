/* eslint-disable no-unused-expressions */

const {
    And, But, Given, Then, When,
} = require('cucumber');
const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const { keccak_256 } = require('js-sha3');
const BN = require('bn.js');

const utilities = require('./lib/utilities');
const erc725ProfileAbi = require('../../../modules/Blockchain/Ethereum/abi/erc725');

Given(/^I manually create ERC725 identity for (\d+)[st|nd|rd|th]+ node$/, async function (nodeIndex) {
    expect(this.state.localBlockchain, 'No blockchain.').to.not.be.undefined;
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];
    this.state.manualStuff.erc725Identities = [];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        // eslint-disable-next-line no-await-in-loop
        const identityContractInstance = await this.state.localBlockchain[i].createIdentity(
            implementation.node_wallet,
            implementation.node_private_key,
            implementation.management_wallet,
        );
        expect(identityContractInstance._address).to.not.be.undefined;
        this.state.manualStuff.erc725Identities.push(identityContractInstance._address);
        i += 1;
    }
});

When(/^I use the created ERC725 identity in (\d+)[st|nd|rd|th]+ node$/, async function (nodeIndex) {
    expect(this.state.localBlockchain, 'No blockchain.').to.not.be.undefined;
    expect(this.state.manualStuff.erc725Identities, 'No ERC725 identity.').to.not.be.undefined;
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        fs.writeFileSync(
            path.join(node.options.configDir, implementation.identity_filepath),
            JSON.stringify({ identity: this.state.manualStuff.erc725Identities[i] }),
        );
        i += 1;
    }
});

Then(/^the (\d+)[st|nd|rd|th]+ node should have a valid ERC725 identity/, async function (nodeIndex) {
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        const erc725ProfileJsonPath =
            path.join(node.options.configDir, implementation.identity_filepath);
        const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
        expect(erc725Profile).to.have.key('identity');

        const erc725ProfileAddress = erc725Profile.identity;
        const { web3 } = this.state.localBlockchain[i];
        const erc725Contract = new web3.eth.Contract(erc725ProfileAbi);
        erc725Contract.options.address = erc725ProfileAddress;

        const hashedAddress = keccak_256(Buffer.from(utilities.denormalizeHex(implementation.node_wallet), 'hex'));
        // eslint-disable-next-line no-await-in-loop,max-len
        const result = await erc725Contract.methods.getKey(utilities.normalizeHex(hashedAddress)).call();

        expect(result).to.have.keys(['0', '1', '2', 'purposes', 'keyType', 'key']);
        expect(result.purposes).to.have.ordered.members(['1', '2', '3', '4']);

        i += 1;
    }
});

Then(/^the (\d+)[st|nd|rd|th]+ node should have a valid profile$/, async function (nodeIndex) {
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];
    const nodeId = node.state.identity;
    // Profile file should exist in app-data-path.

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        const erc725ProfileJsonPath =
            path.join(node.options.configDir, implementation.identity_filepath);
        const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
        expect(erc725Profile).to.have.key('identity');

        const erc725ProfileAddress = erc725Profile.identity;
        // eslint-disable-next-line no-await-in-loop,max-len
        const result = await this.state.localBlockchain[i].contracts.ProfileStorage.instance.methods.profile(erc725ProfileAddress).call();

        expect(result.nodeId, `Got ${JSON.stringify(result)}`).to.equal(`0x${nodeId}000000000000000000000000`);
        expect(new BN(result.stake).gt(new BN(0)), `Got ${JSON.stringify(result)}`).to.be.true;

        i += 1;
    }
});

When(/^I set up the (\d+)[st|nd|rd|th]+ node as the parent of the (\d+)[st|nd|rd|th]+ node$/, async function (parentIndex, nodeIndex) {
    expect(this.state.localBlockchain, 'No blockchain.').to.not.be.undefined;
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(parentIndex, 'Invalid parent index.').to.be.within(0, this.state.nodes.length);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const subidentityIndex = new BN(237);

    const parentNode = this.state.nodes[parentIndex - 1];
    const node = this.state.nodes[nodeIndex - 1];

    const nodeWalletPath = path.join(
        parentNode.options.configDir,
        parentNode.options.nodeConfiguration.blockchain.implementations[0].node_wallet_path,
    );
    const parentNodeWallet = JSON.parse(fs.readFileSync(nodeWalletPath, 'utf8')).node_wallet;

    // Profile file should exist in app-data-path.
    const erc725ProfileJsonPath = path.join(node.options.configDir, 'erc725_identity.json');
    const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
    expect(erc725Profile).to.have.key('identity');

    // Parent profile file should exist in app-data-path.
    const parentErc725ProfileJsonPath = path.join(parentNode.options.configDir, 'erc725_identity.json');
    const parentErc725Profile = JSON.parse(fs.readFileSync(parentErc725ProfileJsonPath, 'utf8'));
    expect(parentErc725Profile).to.have.key('identity');

    const parentErc725ProfileAddress = parentErc725Profile.identity;
    const { web3 } = this.state.localBlockchain;
    const parentErc725Contract = new web3.eth.Contract(erc725ProfileAbi);
    parentErc725Contract.options.address = parentErc725ProfileAddress;

    const nodeIdentity = erc725Profile.identity;
    const hashedIdentity = keccak_256(Buffer.from(utilities.denormalizeHex(nodeIdentity), 'hex'));

    const result = await parentErc725Contract.methods
        .addKey(
            utilities.normalizeHex(hashedIdentity),
            [subidentityIndex],
            new BN(1),
        ).send({ from: parentNodeWallet, gas: 3000000 });
    expect(result).to.include.key('events');
    expect(result.events).to.have.key('KeyAdded');
    expect(result.events.KeyAdded).to.include.key('returnValues');
    expect(result.events.KeyAdded.returnValues).to.include.keys(['key', 'purposes', 'keyType']);
    expect(result.events.KeyAdded.returnValues.key).to
        .equal(utilities.normalizeHex(hashedIdentity));
    expect(result.events.KeyAdded.returnValues.purposes).to.deep
        .equal([subidentityIndex.toString()]);
    expect(result.events.KeyAdded.returnValues.keyType).to.equal('1');
});


When(/^I add the (\d+)[st|nd|rd|th]+ node erc identity as the parent in the (\d+)[st|nd|rd|th]+ node config$/, async function (parentIndex, nodeIndex) {
    expect(this.state.localBlockchain, 'No blockchain.').to.not.be.undefined;
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(parentIndex, 'Invalid parent index.').to.be.within(0, this.state.nodes.length);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const subidentityIndex = new BN(237);

    const parentNode = this.state.nodes[parentIndex - 1];
    const node = this.state.nodes[nodeIndex - 1];

    // Profile file should exist in app-data-path.
    const erc725ProfileJsonPath = path.join(node.options.configDir, 'erc725_identity.json');
    const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
    expect(erc725Profile).to.have.key('identity');

    // Parent profile file should exist in app-data-path.
    const parentErc725ProfileJsonPath = path.join(parentNode.options.configDir, 'erc725_identity.json');
    const parentErc725Profile = JSON.parse(fs.readFileSync(parentErc725ProfileJsonPath, 'utf8'));
    expect(parentErc725Profile).to.have.key('identity');

    const parentIdentity = parentErc725Profile.identity;

    node.overrideConfiguration({ parentIdentity });
});


Then(/^the (\d+)[st|nd|rd|th]+ node should have a management wallet/, async function (nodeIndex) {
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        // Profile file should exist in app-data-path.
        const erc725ProfileJsonPath =
            path.join(node.options.configDir, implementation.identity_filepath);
        const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
        expect(erc725Profile).to.have.key('identity');

        const erc725ProfileAddress = erc725Profile.identity;
        const { web3 } = this.state.localBlockchain[i];
        const erc725Contract = new web3.eth.Contract(erc725ProfileAbi);
        erc725Contract.options.address = erc725ProfileAddress;

        // eslint-disable-next-line no-await-in-loop
        const managementWallet = await erc725Contract.methods.getKeysByPurpose(1).call();
        expect(managementWallet.length).to.be.greaterThan(0);
        expect(managementWallet[0]).to.be.not.null;

        i += 1;
    }
});


Then(/^the (\d+)[st|nd|rd|th]+ node should have a valid management wallet/, async function (nodeIndex) {
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        const hashedAddress = keccak_256(Buffer.from(utilities.denormalizeHex(implementation.node_wallet), 'hex'));
        // Profile file should exist in app-data-path.
        const erc725ProfileJsonPath =
            path.join(node.options.configDir, implementation.identity_filepath);
        const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
        expect(erc725Profile).to.have.key('identity');

        const erc725ProfileAddress = erc725Profile.identity;
        const { web3 } = this.state.localBlockchain[i];
        const erc725Contract = new web3.eth.Contract(erc725ProfileAbi);
        erc725Contract.options.address = erc725ProfileAddress;

        // eslint-disable-next-line no-await-in-loop
        const managementWallet = await erc725Contract.methods.getKeysByPurpose(1).call();
        expect(managementWallet.length).to.be.greaterThan(0);
        expect(managementWallet[0]).to.equal(`0x${hashedAddress}`);

        i += 1;
    }
});


Then(/^the (\d+)[st|nd|rd|th]+ node should have a default management wallet/, async function (nodeIndex) {
    expect(this.state.nodes.length, 'No started nodes.').to.be.greaterThan(0);
    expect(this.state.bootstraps.length, 'No bootstrap nodes.').to.be.greaterThan(0);
    expect(nodeIndex, 'Invalid index.').to.be.within(0, this.state.nodes.length);

    const node = this.state.nodes[nodeIndex - 1];

    let i = 0;
    for (const implementation of node.options.nodeConfiguration.blockchain.implementations) {
        const hashedAddress = keccak_256(Buffer.from(utilities.denormalizeHex(implementation.node_wallet), 'hex'));

        // Profile file should exist in app-data-path.
        const erc725ProfileJsonPath =
            path.join(node.options.configDir, implementation.identity_filepath);
        const erc725Profile = JSON.parse(fs.readFileSync(erc725ProfileJsonPath, 'utf8'));
        expect(erc725Profile).to.have.key('identity');

        const erc725ProfileAddress = erc725Profile.identity;
        const { web3 } = this.state.localBlockchain[i];
        const erc725Contract = new web3.eth.Contract(erc725ProfileAbi);
        erc725Contract.options.address = erc725ProfileAddress;

        const purposes = [1, 2, 3, 4];

        // eslint-disable-next-line no-await-in-loop
        await Promise.all(purposes.map(async (p) => {
            const managementWallet = await erc725Contract.methods.getKeysByPurpose(p).call();
            expect(managementWallet.length).to.be.equal(1);
            expect(managementWallet[0]).to.equal(`0x${hashedAddress}`);
        }));

        i += 1;
    }
});

