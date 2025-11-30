#!/usr/bin/env bun
import { dirname, join } from "path";
import { existsSync } from "fs";
import { copyFileWithLog, replaceInFile, execCommand } from "./utils.ts";

// Handles compilation of aztec standards token contract and ensures artifacts are available
async function main() {
  try {
    // check if aztec-standards is present
    // Get the script directory equivalent (packages/contracts/scripts/../ = packages/contracts/)
    const scriptDir = dirname(import.meta.path);
    const aztecStandardsDir = join(scriptDir, "../deps/aztec-standards");
    if (!existsSync(aztecStandardsDir)) {
        console.log("Getting aztec-standards submodule...");
        process.chdir(join(scriptDir, ".."));
        await execCommand("git", ["submodule", "update", "--init", "--recursive"]);
        await execCommand("git", ["fetch", "--tags"], "deps/aztec-standards");
        await execCommand("git", ["checkout", "v3.0.0-devnet.2"], "deps/aztec-standards");
    }

    // check if token is already compiled
    const tokenArtifactDepsPath = join(aztecStandardsDir, "target/token_contract-Token.json");
    const tokenBindingsDepsPath = join(aztecStandardsDir, "target/Token.ts");
    if (existsSync(tokenArtifactDepsPath)) {
        console.log("Token contract already compiled, skipping build.");
        return;
    }
    console.log(`Building token contract...`);
    process.chdir(aztecStandardsDir);
    await execCommand("aztec-nargo", ["compile", "--package", "token_contract"]);
    await execCommand("aztec-postprocess-contract");
    await execCommand("aztec", [
      "codegen",
      "./target/token_contract-Token.json",
      "-o", "./target",
      "-f"
    ]);

    // copy the artifacts to the contracts artifacts dir
    console.log("Copying token artifacts...");
    const artifactsPath = join(scriptDir, "../packages/contracts/src/artifacts/token");
    const tokenArtifactPath = join(artifactsPath, "Token.json");
    const tokenBindingsPath = join(artifactsPath, "Token.ts");
    await copyFileWithLog(tokenArtifactDepsPath, tokenArtifactPath);
    await copyFileWithLog(tokenBindingsDepsPath, tokenBindingsPath);

    // fix imports in the copied bindings
    await replaceInFile(
      tokenBindingsPath,
      "./token_contract-Token.json",
      "./Token.json"
    );
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}