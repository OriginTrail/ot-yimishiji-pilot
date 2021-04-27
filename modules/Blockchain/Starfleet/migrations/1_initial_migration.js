const Migrations = artifacts.require('Migrations'); // eslint-disable-line no-undef

module.exports = (deployer) => {
    deployer.deploy(Migrations);
};
