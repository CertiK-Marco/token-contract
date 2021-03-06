import { 
    GEMInstance 
} from "../types/truffle-contracts";

const { BN, constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { expect, should } = require('chai');

const GEM = artifacts.require("GEM");

contract("GEM", ([deployer, daoMultisig, whitelistedUser, user1, user2, user3]) => {
    let token:GEMInstance;
    
    before(async () => {
        token = await GEM.deployed();

        const WHITELISTED_ROLE = await token.WHITELISTED_ROLE();
        token.grantRole(WHITELISTED_ROLE, whitelistedUser, {from:daoMultisig});

        token.transfer(whitelistedUser, web3.utils.toWei('1000', 'ether'), {from:daoMultisig});
        token.transfer(user1, web3.utils.toWei('1000', 'ether'), {from:daoMultisig});
    });

    // === Pause and whitelist functionality testing ===

    it("should initially be not paused", async () => {   
        let paused = await token.paused();
        expect(paused).to.be.false;
    });

    it("can be paused", async () => {   
        await token.pause({from:daoMultisig});
        let paused = await token.paused();
        expect(paused).to.be.true;
    });

    it("should not allow arbitrary transfer when paused", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        await expectRevert(
            token.transfer(user2, amount, {from:user1}),
            "transfers paused"
        );
    });

    it("should not allow arbitrary transferFrom when paused", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        await token.approve(user3, amount);
        await expectRevert(
            token.transferFrom(user1, user2, amount, {from:user3}),
            "transfers paused"
        );
    });

    it("should allow transfer for whitelisted user", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        let res = await token.transfer(user2, amount, {from:whitelistedUser});
        expectEvent(res, "Transfer");
    });

    it("should allow transferFrom for whitelisted user", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        await token.approve(whitelistedUser, amount, {from:user1});
        let res = await token.transferFrom(user1, user2, amount, {from:whitelistedUser});
        expectEvent(res, "Transfer");
    });

    it("should allow not whitelisted user to transfer from whitelisted", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        await token.approve(user1, amount, {from:whitelistedUser});
        let res = await token.transferFrom(whitelistedUser, user2, amount, {from:user1});
        expectEvent(res, "Transfer");
    });

    it("can be unpaused", async () => {   
        await token.unpause({from:daoMultisig});
        let paused = await token.paused();
        expect(paused).to.be.false;
    });

    it("should allow arbitrary transfer when not paused", async () => {   
        let amount = web3.utils.toWei('10', 'ether');
        let res = await token.transfer(user2, amount, {from:user1});
        expectEvent(res, "Transfer");
    });

    // === snapshot testing ===
    it("should not take a snapshot from arbitrary user", async () => {   
        await expectRevert(
            token.snapshot({from: user1}),
            "!admin"
        );
    });

    it("admin should take a snapshot", async () => {   
        let res = await token.snapshot({from: daoMultisig});
        expectEvent(res, "Snapshot");
    });

    it("should be able to return balance at snapshot", async () => {   
        let before = {
            user1balance: await token.balanceOf(user1),
            user2balance: await token.balanceOf(user2),
        }

        let res = await token.snapshot({from: daoMultisig});
        const snapshotId = res.logs[0].args[0];
        expectEvent(res, "Snapshot", {id:snapshotId});

        let amount = new BN(web3.utils.toWei('5', 'ether'));
        await  token.transfer(user1, amount, {from:user2});

        let after = {
            user1balance: await token.balanceOf(user1),
            user2balance: await token.balanceOf(user2),
            user1balanceSnapshot: await token.balanceOfAt(user1, snapshotId),
            user2balanceSnapshot: await token.balanceOfAt(user2, snapshotId),
        }

        expect(after.user1balance).to.be.bignumber.equal(before.user1balance.add(amount));
        expect(after.user2balance).to.be.bignumber.equal(before.user2balance.sub(amount));
        expect(after.user1balanceSnapshot).to.be.bignumber.equal(before.user1balance);
        expect(after.user2balanceSnapshot).to.be.bignumber.equal(before.user2balance);
    });

});