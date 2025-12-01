#!/usr/bin/env bun
import { dirname, join } from "path";
import { existsSync, writeFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { deployEscrowContract, deployIsolatedPoolContract, deployPriceOracleContract, deployTokenContract } from "../ts/src/contract/deploy.ts";
import { TOKEN_METADATA, USDC_LIQUIDATION_THRESHOLD, USDC_LTV, ZCASH_LIQUIDATION_THRESHOLD, ZCASH_LTV } from "../ts/src/constants.ts";
import { precision } from "../ts/src/utils/index.ts";
import { updateOraclePrice } from "../ts/src/contract/oracle.ts";
import { execCommand } from "./utils.ts";
import { ensureSponsoredFPCDeployed, getFeeJuicePortalManager, getSponsoredFPCInstance, getSponsoredPaymentMethod } from "../ts/src/fees.ts";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/foundation/fields";
import { supplyLiquidity } from "../ts/src/contract/pool.ts";
import { borrowFromPool, depositCollateral, registerEscrowWithPool } from "../ts/src/contract/escrow.ts";
import type { SendInteractionOptions } from "@aztec/aztec.js/contracts";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";

const {
    AZTEC_NODE_URL = "http://localhost:8080",
    L1_RPC_URL = "http://localhost:8545",
    MNEMONIC = "test test test test test test test test test test test junk",
} = process.env;

// Parse command line flags
const populateDeployment = process.argv.includes("-p") || process.argv.includes("--populate");

// Handles compilation of aztec standards token contract and ensures artifacts are available
async function main() {
    const scriptDir = dirname(import.meta.path);
    const contractsDir = join(scriptDir, "..");

    // 1. create aztec node client and test wallet, create test accounts
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    const wallet = await TestWallet.create(node);
    const [adminAccount, alice, bob] = await getInitialTestAccountsData();
    if (!adminAccount || !alice || !bob) {
        throw new Error("No admin account found in initial test accounts data");
    }
    await wallet.createSchnorrAccount(adminAccount.secret, adminAccount.salt);
    const adminAddress = await wallet.getAccounts().then(accounts => accounts[0]!.item);
    await wallet.createSchnorrAccount(alice.secret, alice.salt);
    const aliceAddress = await wallet.getAccounts().then(accounts => accounts[1]!.item);
    await wallet.createSchnorrAccount(bob.secret, bob.salt);
    const bobAddress = await wallet.getAccounts().then(accounts => accounts[2]!.item);


    // 3. ensure the fpc is deployed
    await ensureSponsoredFPCDeployed(wallet, adminAddress, node);
    const fpcAddress = await getSponsoredFPCInstance().then(instance => instance.address);

    // 4. bridge tokens over for paying fees from populate accounts
    // do this here since we need to wait at least 2 tx's before we can claim
    const managers = [];
    const claims = [];
    if (populateDeployment) {
        for (let i = 0; i < 2; i++) {
            // create the account
            const secret = Fr.random();
            const salt = Fr.random();
            managers.push(await wallet.createSchnorrAccount(secret, salt));
        }
        const feeJuiceManager = await getFeeJuicePortalManager(node, [L1_RPC_URL], MNEMONIC);
        for (const account of managers) {
            claims.push(await feeJuiceManager.bridgeTokensPublic(
                account.address,
                precision(1_000n),
                true
            ));
        }
    }

    // must wait two transactions before completing the claim

    // 4. deploy the token contracts
    const usdc = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["usdc"]);
    const zcash = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["zcash"]);


    // 5. mint tokens to each of the test accounts
    const usdcAmount = precision(1_000_000n);
    const zcashAmount = precision(2_000n);
    const sendOpts = { from: adminAddress };
    await usdc.methods.mint_to_private(adminAddress, usdcAmount).send(sendOpts).wait();
    await usdc.methods.mint_to_private(aliceAddress, usdcAmount).send(sendOpts).wait();
    await usdc.methods.mint_to_private(bobAddress, usdcAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(aliceAddress, zcashAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(bobAddress, zcashAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(adminAddress, zcashAmount).send(sendOpts).wait();


    // 6. deploy the price oracle contract and set prices
    const priceOracle = await deployPriceOracleContract(wallet, adminAddress);
    const assetAddresses = [usdc.address, zcash.address];
    const prices = [precision(1n, 4n), precision(500n, 4n)];
    await updateOraclePrice(adminAddress, priceOracle, assetAddresses, prices);

    // 7. deploy the usdc -> zec lending pool contract
    const liquidatorPubkey = { x: 0n, y: 0n };
    const zecDebtPool = await deployIsolatedPoolContract(
        wallet,
        adminAddress,
        adminAddress,
        liquidatorPubkey,
        priceOracle.address,
        adminAddress,
        usdc.address,
        zcash.address,
        ZCASH_LTV,
        ZCASH_LIQUIDATION_THRESHOLD
    );

    // 8. deploy the zec -> usdc lending pool contract
    const usdcDebtPool = await deployIsolatedPoolContract(
        wallet,
        adminAddress,
        adminAddress,
        liquidatorPubkey,
        priceOracle.address,
        adminAddress,
        zcash.address,
        usdc.address,
        USDC_LTV,
        USDC_LIQUIDATION_THRESHOLD
    );



    // 10. if population flag set, populate the market with additional accounts
    if (populateDeployment) {

        // TODO: fee juice not working on sandbox >:(
        // // 10a. claim fee juice
        // const lenderAddress = managers[0]!.address;
        // const borrowerAddress = managers[1]!.address;
        // console.log("Claiming fee juice for population accounts...");
        // for (let i = 0; i < claims.length; i++) {
        //     const claimAndPay = new FeeJuicePaymentMethodWithClaim(
        //         managers[i]!.address,
        //         claims[i]!,
        //     );
        //     console.log("claim and pay method gotten, ", managers[i]!.address.toString())
        //     const accountDeployMethod = await managers[i]!.getDeployMethod();
        //     console.log("got deploy method");
        //     await accountDeployMethod.send({
        //         from: managers[i]!.address,
        //         fee: { paymentMethod: claimAndPay },
        //     }).wait();
        // }
        
        // 10b. mint tokens to the population accounts
        console.log("Minting tokens to population accounts...");
        const populationUsdcAmount = precision(50_000_000n);
        const populationZcashAmount = precision(100_000n);
        await usdc.methods.mint_to_private(bobAddress, populationUsdcAmount)
            .send(sendOpts).wait();
        await zcash.methods.mint_to_private(bobAddress, populationZcashAmount)
            .send(sendOpts).wait();

        // 10c. supply liquidity from the lender account
        console.log("Supplying liquidity to pools from lender account...");
        await supplyLiquidity(
            wallet,
            bobAddress,
            zecDebtPool,
            zcash,
            precision(5163n),
        );
        await supplyLiquidity(
            wallet,
            bobAddress,
            usdcDebtPool,
            usdc,
            precision(4_126_557n),
        );

        // 10d. deploy & auto-register escrow contracts for the borrower for each pool
        console.log("Deploying and registering escrow contracts for borrower...");
        const { contract: zecDebtEscrow } = await deployEscrowContract(
            wallet,
            bobAddress,
            zecDebtPool.address,
            usdc.address,
            zcash.address,
            true, // auto-register with pool
        );
        const { contract: usdcDebtEscrow } = await deployEscrowContract(
            wallet,
            bobAddress,
            usdcDebtPool.address,
            zcash.address,
            usdc.address,
            true, // auto-register with pool
        );

        // 10e. deposit collateral from the borrower
        console.log("Depositing collateral into escrows from borrower...");
        await depositCollateral(
            wallet,
            bobAddress,
            zecDebtEscrow,
            zecDebtPool.address,
            usdc,
            precision(10_000_000n),
        );
        await depositCollateral(
            wallet,
            bobAddress,
            usdcDebtEscrow,
            usdcDebtPool.address,
            zcash,
            precision(10_000n),
        );

        // 10f. borrow against the collateral as the borrower
        await borrowFromPool(
            bobAddress,
            zecDebtEscrow,
            precision(4215n),
            prices[0]!,
            prices[1]!,
        );
        await borrowFromPool(
            bobAddress,
            usdcDebtEscrow,
            precision(2_063_278n),
            prices[1]!,
            prices[0]!,
        );
    }

    // 11. save the deployed contract addresses to the deployment file
    const deploymentFilePath = join(contractsDir, "deployments.json");
    const deploymentData = {
        usdc: {
            address: usdc.address.toString(),
            instance: JSON.stringify(usdc.instance),
        },
        zcash: {
            address: zcash.address.toString(),
            instance: JSON.stringify(zcash.instance),
        },
        priceOracle: {
            address: priceOracle.address.toString(),
            instance: JSON.stringify(priceOracle.instance),
        },
        zecDebtPool: {
            address: zecDebtPool.address.toString(),
            instance: JSON.stringify(zecDebtPool.instance),
        },
        usdcDebtPool: {
            address: usdcDebtPool.address.toString(),
            instance: JSON.stringify(usdcDebtPool.instance),
        },
    };
    writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2));

    // 9. copy deployment data to frontend
    const frontendPath = join(scriptDir, "../../frontend/lib/deployments.json");
    writeFileSync(frontendPath, JSON.stringify(deploymentData, null, 2));

    // 10. log output
    console.log("===========[Nocom Contract Deployment Summary]===========");
    if (populateDeployment) {
        console.log("Market populated with additional liquidity and borrowing activity");
    }
    console.log(`Wrote deployment data to ${deploymentFilePath}`);
    console.log(`Copied deployment data to frontend at ${frontendPath}`);
    console.log(`NEXT_PUBLIC_USDC_CONTRACT=${usdc.address.toString()}`);
    console.log(`NEXT_PUBLIC_ZCASH_CONTRACT=${zcash.address.toString()}`);
    console.log(`NEXT_PUBLIC_PRICE_ORACLE_CONTRACT=${priceOracle.address.toString()}`);
    console.log(`NEXT_PUBLIC_ZEC_DEBT_POOL_CONTRACT=${zecDebtPool.address.toString()}`);
    console.log(`NEXT_PUBLIC_USDC_DEBT_POOL_CONTRACT=${usdcDebtPool.address.toString()}`);
    console.log("========================================================");
}

if (import.meta.main) {
    main();
}