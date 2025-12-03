import { AztecNode } from "@aztec/aztec.js/node";
import { BaseWallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import deployments from "../deployments.json" assert { type: "json" };
import { ContractInstanceWithAddressSchema } from "@aztec/stdlib/contract";
import {
    MockPriceFeedContract,
    NocomLendingPoolV1Contract,
    NocomStablePoolV1Contract,
    TokenContract,
    MockPriceFeedContractArtifact,
    NocomLendingPoolV1ContractArtifact,
    NocomStablePoolV1ContractArtifact,
    TokenContractArtifact,
} from "@nocom-v1/contracts/artifacts"
import { NocomPublicContracts } from "../types";
import { simulationQueue } from "../utils/simulationQueue";

// todo: generalize this, this is disgusting
export async function registerPublicContracts(
    wallet: BaseWallet,
): Promise<NocomPublicContracts> {
    // Use simulation queue to prevent IndexedDB transaction conflicts
    return simulationQueue.enqueue(async () => {
        console.log("tryna get address book");
        const addressBook = await wallet.getAddressBook();
        console.log("got address book");
        // get contract instance
        // add tokens
        console.log("checking for tokens");
        const usdcInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.usdc.instance)
        );
        console.log("got instance");
        const usdcAddress = AztecAddress.fromString(deployments.usdc.address);
        const zecInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.zcash.instance)
        );
        const zecAddress = AztecAddress.fromString(deployments.zcash.address);
        const zusdInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.zusd.instance)
        );
        const zusdAddress = AztecAddress.fromString(deployments.zusd.address);
        console.log("checking for usdc");
        if (!addressBook.find(({ item }) => item.equals(usdcAddress))) {
            console.log("registering usdc");
            await wallet.registerContract(
                usdcInstance,
                TokenContractArtifact
            );
        }
        if (!addressBook.find(({ item }) => item.equals(zecAddress))) {
            await wallet.registerContract(
                zecInstance,
                TokenContractArtifact
            );
        }
        if (!addressBook.find(({ item }) => item.equals(zusdAddress))) {
            await wallet.registerContract(
                zusdInstance,
                TokenContractArtifact
            );
        }
        // add oracle
        const oracleInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.priceOracle.instance)
        );
        const oracleAddress = AztecAddress.fromString(deployments.priceOracle.address);
        if (!addressBook.find(({ item }) => item.equals(oracleAddress))) {
            await wallet.registerContract(
                oracleInstance,
                MockPriceFeedContractArtifact
            );
        }

        // add debt pools
        const usdcDebtPoolInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.usdcDebtPool.instance)
        );
        const usdcDebtPoolAddress = AztecAddress.fromString(deployments.usdcDebtPool.address);
        const zecDebtPoolInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.zecDebtPool.instance)
        );
        const zecDebtPoolAddress = AztecAddress.fromString(deployments.zecDebtPool.address);
        if (!addressBook.find(({ item }) => item.equals(usdcDebtPoolAddress))) {
            await wallet.registerContract(
                usdcDebtPoolInstance,
                NocomLendingPoolV1ContractArtifact
            );
        }
        if (!addressBook.find(({ item }) => item.equals(zecDebtPoolAddress))) {
            await wallet.registerContract(
                zecDebtPoolInstance,
                NocomLendingPoolV1ContractArtifact
            );
        }

        // add stable pools
        const zecStablePoolInstance = ContractInstanceWithAddressSchema.parse(
            JSON.parse(deployments.stablePool.instance)
        );
        const zecStablePoolAddress = AztecAddress.fromString(deployments.stablePool.address);
        if (!addressBook.find(({ item }) => item.equals(zecStablePoolAddress))) {
            await wallet.registerContract(
                zecStablePoolInstance,
                NocomStablePoolV1ContractArtifact
            );
        }

        // return contracts
        console.log("successfully got contracts");
        return {
            oracle: await MockPriceFeedContract.at(oracleAddress, wallet),
            tokens: {
                usdc: await TokenContract.at(usdcAddress, wallet),
                zec: await TokenContract.at(zecAddress, wallet),
                zusd: await TokenContract.at(zusdAddress, wallet),
            },
            pools: {
                zecToUsdc: await NocomLendingPoolV1Contract.at(usdcDebtPoolAddress, wallet),
                usdcToZec: await NocomLendingPoolV1Contract.at(zecDebtPoolAddress, wallet),
            },
            stablePools: {
                zecToZusd: await NocomStablePoolV1Contract.at(zecStablePoolAddress, wallet),
            },
        };
    });
}