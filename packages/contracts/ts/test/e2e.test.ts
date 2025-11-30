import { before, describe, test, beforeEach } from "node:test";
import { expect } from '@jest/globals';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { TestWallet } from '@aztec/test-wallet/server';
import { CheatCodes } from "@aztec/aztec/testing";
import {
    NocomEscrowV1Contract,
    NocomLendingPoolV1Contract,
    MockPriceFeedContract,
    TokenContract
} from "@nocom-v1/contracts/artifacts";
import { TOKEN_METADATA, ZCASH_LIQUIDATION_THRESHOLD, ZCASH_LTV } from "@nocom-v1/contracts/constants";
import {
    deployEscrowContract,
    deployTokenContract,
    deployIsolatedPoolContract,
    deployPriceOracleContract,
    depositCollateral,
    borrowFromPool,
    liquidatePosition
} from "@nocom-v1/contracts/contract";
import { precision } from "@nocom-v1/contracts/utils";
import { getDebtPosition, supplyLiquidity } from "../src/contract/pool";
import { updateOraclePrice } from "../src/contract/oracle";
import { TestDateProvider } from "@aztec/foundation/timer";

const {
    AZTEC_NODE_URL = "http://localhost:8080",
    L1_RPC_URL = "http://localhost:8545",
} = process.env;

describe("Private Transfer Demo Test", () => {

    let node: AztecNode;
    let cheatcodes: CheatCodes;

    // just use one wallet so we don't need to run 5 different PXE's in nodejs
    let wallet: TestWallet;
    let adminAddress: AztecAddress;
    let lenderAddress: AztecAddress;
    let borrowerAddress: AztecAddress;
    let treasuryAddress: AztecAddress;
    let liquidatorAddress: AztecAddress;

    let escrowMasterKey: Fr;

    let usdcContract: TokenContract;
    let zcashContract: TokenContract;
    let priceOracleContract: MockPriceFeedContract;
    let lendingPoolContract: NocomLendingPoolV1Contract;
    let borrowerEscrow: NocomEscrowV1Contract;

    let zcashPrice = precision(500n, 4n);
    let usdcPrice = precision(1n, 4n);

    before(async () => {
        // setup aztec node client
        node = createAztecNodeClient(AZTEC_NODE_URL);
        cheatcodes = await CheatCodes.create([L1_RPC_URL], node, new TestDateProvider());
        console.log(`Connected to Aztec node at "${AZTEC_NODE_URL}"`);

        // setup wallets
        // we can use the 3 auto-deployed test accounts but must create two more accounts for all roles
        wallet = await TestWallet.create(node);
        const [adminAccount, borrowerAccount, lenderAccount] = await getInitialTestAccountsData();
        await wallet.createSchnorrAccount(adminAccount!.secret, adminAccount!.salt);
        adminAddress = await wallet.getAccounts().then(accounts => accounts[0]!.item);
        await wallet.createSchnorrAccount(lenderAccount!.secret, lenderAccount!.salt);
        lenderAddress = await wallet.getAccounts().then(accounts => accounts[0]!.item);
        await wallet.createSchnorrAccount(borrowerAccount!.secret, borrowerAccount!.salt);
        borrowerAddress = await wallet.getAccounts().then(accounts => accounts[0]!.item);

        // create the remaining two accounts
        // actually just use admin and lender for now
        treasuryAddress = adminAddress;
        liquidatorAddress = lenderAddress;

        // deploy token contracts
        usdcContract = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA.usdc);
        zcashContract = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA.zcash);
        console.log("Deployed token contracts");
        // mint tokens
        // mint zcash to borrower (collateral)
        await zcashContract
            .withWallet(wallet)
            .methods.mint_to_private(
                borrowerAddress,
                precision(1000n)
            )
            .send({ from: adminAddress })
            .wait();
        // mint usdc to lender (to lend out) / liquidate with for this test
        await usdcContract
            .withWallet(wallet)
            .methods.mint_to_private(
                lenderAddress,
                precision(100000n)
            )
            .send({ from: adminAddress })
            .wait();
        console.log("Minted tokens to test accounts");
        // deploy price oracle
        priceOracleContract = await deployPriceOracleContract(wallet, adminAddress);
        console.log("Deployed price oracle contract");
        // set prices
        await updateOraclePrice(
            adminAddress,
            priceOracleContract,
            [zcashContract.address, usdcContract.address],
            [zcashPrice, usdcPrice]
        );
        console.log("Set initial asset prices in oracle");

        // deploy lending pool
        lendingPoolContract = await deployIsolatedPoolContract(
            wallet,
            adminAddress,
            adminAddress,
            { x: 0n, y: 0n }, // liquidator pubkey not used right now
            priceOracleContract.address,
            treasuryAddress,
            zcashContract.address,
            usdcContract.address,
            ZCASH_LTV,
            ZCASH_LIQUIDATION_THRESHOLD
        );
        console.log("Deployed lending pool contract");

    });

    beforeEach(async () => {
        // deploy borrower escrow contract
        ({ contract: borrowerEscrow, secretKey: escrowMasterKey } = await deployEscrowContract(
            wallet,
            borrowerAddress,
            lendingPoolContract.address,
            zcashContract.address,
            usdcContract.address,
        ));
        console.log(`Deployed new borrower escrow contract at ${borrowerEscrow.address.toString()}`);
        // do not need to do key sharing with liquidator since same wallet
    });

    test("e2e", async () => {
        // 1. lender supplies collateral
        const lenderSupplyAmount = precision(10000n); // 10,000 USDC
        await supplyLiquidity(
            wallet,
            lenderAddress,
            lendingPoolContract,
            usdcContract,
            lenderSupplyAmount
        );
        console.log("Lender supplied liquidity to the pool");

        // 2. borrower deposits collateral into escrow
        const borrowerCollateralAmount = precision(20n, 18n); // 20 ZCASH
        await depositCollateral(
            wallet,
            borrowerAddress,
            borrowerEscrow,
            lendingPoolContract.address,
            zcashContract,
            borrowerCollateralAmount
        );
        console.log("Borrower deposited collateral into escrow");

        // 3. borrower takes usdc loan against collateral
        const borrowerDebtPrincipalAmount = precision(7000n); // 3,000 USDC
        await borrowFromPool(
            borrowerAddress,
            borrowerEscrow,
            borrowerDebtPrincipalAmount,
            zcashPrice,
            usdcPrice
        );
        console.log("Borrower borrowed USDC against collateral");

        // 4. drop the price of zcash
        zcashPrice = precision(437n, 4n); // drop from $500 to $437 which will just undercollateralize
        await updateOraclePrice(
            adminAddress,
            priceOracleContract,
            [zcashContract.address],
            [zcashPrice]
        );
        console.log("Updated ZCASH price in oracle to trigger undercollateralization");
        let debtPosition = await getDebtPosition(
            borrowerAddress,
            lendingPoolContract,
            borrowerEscrow.address,
            node
        );
        console.log("Debt position before liquidation: ", debtPosition)
        // 5. liquidate the borrower
        const amountToLiquidate = precision(3500n); // liquidate half the loan
        await liquidatePosition(
            wallet,
            liquidatorAddress,
            borrowerEscrow,
            usdcContract,
            lendingPoolContract.address,
            amountToLiquidate,
            zcashPrice,
            usdcPrice
        );
        console.log("Liquidator liquidated part of the borrower's position");

        // 6. advance time by 12 hours so we get some more interest

        // 7. repay the remaining loan fully

        // 8. withdraw remaining collateral

        // 9. withdraw lender funds with interest

        // 
    });
});