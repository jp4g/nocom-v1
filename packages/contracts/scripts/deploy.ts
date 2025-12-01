#!/usr/bin/env bun
import { dirname, join } from "path";
import { writeFileSync } from "fs";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { deployIsolatedPoolContract, deployPriceOracleContract, deployTokenContract } from "../ts/src/contract/deploy.ts";
import { TOKEN_METADATA, USDC_LIQUIDATION_THRESHOLD, USDC_LTV, ZCASH_LIQUIDATION_THRESHOLD, ZCASH_LTV } from "../ts/src/constants.ts";
import { precision } from "../ts/src/utils/index.ts";
import { updateOraclePrice } from "../ts/src/contract/oracle.ts";

const { AZTEC_NODE_URL = "http://localhost:8080" } = process.env;

// Handles compilation of aztec standards token contract and ensures artifacts are available
async function main() {
    // 1. setup wallet connection
    const scriptDir = dirname(import.meta.path);
    const contractsDir = join(scriptDir, "..");
    
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    const wallet = await TestWallet.create(node);
    const [adminAccount] = await getInitialTestAccountsData();
    if (!adminAccount) {
        throw new Error("No admin account found in initial test accounts data");
    }
    await wallet.createSchnorrAccount(adminAccount.secret, adminAccount.salt);
    const adminAddress = await wallet.getAccounts().then(accounts => accounts[0]!.item);

    // 2. deploy the token contracts
    const usdc = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["usdc"]);
    const zcash = await deployTokenContract(wallet, adminAddress, TOKEN_METADATA["zcash"]);

    // 3. deploy the price oracle contract
    const priceOracle = await deployPriceOracleContract(wallet, adminAddress);
    
    // 4. set some initial prices
    const assetAddresses = [usdc.address, zcash.address];
    const prices = [precision(1n, 4n), precision(500n, 4n)];
    await updateOraclePrice(adminAddress, priceOracle, assetAddresses, prices);

    // 5. deploy the usdc -> zec lending pool contract
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

    // 6. deploy the zec -> usdc lending pool contract
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

    // 7. save the deployed contract addresses to the deployment file
    const deploymentFilePath = join(contractsDir, "deployments.json");
    const deploymentData = {
        usdc: usdc.address,
        zcash: zcash.address,
        priceOracle: priceOracle.address,
        zecDebtPool: zecDebtPool.address,
        usdcDebtPool: usdcDebtPool.address,
    };
    writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2));

    // 8. log output
    console.log("===========[Nocom Contract Deployment Summary]===========");
    console.log(`Wrote deployment data to ${deploymentFilePath}`);
    console.log(`.env formatting:`)
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