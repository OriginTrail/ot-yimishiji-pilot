var BN = require('bn.js');

var TracToken = artifacts.require('TracToken'); // eslint-disable-line no-undef

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef
var OldHub = artifacts.require('OldHub'); // eslint-disable-line no-undef
var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Holding = artifacts.require('Holding'); // eslint-disable-line no-undef
var CreditorHandler = artifacts.require('CreditorHandler'); // eslint-disable-line no-undef
var Litigation = artifacts.require('Litigation'); // eslint-disable-line no-undef
var Marketplace = artifacts.require('Marketplace'); // eslint-disable-line no-undef
var Replacement = artifacts.require('Replacement'); // eslint-disable-line no-undef
var Approval = artifacts.require('Approval'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef
var LitigationStorage = artifacts.require('LitigationStorage'); // eslint-disable-line no-undef
var MarketplaceStorage = artifacts.require('MarketplaceStorage'); // eslint-disable-line no-undef

var MockHolding = artifacts.require('MockHolding'); // eslint-disable-line no-undef
var MockApproval = artifacts.require('MockApproval'); // eslint-disable-line no-undef
var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef

var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

const amountToMint = (new BN(5)).mul((new BN(10)).pow(new BN(30)));

module.exports = async (deployer, network, accounts) => {
    let hub;
    let oldHub;
    let token;

    let profile;
    let holding;
    let creditorHandler;
    let litigation;
    let marketplace;
    let replacement;
    let approval;

    let profileStorage;
    let holdingStorage;
    let litigationStorage;
    let marketplaceStorage;

    var amounts = [];
    var recepients = [];

    var temp;
    var temp2;

    switch (network) {
    case 'test':
        await deployer.deploy(TestingUtilities);

        await deployer.deploy(Hub, { gas: 6000000, from: accounts[0] })
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        profileStorage = await deployer.deploy(
            ProfileStorage,
            hub.address, { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('ProfileStorage', profileStorage.address);

        holdingStorage = await deployer.deploy(
            HoldingStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('HoldingStorage', holdingStorage.address);

        marketplaceStorage = await deployer.deploy(
            MarketplaceStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('MarketplaceStorage', marketplaceStorage.address);

        litigationStorage = await deployer.deploy(
            LitigationStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('LitigationStorage', litigationStorage.address);

        approval = await deployer.deploy(MockApproval);
        await hub.setContractAddress('Approval', approval.address);

        token = await deployer.deploy(TracToken, accounts[0], accounts[1], accounts[2]);
        await hub.setContractAddress('Token', token.address);

        profile = await deployer.deploy(Profile, hub.address, { gas: 7000000, from: accounts[0] });
        await hub.setContractAddress('Profile', profile.address);

        holding = await deployer.deploy(Holding, hub.address, { gas: 7000000, from: accounts[0] });
        await hub.setContractAddress('Holding', holding.address);

        creditorHandler = await deployer.deploy(
            CreditorHandler,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('CreditorHandler', creditorHandler.address);

        litigation = await deployer.deploy(
            Litigation,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Litigation', litigation.address);

        marketplace = await deployer.deploy(
            Marketplace,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Marketplace', marketplace.address);

        replacement = await deployer.deploy(
            Replacement,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Replacement', replacement.address);

        for (let i = 0; i < 30; i += 1) {
            amounts.push(amountToMint);
            recepients.push(accounts[i]);
        }
        await token.mintMany(recepients, amounts, { from: accounts[0] });
        await token.finishMinting({ from: accounts[0] });

        break;
    case 'development':
    case 'ganache':
        await deployer.deploy(Hub, { gas: 6000000, from: accounts[0] })
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        profileStorage = await deployer.deploy(
            ProfileStorage,
            hub.address, { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('ProfileStorage', profileStorage.address);

        holdingStorage = await deployer.deploy(
            HoldingStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('HoldingStorage', holdingStorage.address);

        marketplaceStorage = await deployer.deploy(
            MarketplaceStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('MarketplaceStorage', marketplaceStorage.address);

        litigationStorage = await deployer.deploy(
            LitigationStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('LitigationStorage', litigationStorage.address);

        approval = await deployer.deploy(Approval);
        await hub.setContractAddress('Approval', approval.address);

        token = await deployer.deploy(TracToken, accounts[0], accounts[1], accounts[2]);
        await hub.setContractAddress('Token', token.address);

        profile = await deployer.deploy(Profile, hub.address, { gas: 9000000, from: accounts[0] });
        await hub.setContractAddress('Profile', profile.address);

        holding = await deployer.deploy(Holding, hub.address, { gas: 8000000, from: accounts[0] });
        await hub.setContractAddress('Holding', holding.address);

        creditorHandler = await deployer.deploy(
            CreditorHandler,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('CreditorHandler', creditorHandler.address);

        litigation = await deployer.deploy(
            Litigation,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('Litigation', litigation.address);

        marketplace = await deployer.deploy(
            Marketplace,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Marketplace', marketplace.address);

        replacement = await deployer.deploy(
            Replacement,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Replacement', replacement.address);

        for (let i = 0; i < 30; i += 1) {
            amounts.push(amountToMint);
            recepients.push(accounts[i]);
        }
        await token.mintMany(recepients, amounts, { from: accounts[0] });
        await token.finishMinting({ from: accounts[0] });

        console.log('\n\n \t Contract adressess on ganache:');
        console.log(`\t Hub contract address: \t\t\t${hub.address}`);
        console.log(`\t Approval contract address: \t\t${approval.address}`);
        console.log(`\t Token contract address: \t\t${token.address}`);
        console.log(`\t Profile contract address: \t\t${profile.address}`);
        console.log(`\t Holding contract address: \t\t${holding.address}`);
        console.log(`\t Litigation contract address: \t\t${litigation.address}`);
        console.log(`\t Marketplace contract address: \t\t${marketplace.address}`);
        console.log(`\t Replacement contract address: \t\t${replacement.address}`);

        console.log(`\t ProfileStorage contract address: \t${profileStorage.address}`);
        console.log(`\t HoldingStorage contract address: \t${holdingStorage.address}`);
        console.log(`\t LitigationStorage contract address: \t${litigationStorage.address}`);
        console.log(`\t MarketplaceStorage contract address: \t${marketplaceStorage.address}`);

        break;
    case 'supplyTokens':
        await Hub.at('0x0987197628Bb06133B6FA2409eb4cF9FCaFe8d3a')
            .then((result) => {
                hub = result;
            });
        console.log(hub);
        temp = await hub.getContractAddress.call('Token');
        console.log(temp);
        console.log(temp);
        console.log(temp);
        console.log(temp);
        token = await TracToken.at(temp);
        await token.transfer(accounts[0], amountToMint.divn(2), { from: accounts[1] });
        break;
    case 'setIdentity':
        temp = await deployer.deploy(TestingUtilities);
        temp = await TestingUtilities.deployed();
        temp = await temp.keccakAddress.call('0xc37c75271deed11c095a96ea0eedcc87e9d35152');
        temp2 = await Identity.at('0x611d771aafaa3d6fb66c4a81d97768300a6882d5');
        try {
            await temp2.addKey(
                temp,
                [new BN(237)],
                new BN(1),
                { from: accounts[6] },
            );
        } catch (e) {
            temp = await temp2.getKey.call(temp);
            console.log(temp.purposes[0].toString());
        }

        break;
    case 'removeIdentity':
        temp = await deployer.deploy(TestingUtilities);
        temp = await TestingUtilities.deployed();
        temp = await temp.keccakAddress.call('0xc37c75271deed11c095a96ea0eedcc87e9d35152');
        temp2 = await Identity.at('0x611d771aafaa3d6fb66c4a81d97768300a6882d5');
        try {
            await temp2.removeKey(
                temp,
                { from: accounts[6] },
            );
        } catch (e) {
            temp = await temp2.getKey.call(temp);
            console.log(temp.purposes[0].toString());
        }

        break;
    case 'mock':

        await deployer.deploy(TracToken, accounts[0], accounts[1], accounts[2])
            .then(result => token = result);
        holding = await deployer.deploy(MockHolding);

        for (var i = 0; i < 20; i += 1) {
            amounts.push(amountToMint);
            recepients.push(accounts[i]);
        }
        await token.mintMany(recepients, amounts, { from: accounts[0] });

        console.log('\n\n \t Contract adressess on ganache (mock versions):');
        console.log(`\t Token contract address: \t${token.address}`);
        console.log(`\t Escrow contract address: \t${holding.address}`);
        break;
    case 'updateRinkeby':
        await deployer.deploy(Hub)
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        oldHub = await OldHub.at('');

        temp = await oldHub.profileStorageAddress.call();
        profileStorage = await ProfileStorage.at(temp);
        await hub.setContractAddress('ProfileStorage', profileStorage.address);

        holdingStorage = await deployer.deploy(
            HoldingStorage,
            hub.address,
        );
        await hub.setContractAddress('HoldingStorage', holdingStorage.address);

        litigationStorage = await deployer.deploy(
            LitigationStorage,
            hub.address,
        );
        await hub.setContractAddress('LitigationStorage', litigationStorage.address);

        approval = await deployer.deploy(Approval);
        await hub.setContractAddress('Approval', approval.address);

        await hub.setContractAddress('Token', '0x98d9a611ad1b5761bdc1daac42c48e4d54cf5882');

        profile = await deployer.deploy(Profile, hub.address);
        await hub.setContractAddress('Profile', profile.address);

        holding = await deployer.deploy(Holding, hub.address);
        await hub.setContractAddress('Holding', holding.address);

        litigation = await deployer.deploy(
            Litigation,
            hub.address,
        );
        await hub.setContractAddress('Litigation', litigation.address);

        replacement = await deployer.deploy(
            Replacement,
            hub.address,
        );
        await hub.setContractAddress('Replacement', replacement.address);

        temp = await oldHub.profileAddress.call();
        await hub.setContractAddress('OldProfile', temp);
        temp2 = await oldHub.holdingAddress.call();
        await hub.setContractAddress('OldHolding', temp2);

        await profileStorage.setHubAddress(hub.address);

        console.log('\n\n \t Contract adressess on rinkeby:');
        console.log(`\t Hub contract address: \t\t\t${hub.address}`);
        console.log(`\t Approval contract address: \t\t${approval.address}`);
        console.log(`\t Profile contract address: \t\t${profile.address}`);
        console.log(`\t Holding contract address: \t\t${holding.address}`);
        console.log(`\t Litigation contract address: \t\t${litigation.address}`);
        console.log(`\t Replacement contract address: \t\t${replacement.address}`);

        console.log(`\t ProfileStorage contract address: \t${profileStorage.address}`);
        console.log(`\t HoldingStorage contract address: \t${holdingStorage.address}`);
        console.log(`\t LitigationStorage contract address: \t${litigationStorage.address}`);


        console.log(`\t OldProfile contract address: \t${temp}`);
        console.log(`\t OldHolding contract address: \t${temp2}`);
        break;
    case 'rinkeby':
        await deployer.deploy(Hub)
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        profileStorage = await deployer.deploy(
            ProfileStorage,
            hub.address,
        );
        await hub.setContractAddress('ProfileStorage', profileStorage.address);

        holdingStorage = await deployer.deploy(
            HoldingStorage,
            hub.address,
        );
        await hub.setContractAddress('HoldingStorage', holdingStorage.address);

        litigationStorage = await deployer.deploy(
            LitigationStorage,
            hub.address,
        );
        await hub.setContractAddress('LitigationStorage', litigationStorage.address);

        marketplaceStorage = await deployer.deploy(
            MarketplaceStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('MarketplaceStorage', marketplaceStorage.address);

        approval = await deployer.deploy(Approval);
        await hub.setContractAddress('Approval', approval.address);

        await hub.setContractAddress('Token', '0x98d9a611ad1b5761bdc1daac42c48e4d54cf5882');

        profile = await deployer.deploy(Profile, hub.address);
        await hub.setContractAddress('Profile', profile.address);

        holding = await deployer.deploy(Holding, hub.address);
        await hub.setContractAddress('Holding', holding.address);

        litigation = await deployer.deploy(
            Litigation,
            hub.address,
        );
        await hub.setContractAddress('Litigation', litigation.address);

        marketplace = await deployer.deploy(
            Marketplace,
            hub.address,
            { gas: 7000000, from: accounts[0] },
        );
        await hub.setContractAddress('Marketplace', marketplace.address);

        replacement = await deployer.deploy(
            Replacement,
            hub.address,
        );
        await hub.setContractAddress('Replacement', replacement.address);

        console.log('\n\n \t Contract adressess on rinkeby:');
        console.log(`\t Hub contract address: \t\t\t${hub.address}`);
        console.log(`\t Approval contract address: \t\t${approval.address}`);
        console.log(`\t Profile contract address: \t\t${profile.address}`);
        console.log(`\t Holding contract address: \t\t${holding.address}`);
        console.log(`\t Litigation contract address: \t\t${litigation.address}`);
        console.log(`\t Marketplace contract address: \t\t${marketplace.address}`);
        console.log(`\t Replacement contract address: \t\t${replacement.address}`);

        console.log(`\t ProfileStorage contract address: \t${profileStorage.address}`);
        console.log(`\t HoldingStorage contract address: \t${holdingStorage.address}`);
        console.log(`\t LitigationStorage contract address: \t${litigationStorage.address}`);
        console.log(`\t MarketplaceStorage contract address: \t${marketplaceStorage.address}`);

        break;
    case 'live':
        /*
        await deployer.deploy(Hub, { gas: 6000000, from: accounts[0] })
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        await hub.setContractAddress('Token', '0xaA7a9CA87d3694B5755f213B5D04094b8d0F0A6F');

        profileStorage = await deployer.deploy(
            ProfileStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('ProfileStorage', profileStorage.address);

        holdingStorage = await deployer.deploy(
            HoldingStorage,
            hub.address,
            { gas: 6000000, from: accounts[0] },
        );
        await hub.setContractAddress('HoldingStorage', holdingStorage.address);

        profile = await deployer.deploy(Profile, hub.address, { gas: 6000000, from: accounts[0] });
        await hub.setContractAddress('Profile', profile.address);

        holding = await deployer.deploy(Holding, hub.address, { gas: 6000000, from: accounts[0] });
        await hub.setContractAddress('Holding', holding.address);

        approval = await deployer.deploy(Approval, { gas: 6000000, from: accounts[0] });
        await hub.setContractAddress('Approval', approval.address);

        console.log('\n\n \t Contract adressess on mainnet:');
        console.log(`\t Hub contract address: \t\t\t${hub.address}`);
        console.log(`\t Profile contract address: \t\t${profile.address}`);
        console.log(`\t Holding contract address: \t\t${holding.address}`);
        console.log(`\t Approval contract address: \t\t${approval.address}`);

        console.log(`\t ProfileStorage contract address: \t${profileStorage.address}`);
        console.log(`\t HoldingStorage contract address: \t${holdingStorage.address}`);

        */

        hub = await Hub.at('0xa287d7134fb40bef071c932286bd2cd01efccf30');
        console.log(JSON.stringify(hub));
        // profile = await deployer.deploy(
        //     Profile,
        //     hub.address,
        //     { gas: 6000000, gasPrice: 8000000000 },
        // );
        break;
    case 'updateContract':
        console.log(`Using wallet address: ${accounts[0]}`);
        hub = await Hub.at('0x85720D4D09A52eD66656b28c68567E41AD45dD0e');
        console.log(`Using  hub  contract: ${hub.address}`);
        if (hub.address) {
            temp = await hub.getContractAddress.call('Owner');
            console.log(`\tOwner address in contract map: ${temp}`);

            temp = await hub.owner.call();
            console.log(`\tOwner address in contract var: ${temp}`);

            // Deploy contract
            holding = await deployer
                .deploy(Holding, hub.address, { gas: 7000000, from: accounts[0] });
            console.log(`Deployed new contract to address: ${holding.address}`);

            console.log('Updating contract in Hub contract map');
            await hub.setContractAddress('Holding', holding.address);
            console.log('Updated contract in Hub contract map!');
        }
        break;
    default:
        console.warn('Please use one of the following network identifiers: ganache, mock, test, or rinkeby');
        break;
    }
};
