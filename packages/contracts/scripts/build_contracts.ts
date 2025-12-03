#!/usr/bin/env bun
import { dirname, join } from "path";
import { copyFileWithLog, replaceInFile, execCommand } from "./utils.ts";

// Handles compilation of aztec standards token contract and ensures artifacts are available
async function main() {
  try {
    // check if aztec-standards is present
    // Get the script directory equivalent (packages/contracts/scripts/../ = packages/contracts/)
    const scriptDir = dirname(import.meta.path);
    const contractsDir = join(scriptDir, "..");
    console.log(`Compiling nocom contracts...`);
    process.chdir(contractsDir);
    await execCommand("aztec-nargo", ["compile"]);
    await execCommand("aztec-postprocess-contract");
    // Generate bindings
    await execCommand("aztec", [
      "codegen",
      "./target/nocom_escrow-NocomEscrowV1.json",
      "-o", "./target", "-f"
    ]);
    await execCommand("aztec", [
      "codegen",
      "./target/nocom_lending_pool-NocomLendingPoolV1.json",
      "-o", "./target", "-f"
    ]);
    await execCommand("aztec", [
      "codegen",
      "./target/nocom_mock_price_oracle-MockPriceFeed.json",
      "-o", "./target", "-f"
    ]);
    await execCommand("aztec", [
      "codegen",
      "./target/nocom_stable_pool-NocomStablePoolV1.json",
      "-o", "./target", "-f"
    ]);
    await execCommand("aztec", [
      "codegen",
      "./target/nocom_stable_escrow-NocomStableEscrowV1.json",
      "-o", "./target", "-f"
    ])

    // copy the artifacts to the contracts artifacts dir
    console.log("Copying token artifacts...");
    const artifactsPath = join(scriptDir, "../ts/src/artifacts/");
    await copyFileWithLog(
      join(contractsDir, "target/nocom_escrow-NocomEscrowV1.json"),
      join(artifactsPath, "debt_escrow/NocomEscrow.json")
    );
    await copyFileWithLog(
      join(contractsDir, "target/NocomEscrowV1.ts"),
      join(artifactsPath, "debt_escrow/NocomEscrow.ts")
    );
    await copyFileWithLog(
      join(contractsDir, "target/nocom_lending_pool-NocomLendingPoolV1.json"),
      join(artifactsPath, "debt_pool/NocomLendingPool.json")
    );
    await copyFileWithLog(
      join(contractsDir, "target/NocomLendingPoolV1.ts"),
      join(artifactsPath, "debt_pool/NocomLendingPool.ts")
    );
    await copyFileWithLog(
      join(contractsDir, "target/nocom_mock_price_oracle-MockPriceFeed.json"),
      join(artifactsPath, "price_oracle/MockPriceFeed.json")
    );
    await copyFileWithLog(
      join(contractsDir, "target/MockPriceFeed.ts"),
      join(artifactsPath, "price_oracle/MockPriceFeed.ts")
    );
    await copyFileWithLog(
      join(contractsDir, "target/nocom_stable_pool-NocomStablePoolV1.json"),
      join(artifactsPath, "stable_pool/NocomStablePool.json")
    );
    await copyFileWithLog(
      join(contractsDir, "target/NocomStablePoolV1.ts"),
      join(artifactsPath, "stable_pool/NocomStablePool.ts")
    );
    await copyFileWithLog(
      join(contractsDir, "target/nocom_stable_escrow-NocomStableEscrowV1.json"),
      join(artifactsPath, "stable_escrow/NocomStableEscrow.json")
    );
    await copyFileWithLog(
      join(contractsDir, "target/NocomStableEscrowV1.ts"),
      join(artifactsPath, "stable_escrow/NocomStableEscrow.ts")
    );

    // fix imports in the copied bindings
    await replaceInFile(
      join(artifactsPath, "debt_escrow/NocomEscrow.ts"),
      "./nocom_escrow-NocomEscrowV1.json",
      "./NocomEscrow.json"
    );
    await replaceInFile(
      join(artifactsPath, "debt_pool/NocomLendingPool.ts"),
      "./nocom_lending_pool-NocomLendingPoolV1.json",
      "./NocomLendingPool.json"
    );
    await replaceInFile(
      join(artifactsPath, "price_oracle/MockPriceFeed.ts"),
      "./nocom_mock_price_oracle-MockPriceFeed.json",
      "./MockPriceFeed.json"
    );
    await replaceInFile(
      join(artifactsPath, "stable_pool/NocomStablePool.ts"),
      "./nocom_stable_pool-NocomStablePoolV1.json",
      "./NocomStablePool.json"
    );
    await replaceInFile(
      join(artifactsPath, "stable_escrow/NocomStableEscrow.ts"),
      "./nocom_stable_escrow-NocomStableEscrowV1.json",
      "./NocomStableEscrow.json"
    );
    console.log("Contract artifacts compiled!");
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}