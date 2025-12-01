#!/usr/bin/env bun
import { dirname, join } from "path";
import { existsSync, writeFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { deployIsolatedPoolContract, deployPriceOracleContract, deployTokenContract } from "../ts/src/contract/deploy.ts";
import { TOKEN_METADATA, USDC_LIQUIDATION_THRESHOLD, USDC_LTV, ZCASH_LIQUIDATION_THRESHOLD, ZCASH_LTV } from "../ts/src/constants.ts";
import { precision } from "../ts/src/utils/index.ts";
import { updateOraclePrice } from "../ts/src/contract/oracle.ts";
import { execCommand } from "./utils.ts";

const { AZTEC_NODE_URL = "http://localhost:8080" } = process.env;

// Handles compilation of aztec standards token contract and ensures artifacts are available
async function main() {
    // 0. setup wallet connection
    const scriptDir = dirname(import.meta.path);
    const contractsDir = join(scriptDir, "..");

    // check if deployments dir exists
    // const deploymentsDir = join(contractsDir, "deployments");
    // if (!existsSync(deploymentsDir))
    //     await execCommand("mkdir", ["-p", deploymentsDir]);

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

    // 2. deploy the token contracts
    const usdc = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["usdc"]);
    const zcash = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["zcash"]);

    // 3. mint tokens to each of the test accounts
    const usdcAmount = precision(1_000_000n);
    const zcashAmount = precision(2_000n);
    const sendOpts = { from: adminAddress };
    await usdc.methods.mint_to_private(adminAddress, usdcAmount).send(sendOpts).wait();
    await usdc.methods.mint_to_private(aliceAddress, usdcAmount).send(sendOpts).wait();
    await usdc.methods.mint_to_private(bobAddress, usdcAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(aliceAddress, zcashAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(bobAddress, zcashAmount).send(sendOpts).wait();
    await zcash.methods.mint_to_private(adminAddress, zcashAmount).send(sendOpts).wait();

    // 4. deploy the price oracle contract
    const priceOracle = await deployPriceOracleContract(wallet, adminAddress);
    
    // 5. set some initial prices
    const assetAddresses = [usdc.address, zcash.address];
    const prices = [precision(1n, 4n), precision(500n, 4n)];
    await updateOraclePrice(adminAddress, priceOracle, assetAddresses, prices);

    // 6. deploy the usdc -> zec lending pool contract
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

    // 7. deploy the zec -> usdc lending pool contract
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

    // 8. save the deployed contract addresses to the deployment file
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