#!/usr/bin/env bun
import { existsSync, mkdirSync, readdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";

/**
 * Postinstall script to patch missing files in @aztec/cli package
 * This addresses a packaging bug in @aztec/cli@3.0.0-devnet.5
 */
async function patchAztecCli() {
  try {
    console.log("Running postinstall patches...");

    // Find all @aztec/cli installations in pnpm node_modules
    // pnpm stores packages as @aztec+cli@version instead of @aztec/cli
    const rootDir = join(import.meta.dir, "../../../");
    const pnpmDir = join(rootDir, "node_modules/.pnpm");

    if (!existsSync(pnpmDir)) {
      console.log("No .pnpm directory found, skipping patch");
      return;
    }

    const pnpmPackages = readdirSync(pnpmDir);
    const cliPackages = pnpmPackages.filter(pkg => pkg.startsWith("@aztec+cli@"));

    if (cliPackages.length === 0) {
      console.log("No @aztec/cli installations found, skipping patch");
      return;
    }

    for (const cliPackage of cliPackages) {
      const cliDir = join(pnpmDir, cliPackage, "node_modules/@aztec/cli");

      if (!existsSync(cliDir)) {
        continue;
      }

      const missingFilePath = join(cliDir, "public_include_metric_prefixes.json");

      // Check if the file is missing
      if (!existsSync(missingFilePath)) {
        console.log(`Creating missing file: ${missingFilePath}`);
        await writeFile(missingFilePath, "[]", "utf-8");
        console.log("✓ Patched @aztec/cli with missing public_include_metric_prefixes.json");
      } else {
        console.log("✓ public_include_metric_prefixes.json already exists, skipping");
      }
    }

    // Ensure artifacts directories exist
    const artifactsBase = join(import.meta.dir, "../src/artifacts");
    const artifactsDirs = [
      join(artifactsBase, "escrow"),
      join(artifactsBase, "pool"),
      join(artifactsBase, "price_oracle"),
    ];

    console.log("Ensuring artifacts directories exist...");
    for (const dir of artifactsDirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`✓ Created directory: ${dir}`);
      }
    }

    console.log("Postinstall patches completed successfully!");
  } catch (error) {
    console.error("Error running postinstall patches:", error);
    // Don't fail the install, just warn
    process.exit(0);
  }
}

if (import.meta.main) {
  await patchAztecCli();
}
