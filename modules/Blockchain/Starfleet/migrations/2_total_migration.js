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
var XDaiTrac = artifacts.require('XDAITestTrac'); // eslint-disable-line no-undef

var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var HoldingStorage = artifacts.require('HoldingStorage'); // eslint-disable-line no-undef
var LitigationStorage = artifacts.require('LitigationStorage'); // eslint-disable-line no-undef
var MarketplaceStorage = artifacts.require('MarketplaceStorage'); // eslint-disable-line no-undef

var MockHolding = artifacts.require('MockHolding'); // eslint-disable-line no-undef
var MockApproval = artifacts.require('MockApproval'); // eslint-disable-line no-undef
var TestingUtilities = artifacts.require('TestingUtilities'); // eslint-disable-line no-undef

var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

const amountToMint = (new BN(5)).mul((new BN(10)).pow(new BN(30)));
const tokenSupply = (new BN(5)).mul((new BN(10)).pow(new BN(25)));

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
    case 'development':
    case 'ganache':
    case 'test':
        await deployer.deploy(Hub, { gas: 6000000, from: accounts[0] })
            .then((result) => {
                hub = result;
            });
        await hub.setContractAddress('Owner', accounts[0]);

        if (network === 'test') {
            await deployer.deploy(TestingUtilities);
        }

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

        token = await deployer.deploy(XDaiTrac, accounts[0], amountToMint);
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

        for (let i = 0; i < 10; i += 1) {
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
    case 'contracts':
        console.log(`Deploying from wallet: ${accounts[0]}`);
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

        token = await deployer.deploy(XDaiTrac, accounts[0], amountToMint);
        await hub.setContractAddress('Token', token.address);

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

        recepients = [accounts[0]];
        amounts.push(amountToMint.muln(10));
        await token.mintMany(recepients, amounts, { from: accounts[0] });
        await token.finishMinting({ from: accounts[0] });

        console.log('\n\n \t Contract adressess on starfleet:');
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
    case 'token':
        recepients = [];
        amounts = [];
        await deployer.deploy(XDaiTrac, accounts[0], tokenSupply)
            .then(async (token) => {
                console.log(`Token deployed at: ${token.address}`);
                await token.finishMinting({ from: accounts[0] });
                console.log('Finished minting');
            });
        break;
    default:
        console.warn('Please use one of the following network identifiers: ganache, mock, test, or rinkeby');
        break;
    }
};
