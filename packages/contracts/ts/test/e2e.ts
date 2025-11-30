import { before, describe, test } from "node:test";
import { expect } from '@jest/globals';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { TestWallet } from '@aztec/test-wallet/server';
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
import { supplyLiquidity } from "../src/contract/pool";
import { updateOraclePrice } from "../src/contract/oracle";

const { AZTEC_NODE_URL = "http://localhost:8080" } = process.env;

describe("Private Transfer Demo Test", () => {

    let node: AztecNode;

    let wallet: TestWallet;
    // just use one wallet so we don't need to run 5 different PXE's in nodejs

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

        // mint tokens
        // mint zcash to borrower (collateral)
        await zcashContract
            .withWallet(wallet)
            .methods.mint_to_private(
                borrowerAddress,
                precision(1000n, 18n)
            )
            .send({ from: adminAddress })
            .wait();
        // mint usdc to lender (to lend out) / liquidate with for this test
        await usdcContract
            .withWallet(wallet)
            .methods.mint_to_private(
                lenderAddress,
                precision(100000n, 6n)
            )
            .send({ from: adminAddress })
            .wait();

        // deploy price oracle
        priceOracleContract = await deployPriceOracleContract(wallet, adminAddress);

        // set prices
        await updateOraclePrice(
            adminAddress,
            priceOracleContract,
            [zcashContract.address, usdcContract.address],
            [zcashPrice, usdcPrice]
        );

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
        // do not need to do key sharing with liquidator since same wallet
    });

    test("e2e", async () => {
        // 1. lender supplies collateral
        const lenderSupplyAmount = precision(50000n); // 50,000 USDC
        await supplyLiquidity(
            wallet,
            lenderAddress,
            lendingPoolContract,
            usdcContract,
            lenderSupplyAmount
        );

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

        // 3. borrower takes usdc loan against collateral
        const borrowerDebtPrincipalAmount = precision(7000n); // 3,000 USDC
        await borrowFromPool(
            borrowerAddress,
            borrowerEscrow,
            borrowerDebtPrincipalAmount,
            zcashPrice,
            usdcPrice
        );

        // 4. drop the price of zcash
        zcashPrice = precision(437n, 4n); // drop from $500 to $437 which will just undercollateralize
        await updateOraclePrice(
            adminAddress,
            priceOracleContract,
            [zcashContract.address],
            [zcashPrice]
        );

        // 5. liquidate the borrower
        const amountToLiquidate = precision(3500n); // liquidate half the loan
        await liquidatePosition(
            wallet,
            liquidatorAddress,
            borrowerEscrow,
            zcashContract,
            lendingPoolContract.address,
            amountToLiquidate,
            zcashPrice,
            usdcPrice
        );
    });
});